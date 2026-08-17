/**
 * ユースケース（アプリケーション層）。`create-room` / `join-room` / `check-room` と、
 * それらが共用する切り離し・join 完了処理を持つ。
 *
 * **依存はすべて引数で受け取る**（`docs/adr/0004` 決定 4）。以前は `server.ts` の
 * module 直下でアダプタを生成しており、in-process のテストが 1 件も書けなかった。
 * 偽のポートを渡してハンドラを直接呼べることが、この形にした理由である
 * （差し替えテストは `tests/create-sync-server.substitution.test.ts`）。
 *
 * **ここに Bun の型は出てこない。** 接続は {@link HandlerConnection}（送信口と
 * 接続ごとの状態だけ）として受け取る。`Bun.ServerWebSocket<ConnectionData>` は
 * 構造的にこれを満たすので、`adapters/ws-adapter.ts` はそのまま渡せる。
 */
import {
  applyAutoReveal,
  createRoom,
  findParticipantByToken,
  joinRoom,
  markConnected,
  markDisconnected,
  messageForRoomError,
  type ClientMessage,
  type ErrorCode,
  type Room,
} from '@tasuki/poker-core';
import type { RateLimiter } from '@tasuki/rate-limit';
import type { Broadcaster, RoomSocket } from '../ports/broadcaster';
import type { IdGen } from '../ports/id-gen';
import type { MonotonicClock } from '../ports/monotonic-clock';
import type { RoomStore } from '../ports/room-store';
import { createCommitRoomAction, createDispatch } from './commit-room-action';
import { createRateLimitGate } from './rate-limit-gate';

/**
 * ハンドラが接続に求めるものすべて。
 *
 * `data` は接続ごとの状態のうちハンドラが読み書きする 3 つだけを見る
 * （`connId` / `origin` / `clientKey` は WS アダプタの関心事なので出てこない）。
 * **Bun の型に依存させないのは、偽の接続を渡してハンドラを直接呼べるようにするため**
 * （`docs/adr/0004` 決定 4 の差し替え可能性）。
 */
export interface HandlerConnection extends RoomSocket {
  data: {
    participantId: string | null;
    roomId: string | null;
    /** レート制限の鍵（クライアント鍵。特定できなければ接続 ID）。 */
    rateKey: string;
  };
}

export interface HandlerDeps {
  store: RoomStore;
  broadcaster: Broadcaster;
  idGen: IdGen;
  clock: MonotonicClock;
  rateLimiter: RateLimiter;
  maxRooms: number;
}

/** 組み立て済みのユースケース群。WS アダプタと死活監視以外の入口はここに集まる。 */
export interface Handlers {
  handleCreateRoom(
    ws: HandlerConnection,
    msg: Extract<ClientMessage, { type: 'create-room' }>,
  ): void;
  handleJoinRoom(ws: HandlerConnection, msg: Extract<ClientMessage, { type: 'join-room' }>): void;
  handleCheckRoom(ws: HandlerConnection, msg: Extract<ClientMessage, { type: 'check-room' }>): void;
  detachFromCurrentRoom(ws: HandlerConnection): void;
  dispatch(ws: HandlerConnection, msg: ClientMessage): void;
  /** 衝突しないルーム ID を採る。衝突再試行を検証するため公開する（`docs/adr/0004` 決定 6）。 */
  generateRoomId(): string;
  /** エラー応答。WS アダプタもサイズ超過・パース失敗の応答に使う。 */
  sendError(ws: HandlerConnection, code: ErrorCode, message: string): void;
}

export function makeHandlers(deps: HandlerDeps): Handlers {
  const { store, broadcaster, idGen, clock, rateLimiter, maxRooms } = deps;

  /**
   * レート制限の判定順序はゲートが持つ（`application/rate-limit-gate.ts`）。
   * 渡す時計が単調でなければならない理由もそこに書いてある。
   */
  const rateLimitGate = createRateLimitGate({ clock, rateLimiter });

  /**
   * 衝突しないルーム ID を採る（research R4）。
   *
   * **再試行は方針であって I/O ではない**ので、ポートではなくここが持つ
   * （IdGen は候補を 1 つ返すだけ）。
   */
  function generateRoomId(): string {
    for (;;) {
      const id = idGen.roomIdCandidate();
      if (!store.has(id)) return id;
    }
  }

  function sendError(ws: HandlerConnection, code: ErrorCode, message: string): void {
    broadcaster.sendTo(ws, { type: 'error', code, message });
  }

  function sendJoined(
    ws: HandlerConnection,
    roomId: string,
    participantId: string,
    token: string,
  ): void {
    // token は本人宛の joined でのみ配信する（契約）
    broadcaster.sendTo(ws, { type: 'joined', roomId, participantId, token });
  }

  /**
   * 接続を現在のルームから切り離す共通処理（close と再 join/再 create で共用）。
   * connected 更新・ホスト繰上（FR-012）・自動公開の再評価（US4-AS1）・
   * 接続数 0 での即時破棄（FR-014）をここで一元的に行う。
   */
  function detachFromCurrentRoom(ws: HandlerConnection): void {
    const { participantId, roomId } = ws.data;
    ws.data.participantId = null;
    ws.data.roomId = null;
    if (participantId === null || roomId === null) return;
    const room = store.get(roomId);
    if (!room) {
      // **ルーム保管には無いのに接続レジストリには残っている経路がある。**
      // `handleJoinRoom` が「唯一の接続だった自分自身へ join-room を再送した」場合、
      // ルームは store から消えたまま joined だけが返り、以後この接続は
      // 到達不能なルームに attach されたままになる（下の handleJoinRoom のコメント参照）。
      // 分割前は socketsByRoom からも消えていて何も残らなかったので、
      // ここで接続レジストリ側も掃除して同じ状態に揃える。配信は行わない。
      broadcaster.detach(roomId, participantId, ws);
      return;
    }
    // 同一参加者が別ソケットで再接続済みなら（socket が入れ替わっていたら）何もしない
    if (!broadcaster.detach(roomId, participantId, ws)) return;

    if (broadcaster.countIn(roomId) === 0) {
      store.remove(roomId);
      return;
    }

    const updatedRoom = applyAutoReveal(markDisconnected(room, participantId));
    store.put(updatedRoom);
    broadcaster.broadcastSnapshot(roomId, updatedRoom);
  }

  /**
   * join 成功の完了処理（create / token 復帰 / 新規 join の3経路で共用）。
   * 順序に不変条件がある: socket 登録 → 接続状態の更新 → joined 送信 → 全員へ配信
   */
  function completeJoin(
    ws: HandlerConnection,
    room: Room,
    participantId: string,
    token: string,
  ): void {
    broadcaster.attach(room.id, participantId, ws);
    ws.data.participantId = participantId;
    ws.data.roomId = room.id;
    sendJoined(ws, room.id, participantId, token);
    broadcaster.broadcastSnapshot(room.id, room);
  }

  function handleCreateRoom(
    ws: HandlerConnection,
    msg: Extract<ClientMessage, { type: 'create-room' }>,
  ): void {
    // ルーム数の上限（Issue #63）。**切り離しより先に判定する**。
    // 先に離脱させてしまうと、拒否されたときに元のルームから追い出されたままになる。
    // 上限が止めるのは新規作成だけで、既存ルームへの参加は妨げない。
    if (store.count() >= maxRooms) {
      sendError(ws, 'server-busy', 'ルームの上限に達しています。しばらくしてからお試しください');
      return;
    }

    // すでに別ルームに参加中のソケット（二重送信・SPA 遷移）は先に切り離す
    detachFromCurrentRoom(ws);
    const ids = { participantId: idGen.participantId(), token: idGen.token() };
    const result = createRoom(generateRoomId(), msg.name, ids);
    if (result.isErr()) {
      sendError(ws, 'invalid-message', messageForRoomError(result.error));
      return;
    }
    const { room, participant } = result.value;
    store.put(room);
    // 新しいルームの接続レジストリは**作り直す**（旧 socketsByRoom.set(room.id, new Map())
    // の復元）。attach は既存の集合を再利用するため、これが無いと到達不能なルームに
    // 残った接続が同一 ID 再採番で別ルームの配信を受ける。
    //
    // **この 3 行（store.put → resetRoom → completeJoin の attach）は分離してはならない。**
    // 間に await や別のハンドラへの復帰を挟むと、「store にはあるのに接続レジストリには
    // 無い」ルームが外から観測されうるようになる。`handleJoinRoom` と `commitRoomAction`
    // が `!sockets` ガードを持たずに `store.get` の結果だけで進めるのは、この状態が
    // 同期区間に閉じていて誰にも観測できないことが根拠である。崩れると、配信先が空の
    // ままルームが更新されたり、join が room-not-found を返さずに素通りしたりする。
    //
    // **この不変条件は組み立てを create-sync-server.ts へ移しても変わらない。**
    // 3 行はこの関数の中に閉じたままであり、間に非同期の境界は無い。
    broadcaster.resetRoom(room.id);
    completeJoin(ws, room, participant.id, ids.token);
  }

  function handleJoinRoom(
    ws: HandlerConnection,
    msg: Extract<ClientMessage, { type: 'join-room' }>,
  ): void {
    // **ルームを照会する前に判定する。** 逆順だと、残量が無いときに room-not-found が返り、
    // 攻撃者はトークンを消費せずにルーム ID の存在確認を続けられる。順序をゲートが
    // 型で強制している（`application/rate-limit-gate.ts`。渡す時計が単調でなければ
    // ならない理由もそこにある）。
    const rateLimit = rateLimitGate.begin(ws.data.rateKey);
    if (rateLimit.rejected) {
      sendError(ws, 'rate-limited', '試行が多すぎます。しばらくしてからお試しください');
      return;
    }

    const room = store.get(msg.roomId);
    if (!room) {
      rateLimit.consumeOnMiss();
      sendError(ws, 'room-not-found', 'ルームが見つかりません');
      return;
    }

    // 参加先の存在を確認してから、参加中の別ルームを切り離す（二重送信・SPA 遷移対策）
    detachFromCurrentRoom(ws);

    // **上の detach で自分自身がこのルーム唯一の接続だった場合、ルームは既にレジストリから
    // 消えている**（`detachFromCurrentRoom` の countIn(roomId) === 0 分岐。store と
    // Broadcaster の接続レジストリの両方から削除済み）。
    //
    // 分割前（旧実装）は room ＋ sockets が単一の可変 RoomEntry オブジェクトで、
    // detach 後もこの関数はその同じオブジェクトを参照し続けるだけで、
    // レジストリへの書き戻しは一度も行っていなかった。
    //
    // ここで安易に `store.put` すると、**store にだけルームが復活し、
    // Broadcaster 側には対応する接続が無い「到達不能なルーム」が残る。**
    // `handleCreateRoom` の上限判定は `store.count()` を見るため、この到達不能な
    // ルームが maxRooms の枠を永久に食い潰す（#165 レビューで発見。回帰テストは
    // tests/guards.test.ts の「自分自身への join-room 再送で〜」）。
    //
    // よって、detach でレジストリから消えていたら **書き戻さない**。当人には
    // 通常どおり joined が返るがルームはレジストリから見えなくなる、という
    // この経路自体が元から持つ欠陥（振る舞い）は、本 PR ではあえて直さない
    // （振る舞い不変が最上位制約のため）。別途 Issue 化して直す。
    const stillRegistered = store.has(msg.roomId);

    // **detach はこのルームを更新していることがある**（切断者への markDisconnected、
    // およびそれによる shouldAutoReveal 成立時の自動公開。detachFromCurrentRoom の
    // countIn(roomId) !== 0 分岐）。分割前（旧実装）は room が単一の可変オブジェクトの
    // フィールドだったため、detach の更新はこの関数から自動的に見えていた。
    // 値として持ち回す今の形では、detach 前に取得した `room` を読み直さずに使うと、
    // 古いスナップショットを書き戻して自動公開を消してしまう（#165 レビューで発見。
    // 回帰テストは tests/voting.test.ts の「自動公開は join-room の再送で消えない」）。
    //
    // よって detach の後にレジストリから読み直す。**`?? room` のフォールバックは、
    // 上の「唯一の接続だった」場合と挙動を合わせるためのもの**である。その場合
    // レジストリには何も残っていないが、旧実装の detach も接続が 0 になる
    // 分岐では entry.room を一切更新せずに return していたため、detach 前の
    // スナップショット（＝ここでの `room`）を使うのが正しい。
    const current = store.get(msg.roomId) ?? room;

    // token 照合による同一参加者の復帰（FR-013）。一致すれば name は無視する
    const existing =
      msg.token !== undefined ? findParticipantByToken(current, msg.token) : undefined;
    if (existing) {
      const updatedRoom = markConnected(current, existing.id);
      if (stillRegistered) store.put(updatedRoom);
      completeJoin(ws, updatedRoom, existing.id, existing.token);
      return;
    }

    const ids = { participantId: idGen.participantId(), token: idGen.token() };
    const result = joinRoom(current, msg.name, ids);
    if (result.isErr()) {
      sendError(ws, 'invalid-message', messageForRoomError(result.error));
      return;
    }
    if (stillRegistered) store.put(result.value.room);
    completeJoin(ws, result.value.room, result.value.participant.id, ids.token);
  }

  /**
   * ルームの生死だけを返す（#76 J-1）。
   *
   * **無いときだけ応える。** 生存を伝える新しいメッセージは足さない。
   * 画面は「参加フォームを出しておき、無いと分かったらエラー表示へ切り替える」形で、
   * 無音＝生きているとして扱えば足りるため。
   *
   * 読み取りだけなので `detachFromCurrentRoom` は呼ばない。呼ぶと、参加中の人が
   * 別の招待リンクの生死を尋ねただけで自分のルームから外れてしまう。
   *
   * **#103 で約束が 1 つ変わった。** レート制限に掛かると `rate-limited` を返すため、
   * 無音の意味は「生きている」から「生きている、または拒否された」になった。
   * 画面は参加フォームを出しておく作りなので、どちらでも待たせるだけで済む。
   */
  function handleCheckRoom(
    ws: HandlerConnection,
    msg: Extract<ClientMessage, { type: 'check-room' }>,
  ): void {
    // join と同じ順序（照会より前に判定）。ゲートが順序を持つ。
    const rateLimit = rateLimitGate.begin(ws.data.rateKey);
    if (rateLimit.rejected) {
      sendError(ws, 'rate-limited', '試行が多すぎます。しばらくしてからお試しください');
      return;
    }

    if (!store.has(msg.roomId)) {
      rateLimit.consumeOnMiss();
      sendError(ws, 'room-not-found', 'ルームが見つかりません');
    }
  }

  const commitRoomAction = createCommitRoomAction({ store, broadcaster, sendError });

  const dispatch = createDispatch({
    handleCreateRoom,
    handleJoinRoom,
    handleCheckRoom,
    commitRoomAction,
  });

  return {
    handleCreateRoom,
    handleJoinRoom,
    handleCheckRoom,
    detachFromCurrentRoom,
    dispatch,
    generateRoomId,
    sendError,
  };
}
