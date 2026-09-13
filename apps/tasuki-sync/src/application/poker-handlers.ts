/**
 * ユースケース（アプリケーション層）。`create-room` / `join-room` / `check-room` と、
 * それらが共用する切り離し・join 完了処理を持つ。
 *
 * **依存はすべて引数で受け取る**（`docs/adr/0004` 決定 2・3。アダプタはポートの型で
 * 注入し、ユースケースはポートにのみ依存する）。以前は `server.ts` の
 * module 直下でアダプタを生成しており、in-process のテストが 1 件も書けなかった。
 * 偽のポートを渡してハンドラを直接呼べることが、この形にした理由である
 * （差し替えテストは `test/poker/create-sync-server.substitution.test.ts`）。
 *
 * **ここに Bun の型は出てこない。** 接続は {@link HandlerConnection}（送信口と
 * 接続ごとの状態だけ）として受け取る。`Bun.ServerWebSocket<ConnectionData>` は
 * 構造的にこれを満たすので、WS アダプタはそのまま渡せる。
 * **アダプタは統合後 1 本しかない**（`src/adapters/ws-adapter.ts`。timer と共有する接続層で、
 * poker 側の `adapters/` にはもう置いていない。#95 S2）。
 *
 * ## #95 S4a: 名簿が timer と 1 つになった
 *
 * poker が持っていた `Room` / `Participant` は消えた。いま poker の状態は次の 3 つに割れる。
 *
 *   - **名簿** — `RoomStore`（`../../ports/room-store.ts`。`@tasuki/room-core` の `Room`）。
 *     **timer とまったく同じインスタンス**である（`create-sync-server.ts` が配線する）
 *   - **ラウンド** — `RoundStore`（`../ports/round-store.ts`。`@tasuki/poker-core` の `Round`）
 *   - **復帰トークン** — `TokenStore`（`../../application/token-store.ts`。これも timer と共有）
 *
 * 3 つはルームコードで突き合わせる。**片方だけ書いて配信する形を作らない** ——
 * 保管と配信は {@link makeHandlers} 内の `commit` 1 本に閉じてある（timer 側の
 * `application/handlers.ts` と同じ規律）。
 *
 * ## 表示名の規約は timer / ハブと共有する（#95 S5b）
 *
 * poker が持っていた自前の規約（`packages/poker-core/src/name.ts` の 24 文字）は落とし、
 * `application/display-name-rule.ts` を通す。**ハブで名乗った名前が poker へ届くのは
 * S5b から**なので、食い違いはこの段で実害に変わる。
 *
 * ## 越境の遮断は合言葉の関門が担う（#95 S5b）
 *
 * 名簿が 1 つになったことで、**ルームコードの空間が両ツールで共有された**。
 * S4a〜S5a は入口ごとの門（「poker のラウンドがあるルームにだけ入れる」）で止めていたが、
 * **S5b でツール状態を遅延生成にした**（D8）ので、ラウンドの有無は参加の可否を意味しなくなった。
 *
 * いま止めているのは `handleJoinRoom` / `handleCheckRoom` が通す**合言葉の関門**
 * （`../application/room-entry.ts`）である。**poker の wire には合言葉の項目が無い**ので、
 * 保護ルームへの poker からの新規参加は成立しない —— 「存在しないルーム」と完全に同じ応答
 * （`room-not-found`・同じ文言・同じレート制限の積算）で拒む（`docs/adr/0011`）。
 * 選択画面で合言葉を通った人は復帰の組を持っているので、そのまま入れる。
 */
import {
  applyAutoReveal,
  createRound,
  discardVote,
  type ClientMessage,
  type ErrorCode,
  type ParticipantFragment,
  type Round,
} from '@tasuki/poker-core';
import {
  addParticipant,
  attachConnection,
  findParticipant,
  isPresentIn,
  removeConnection,
  type Room as MembershipRoom,
} from '@tasuki/room-core';
import { checkPassphrase, findResumableParticipant } from './room-entry.js';
import type { RateLimiter } from '@tasuki/rate-limit';
import type { Clock } from '../ports/clock.js';
import type { RoomStore } from '../ports/room-store.js';
import type { HubBroadcaster } from '../ports/hub-broadcaster.js';
import { saveRoster } from './save-roster.js';
import { applyDisplayNameRule, INVALID_DISPLAY_NAME_MESSAGE } from './display-name-rule.js';
import type { TokenStore } from './token-store.js';
import type { Broadcaster, RoomSocket } from '../ports/poker-broadcaster.js';
import type { IdGen } from '../ports/poker-id-gen.js';
import type { MonotonicClock } from '../ports/poker-monotonic-clock.js';
import type { RoundStore } from '../ports/poker-round-store.js';
import { TOOL_POKER } from './tool-id.js';
import { createCommitRoomAction, createDispatch } from './poker-commit-room-action.js';
import { createRateLimitGate } from './poker-rate-limit-gate.js';

/**
 * ハンドラが接続に求めるものすべて。
 *
 * `data` は接続ごとの状態のうちハンドラが読み書きするものだけを見る
 * （`origin` / `clientKey` は WS アダプタの関心事なので出てこない）。
 * **Bun の型に依存させないのは、偽の接続を渡してハンドラを直接呼べるようにするため**
 * （`docs/adr/0004` の根拠が挙げた「テスト時にアダプタを差し替えられる構成」）。
 *
 * `connId` は #95 S4a で加わった。名簿（`@tasuki/room-core` の `Participant`）が
 * 在席中の接続を `connId` で持つため、参加・復帰のたびに書き込む必要がある。
 * **poker の配信そのものは参加者 ID を鍵にした独自レジストリで行う**ので、
 * この値を読むのは名簿の側だけである。
 */
export interface HandlerConnection extends RoomSocket {
  data: {
    connId: string;
    participantId: string | null;
    roomId: string | null;
    /** レート制限の鍵（クライアント鍵。特定できなければ接続 ID）。 */
    rateKey: string;
  };
}

export interface HandlerDeps {
  /**
   * 名簿の保管。**timer と同じインスタンスである**（#95 S4a）。
   * 保管するのは `@tasuki/room-core` の `Room` で、poker 固有の情報は入っていない。
   */
  store: RoomStore;
  /** poker の状態（投票ラウンド）の保管。名簿とはルームコードで対になる。 */
  rounds: RoundStore;
  /**
   * 復帰トークンの発行と照会。**timer と同じインスタンスである**（#95 S4a）。
   * 旧 `Participant.token` と `findParticipantByToken` の引っ越し先。
   */
  tokens: TokenStore;
  broadcaster: Broadcaster;
  /**
   * 選択画面（ハブ）への配信（#95 S5a）。**poker 用の `broadcaster` とは別物**である ——
   * あちらはラウンドを配り、こちらは名簿を配る。poker の入口で名簿が変わったことも
   * 選択画面へ届ける必要があるので、ここでも受け取る。
   */
  hub: HubBroadcaster;
  idGen: IdGen;
  /** レート制限の窓の計測に使う単調時計。**壁時計ではない**（`ports/monotonic-clock.ts`）。 */
  clock: MonotonicClock;
  /**
   * 壁時計（epoch ms）。名簿の `createdAt` / `joinedAt` に入れる。
   *
   * **単調時計を流用してはならない。** 名簿は timer と共有する 1 つの保管であり、
   * 別系統の値が混ざると 2 つのルームの時刻が比較できなくなる。
   */
  wallClock: Clock;
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
  /**
   * 名簿から人が消えたときに、その人の票を捨てる（R8・#95 S5b）。
   *
   * 呼ぶのは timer の入口（`command-handlers/participant-remove.ts`）である ——
   * 退出は**ルームの出来事**であって poker の出来事ではないので、poker の wire には
   * 対応するコマンドが無い。配線は `create-sync-server.ts` が繋ぐ。
   */
  handleParticipantRemoved(roomCode: string, participantId: string): void;
  dispatch(ws: HandlerConnection, msg: ClientMessage): void;
  /** 衝突しないルーム ID を採る。**衝突再試行を差し替えテストで検証するため公開する。** */
  generateRoomId(): string;
  /** エラー応答。WS アダプタもサイズ超過・パース失敗の応答に使う。 */
  sendError(ws: HandlerConnection, code: ErrorCode, message: string): void;
}

/** 1 ルームぶんの poker の状態一式（名簿とラウンド）。 */
export interface RoomState {
  room: MembershipRoom;
  round: Round;
}

export function makeHandlers(deps: HandlerDeps): Handlers {
  const {
    store,
    rounds,
    tokens,
    broadcaster,
    idGen,
    clock,
    wallClock,
    rateLimiter,
    maxRooms,
  } = deps;

  /**
   * レート制限の判定順序はゲートが持つ（`application/rate-limit-gate.ts`）。
   * 渡す時計が単調でなければならない理由もそこに書いてある。
   */
  const rateLimitGate = createRateLimitGate({ clock, rateLimiter });

  /**
   * 名簿を poker-core が読める断片へ写す（#95 S4a）。
   *
   * **`@tasuki/poker-core` は `@tasuki/room-core` を知らない**（依存方向の許可表・
   * 設計正本 D2）。向こうは `{ id, name, connected }` という構造的型で受けるので、
   * 語彙の差（`displayName` / 接続の集まり）はここで吸収する。
   *
   * **`connected` は「poker に在席しているか」である**（#95 S4b・D4）。
   * `presenceOf`（どこかに繋いでいるか）ではない —— 選択画面のタブだけを開いている人を
   * 「繋いでいる」と数えると、その人の未投票が永久に埋まらず自動公開が来ない。
   * S4a までは `presence !== "offline"` で、当時は poker の接続しか持てなかったので
   * 同値だった。
   */
  function fragmentsOf(room: MembershipRoom): ParticipantFragment[] {
    return room.participants.map((p) => ({
      id: p.id,
      name: p.displayName,
      connected: isPresentIn(p, TOOL_POKER),
    }));
  }

  /**
   * 1 ルームの状態一式を読む。**名簿が無ければ「そのルームは無い」**。
   *
   * **ラウンドが無い名簿には、その場で空のラウンドを与える —— これが D8 の遅延生成である**
   * （#95 S5b）。生まれたラウンドは `commit` が保管へ書く（参加が成立したときだけ書かれ、
   * `handleCheckRoom` のような読み取りでは書かれない）。
   *
   * ⚠ **この関数は関門ではない。** 名簿は timer と 1 つなので、timer の入口で作られた
   * ルームコードを渡してもここは状態を返す。越境を止めるのは合言葉の関門
   * （`room-entry.ts`）を通す `handleJoinRoom` / `handleCheckRoom` の側で、
   * ここへ判定を書き足すと 2 箇所へ散る。
   */
  function loadState(roomId: string): RoomState | undefined {
    const room = store.get(roomId);
    if (!room) return undefined;
    return { room, round: rounds.get(roomId) ?? createRound() };
  }

  /**
   * その参加が合言葉の関門を通るか（#95 S5b）。
   *
   * **poker は合言葉を送れない**ので、保護ルームへ入れるのは「一度その関門を通った人」＝
   * 有効な復帰の組を持っている人だけである。判定そのものは timer の入口と同じ
   * `room-entry.ts` が持つ（写しを 2 つ持つと片方だけが直る）。
   */
  function mayEnter(
    room: MembershipRoom,
    roomId: string,
    token: string | undefined,
  ): boolean {
    if (findResumableParticipant(tokens, room, roomId, token) !== undefined) return true;
    return checkPassphrase(tokens.getPassphrase(roomId), undefined).isOk();
  }

  /**
   * 更新した状態を保管し、スナップショットを配信する（#95 S4a）。
   *
   * **wire の形を組む場所を 1 つにする。** 保管が 2 つに割れた以上、片方だけ put して
   * もう片方を配信する取り違えが起こりうる。両方の put と配信をここへ束ねてある
   * （timer 側の `application/handlers.ts` の `commit` と同じ規律）。
   */
  function commit(state: RoomState): void {
    // 名簿の保管とハブへの配信は対にする（`save-roster.ts`・#95 S5a）。
    saveRoster({ store, hub: deps.hub }, state.room);
    rounds.put(state.room.code, state.round);
    broadcaster.broadcastSnapshot(state.room.code, state.round, fragmentsOf(state.room));
  }

  /**
   * 衝突しないルーム ID を採る（research R4）。
   *
   * **再試行は方針であって I/O ではない**ので、ポートではなくここが持つ
   * （IdGen は候補を 1 つ返すだけ）。**名簿は timer と共有なので、timer の
   * ルームコードとも衝突しない**（#95 S4a で自動的にそうなった）。
   */
  function generateRoomId(): string {
    for (;;) {
      const id = idGen.roomIdCandidate();
      if (store.get(id) === undefined) return id;
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
   * presence 更新と自動公開の再評価（US4-AS1）をここで一元的に行う。
   *
   * かつてはホスト繰上（旧 FR-012）もここが担っていたが、#95 S3 でホストの概念ごと
   * 廃止した（poker-core からホスト継承ロジックを撤去）。
   * **接続数 0 での即時破棄（旧 FR-014）も #95 S4a で撤去した**（下の注記）。
   */
  function detachFromCurrentRoom(ws: HandlerConnection): void {
    const { participantId, roomId } = ws.data;
    ws.data.participantId = null;
    ws.data.roomId = null;
    if (participantId === null || roomId === null) return;
    const state = loadState(roomId);
    if (!state) {
      // **ルーム保管には無いのに接続レジストリには残っている接続**への備え。
      // #171 を直すまでは `handleJoinRoom` がこの状態を作っていた（唯一の接続が
      // 同じルームへ join-room を再送すると、ルームが破棄されたまま joined だけが
      // 返り、その接続は到達不能なルームに attach されたままになっていた）。
      // 今この状態を作る経路は無いが、残ると接続レジストリに恒久的に溜まるので、
      // ここで掃除して分割前（socketsByRoom からも消えていた）と同じ状態に揃える。
      // 配信は行わない。
      broadcaster.detach(roomId, participantId, ws);
      return;
    }
    // 同一参加者が別ソケットで再接続済みなら（socket が入れ替わっていたら）何もしない
    if (!broadcaster.detach(roomId, participantId, ws)) return;

    // #95 S4a: 最後の接続が切れた瞬間の破棄をやめた。ルームの寿命は room-reclaimer の
    // TTL と participant.remove の在室者 0 判定に一本化されている（R10・D8）。
    // 保管が 1 つになったため、ここで消すと越境した timer のルームまで巻き添えになる。
    //
    // **利用者から見える変更である**（全員がタブを閉じても TTL の間はルームが残り、
    // 戻れば票も残る）。旧 FR-014 を前提にしていたテストは、その規則ごと
    // `test/poker/reconnect.test.ts` と `test/room-lifecycle.test.ts` へ移した。
    //
    // ここに「接続数 0 なら…」の判定を書き足さないこと。書き足した瞬間に破棄経路が
    // 2 本に戻り、`application/destroy-room.ts` の冒頭が禁じている「契機ごとに
    // 後始末を並べ直す」状態（4 つの取りこぼし）が復活する。

    // **名簿からこの接続だけを外す**（#95 S4b）。同じ人の別タブが残っていれば
    // `connected` は真のままである。票はラウンド側に残る —— 保管が別なので、
    // 名簿を触っても票には触れないことが構造で保証される。
    const room = removeConnection(state.room, ws.data.connId);
    commit({ room, round: applyAutoReveal(state.round, fragmentsOf(room)) });
  }

  /**
   * join 成功の完了処理（create / token 復帰 / 新規 join の3経路で共用）。
   * 順序に不変条件がある: socket 登録 → 接続状態の更新 → joined 送信 → 保管と配信
   *
   * `persist` が false のときは配信だけ行い、保管しない。**書き戻すと保管にだけ
   * ルームが復活し、Broadcaster 側に接続が無い「到達不能なルーム」が `maxRooms` の枠を
   * 永久に食い潰す**（#165 レビューで発見）。判断は {@link handleJoinRoom} が持つ。
   *
   * ⚠ **S4a 以降、`persist` に false が渡る経路は無い**（理由は {@link handleJoinRoom} の
   * `stillRegistered` の注記）。引数を残す理由もそこにある。
   */
  function completeJoin(
    ws: HandlerConnection,
    state: RoomState,
    participantId: string,
    token: string,
    persist = true,
  ): void {
    const roomId = state.room.code;
    broadcaster.attach(roomId, participantId, ws);
    ws.data.participantId = participantId;
    ws.data.roomId = roomId;
    sendJoined(ws, roomId, participantId, token);
    if (persist) {
      commit(state);
      return;
    }
    broadcaster.broadcastSnapshot(roomId, state.round, fragmentsOf(state.room));
  }

  /** 名簿へ新しい参加者を足し、復帰トークンを発行する（create / join で共用）。 */
  function admit(
    room: MembershipRoom,
    connId: string,
    displayName: string,
  ): { room: MembershipRoom; participantId: string; token: string } {
    const participantId = idGen.participantId();
    const token = idGen.token();
    const updated = addParticipant(room, {
      id: participantId,
      displayName,
      connections: new Map([[connId, TOOL_POKER]]),
      joinedAt: wallClock.now(),
    });
    tokens.issueResume(token, { participantId, roomCode: room.code });
    return { room: updated, participantId, token };
  }

  function handleCreateRoom(
    ws: HandlerConnection,
    msg: Extract<ClientMessage, { type: 'create-room' }>,
  ): void {
    // ルーム数の上限（Issue #63）。**切り離しより先に判定する**。
    // 先に離脱させてしまうと、拒否されたときに元のルームから追い出されたままになる。
    // 上限が止めるのは新規作成だけで、既存ルームへの参加は妨げない。
    //
    // **#95 S4a で数える対象が「poker のルーム」から「名簿にあるルーム全部」に変わった**
    // （timer と同じ保管を見るため）。枠を決め直すのは越境の遮断と同じ段の仕事である。
    if (store.list().length >= maxRooms) {
      sendError(ws, 'server-busy', 'ルームの上限に達しています。しばらくしてからお試しください');
      return;
    }

    // すでに別ルームに参加中のソケット（二重送信・SPA 遷移）は先に切り離す
    detachFromCurrentRoom(ws);
    const name = applyDisplayNameRule(msg.name);
    if (name.isErr()) {
      sendError(ws, 'invalid-message', INVALID_DISPLAY_NAME_MESSAGE);
      return;
    }
    const roomId = generateRoomId();
    const empty: MembershipRoom = {
      code: roomId,
      createdAt: wallClock.now(),
      participants: [],
    };
    const admitted = admit(empty, ws.data.connId, name.value);
    // 新しいルームの接続レジストリは**作り直す**（旧 socketsByRoom.set(room.id, new Map())
    // の復元）。attach は既存の集合を再利用するため、これが無いと到達不能なルームに
    // 残った接続が同一 ID 再採番で別ルームの配信を受ける。
    //
    // **この 2 行（resetRoom → completeJoin の attach と commit）は分離してはならない。**
    // 間に await や別のハンドラへの復帰を挟むと、「保管にはあるのに接続レジストリには
    // 無い」ルームが外から観測されうるようになる。`handleJoinRoom` と `commitRoomAction`
    // が `!sockets` ガードを持たずに `store.get` の結果だけで進めるのは、この状態が
    // 同期区間に閉じていて誰にも観測できないことが根拠である。崩れると、配信先が空の
    // ままルームが更新されたり、join が room-not-found を返さずに素通りしたりする。
    //
    // **この不変条件は組み立てを create-sync-server.ts へ移しても変わらない。**
    // 2 行はこの関数の中に閉じたままであり、間に非同期の境界は無い。
    broadcaster.resetRoom(roomId);
    completeJoin(
      ws,
      { room: admitted.room, round: createRound() },
      admitted.participantId,
      admitted.token,
    );
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

    // 名簿に無いルームは「無い」。ラウンドが無いだけのルームは**遅延生成で入れる**
    // （#95 S5b・D8。S5a までここに入口ごとの門があった）。
    const state = loadState(msg.roomId);
    // **合言葉の関門**（`../application/room-entry.ts`）。poker の wire には合言葉の項目が
    // 無いので、保護ルームへ新規に入ることはできない。**選択画面で合言葉を通った人は
    // 復帰の組を持っている**ので、そちらで入れる（timer の入口と同じ規律）。
    //
    // 応答（コード・文言）もレート制限の積算も、存在しないルームと**同一の 1 経路**を
    // 通す。分けて書くと、いつか片方だけが変わって列挙の手がかりになる（ADR 0011）。
    if (!state || !mayEnter(state.room, msg.roomId, msg.token)) {
      rateLimit.consumeOnMiss();
      sendError(ws, 'room-not-found', 'ルームが見つかりません');
      return;
    }

    // **既にこのルームに居る接続からの再送は冪等に扱う（#171）。切り離してはならない。**
    // かつては、自分がこのルーム唯一の接続だと下の detachFromCurrentRoom が接続数 0 の
    // 分岐に入ってルームを破棄し（旧 FR-014）、それでも joined を返していた。以後その接続は
    // 存在しないルームに attach されたままになり、vote / reveal / next-round は
    // commitRoomAction の store.get で落ちる（#171 の前は無応答。今は room-not-found を返す）。
    //
    // **#95 S4a で即時破棄そのものが無くなったが、この分岐は残す。** 破棄されなくなっても、
    // 切り離せば自分の presence が offline になり参加者 ID も付け替わる —— 再送のたびに
    // 別人として名簿へ積まれる。冪等であることは #171 とは独立に要る性質である。
    //
    // **token は見ない。** 既にこのルームに居る接続の identity はソケット側が正である
    // （画面が添えてくるのは自分自身の token なので、照合しても結果は変わらない）。
    // 別ソケットからの token 復帰（FR-013）はこの分岐に入らないので影響を受けない。
    const self =
      ws.data.roomId === msg.roomId && ws.data.participantId !== null
        ? findParticipant(state.room, ws.data.participantId)
        : undefined;
    if (self !== undefined) {
      // 返す token は**発行済みのものそのもの**である。新しく発行し直すと、画面が
      // localStorage に持っている token が黙って古くなる（再送のたびに変わる）。
      const issued = tokens.findResumeToken(msg.roomId, self.id);
      if (issued !== undefined) {
        completeJoin(ws, state, self.id, issued);
        return;
      }
      // トークンだけが失われている状態（作る経路は無い）。identity を失わせるより、
      // 発行し直して同じ参加者のまま続けるほうが利用者の損失が小さい。
      const token = idGen.token();
      tokens.issueResume(token, { participantId: self.id, roomCode: msg.roomId });
      completeJoin(ws, state, self.id, token);
      return;
    }

    // 参加先の存在を確認してから、参加中の別ルームを切り離す（二重送信・SPA 遷移対策）
    detachFromCurrentRoom(ws);

    // 以下の 2 つは、**detach が参加先のルームそのものを消した場合**への備えだった。
    //
    // ⚠ **S4a で構造的に到達しなくなった。** 旧 FR-014（接続数 0 での即時破棄）を撤去した
    // 結果、`detachFromCurrentRoom` はルームを保管から消さない（上のその関数の注記）。
    // 直前に存在を確認したルームは detach を跨いでも保管に残るので、`stillRegistered` は
    // **常に true**、`?? state` の右辺は**常に評価されない**。#165 の欠陥を作っていた
    // 即時破棄は、もう無い。
    //
    // **それでも残す。** S5 でツール状態の遅延生成が入ると、「ルームが保管に居ない瞬間」が
    // また現れて両方とも再び到達しうるためである（このガードを落とすと #165 の欠陥ごと
    // 戻ってくる）。当時の理由は次のとおり ——
    //
    // - stillRegistered: detach でレジストリから消えていたら **書き戻さない**。
    //   書き戻すと保管にだけルームが復活し、Broadcaster 側に接続が無い
    //   「到達不能なルーム」が maxRooms の枠を永久に食い潰す（#165 レビューで発見）。
    // - `?? state` の読み直し: detach は切断者の presence 更新と、それによる自動公開で
    //   このルームを更新していることがある。読み直さずに detach 前のスナップショットを
    //   書き戻すと自動公開が消える（#165 レビューで発見）。
    const current = loadState(msg.roomId);
    const stillRegistered = current !== undefined;
    const live = current ?? state;

    // token 照合による同一参加者の復帰（FR-013）。一致すれば name は無視する。
    //
    // **判定は `../application/room-entry.ts` が持つ**（#95 S5b）。timer の入口と同じ
    // 関数を通す —— 2 つの入口で判定の形が違うと、片方だけが直る。
    const presented = msg.token;
    const existing = findResumableParticipant(tokens, live.room, msg.roomId, presented);
    if (existing !== undefined && presented !== undefined) {
      // **接続を足す。前の接続を奪わない**（#95 S4b・D14）。
      const room = attachConnection(live.room, existing.id, ws.data.connId, TOOL_POKER);
      completeJoin(ws, { ...live, room }, existing.id, presented, stillRegistered);
      return;
    }

    const name = applyDisplayNameRule(msg.name);
    if (name.isErr()) {
      sendError(ws, 'invalid-message', INVALID_DISPLAY_NAME_MESSAGE);
      return;
    }
    const admitted = admit(live.room, ws.data.connId, name.value);
    completeJoin(
      ws,
      { ...live, room: admitted.room },
      admitted.participantId,
      admitted.token,
      stillRegistered,
    );
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

    // **join と同じ関門を通す**（#95 S5b）。名簿の有無だけを答えると、この関数は
    // 「入れないルームが実在するか」を教える神託になる。
    //
    // **ここではラウンドを作らない。** 読み取りだけの問い合わせで状態が生まれると、
    // 誰も入っていないルームに poker のラウンドが積み上がる。
    const room = store.get(msg.roomId);
    if (!room || !mayEnter(room, msg.roomId, undefined)) {
      rateLimit.consumeOnMiss();
      sendError(ws, 'room-not-found', 'ルームが見つかりません');
    }
  }

  /**
   * 名簿から消えた人の票を捨てて配信し直す（R8・#95 S5b）。
   *
   * **ラウンドが無ければ何もしない。** ここで遅延生成すると、poker を誰も開いていない
   * ルームに、退出しただけでラウンドが生まれる（D8 は「そのツールへ入ったとき」に作る）。
   *
   * 名簿は**呼び出し側が更新し終えた後**のものを読む。捨てた結果で自動公開が立つことが
   * あるので（残った全員が投票済みになる）、`applyAutoReveal` を通してから配信する。
   */
  function handleParticipantRemoved(roomCode: string, participantId: string): void {
    const round = rounds.get(roomCode);
    const room = store.get(roomCode);
    if (round === undefined || room === undefined) return;

    const discarded = discardVote(round, participantId);
    commit({ room, round: applyAutoReveal(discarded, fragmentsOf(room)) });
  }

  const commitRoomAction = createCommitRoomAction({ loadState, commit, fragmentsOf, sendError });

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
    handleParticipantRemoved,
    dispatch,
    generateRoomId,
    sendError,
  };
}
