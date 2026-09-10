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
 * ## ⚠ この段は単独で main へ入れてもデプロイしてもいけない
 *
 * 名簿を 1 つにした一方で、**入口の門（越境の遮断）と寿命の一本化がまだ入っていない**。
 * その間だけ、timer のルームコードを poker の入口へ与えると次の 4 つが同時に成立する
 * （「入れてしまう」で済む話ではない）。**1 と 2 は 2026-09-10 に実機の WS で実測した。
 * 3 と 4 は経路をコードで確かめたもので、実機では再現していない。**
 *
 * 1. **合言葉の検査を一度も通らずに timer の snapshot を受信できる。**
 *    ここで名簿へ足す参加者は実在の `connId` を持ち `presence: "online"` なので、
 *    timer 側の配信（`create-sync-server.ts` の `broadcaster`。**`pokerBroadcaster` ではない**。
 *    `broadcastSnapshot` が `connId !== null && presence !== "offline"` で宛先を作る）に
 *    **そのまま含まれる**。
 *    実測では `config` / `problem` / `session` / `clock` / `phase` / `participants` /
 *    `sessionRecords` / `handoffNote` を載せた snapshot が届いた。
 *    パスフレーズの検査は timer の `command-handlers/room-join.ts` にしか無い
 *    （poker に合言葉の概念が無い）ので、**この経路は検査そのものを迂回する**。
 * 2. **timer の画面に幽霊の参加者として載る。** 実測では timer 側の名簿が
 *    `["アリス", "侵入者"]` になった。
 * 3. **{@link discardRoom} が timer ルームの合言葉と全復帰トークンまで消す**
 *    （`tokens.releaseRoom` は roomCode 単位で、どちらのツールのものかを見ない）。
 * 4. **{@link discardRoom} は `createRoomDestroyer` を通らない**ので、
 *    scheduler / delegator / presence の予約が**消えたルームに対して発火し続け**、
 *    さらに **`TimerStore` のエントリが孤児として残る**
 *    （`application/destroy-room.ts` の冒頭と `TimerStore` の宣言が名指しで禁じている
 *    状態そのもの）。落ちている後始末の内訳は {@link discardRoom} に書いた。
 *
 * **意図した中間状態である。** 1・2 を塞ぐのは入口の門（`application/tool-gate.ts`）、
 * 3・4 を塞ぐのは即時破棄の撤去（寿命を `room-reclaimer` の TTL と
 * `createRoomDestroyer` へ一本化する）で、どちらもこの段の後に来る。
 * **一時的なガードをここへ置かない** —— 後で消す前提のコードは、このリポジトリでは
 * 高い確率で自分の欠陥を持ち込む（「対策は自分が塞ぐ欠陥を持つ」）。
 * 代わりに**着地の仕方で担保する**: このコミットは、門と寿命の一本化と
 * **同じ PR で main へ入れること**。単独で main へ入れたりデプロイしたりしてはならない。
 */
import {
  applyAutoReveal,
  createRound,
  messageForRoomError,
  validateName,
  type ClientMessage,
  type ErrorCode,
  type ParticipantFragment,
  type Round,
} from '@tasuki/poker-core';
import {
  addParticipant,
  attachConnection,
  detachConnection,
  findParticipant,
  type Room as MembershipRoom,
} from '@tasuki/room-core';
import type { RateLimiter } from '@tasuki/rate-limit';
import type { Clock } from '../../ports/clock.js';
import type { RoomStore } from '../../ports/room-store.js';
import type { TokenStore } from '../../application/token-store.js';
import type { Broadcaster, RoomSocket } from '../ports/broadcaster';
import type { IdGen } from '../ports/id-gen';
import type { MonotonicClock } from '../ports/monotonic-clock';
import type { RoundStore } from '../ports/round-store';
import { createCommitRoomAction, createDispatch } from './commit-room-action';
import { createRateLimitGate } from './rate-limit-gate';

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
  const { store, rounds, tokens, broadcaster, idGen, clock, wallClock, rateLimiter, maxRooms } =
    deps;

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
   * 語彙の差（`displayName` / `presence`）はここで吸収する。
   * `connected` は `presence !== "offline"` —— 旧 `Participant.connected` と同値である。
   */
  function fragmentsOf(room: MembershipRoom): ParticipantFragment[] {
    return room.participants.map((p) => ({
      id: p.id,
      name: p.displayName,
      connected: p.presence !== 'offline',
    }));
  }

  /**
   * 1 ルームの状態一式を読む。**名簿が無ければ「そのルームは無い」**。
   *
   * ラウンドが無い名簿は voting の空ラウンドとして扱う。名簿とラウンドは
   * 対で作られるので通常は起こらないが、**名簿が 1 つになった帰結として
   * 「timer のルームへ poker の入口から入る」経路が一時的に存在する**（門は次の段）。
   * そこで落ちるより、poker から見て空のラウンドに見えるほうが説明がつく。
   */
  function loadState(roomId: string): RoomState | undefined {
    const room = store.get(roomId);
    if (!room) return undefined;
    return { room, round: rounds.get(roomId) ?? createRound() };
  }

  /**
   * 更新した状態を保管し、スナップショットを配信する（#95 S4a）。
   *
   * **wire の形を組む場所を 1 つにする。** 保管が 2 つに割れた以上、片方だけ put して
   * もう片方を配信する取り違えが起こりうる。両方の put と配信をここへ束ねてある
   * （timer 側の `application/handlers.ts` の `commit` と同じ規律）。
   */
  function commit(state: RoomState): void {
    store.put(state.room);
    rounds.put(state.room.code, state.round);
    broadcaster.broadcastSnapshot(state.room.code, state.round, fragmentsOf(state.room));
  }

  /**
   * ルームの実体を捨てる（FR-014 の即時破棄）。**名簿・ラウンド・トークンを揃って解放する。**
   *
   * 旧実装はトークンをルームの中（`Participant.token`）に持っていたので、ルームを
   * 消せばトークンも一緒に消えた。S4a でトークンが `TokenStore` へ出たため、
   * 明示的に解放しないと保管に残り続ける。
   *
   * ## ⚠ これは `createRoomDestroyer` を通っていない
   *
   * **後始末は 4 つ足りない** —— `scheduler.clear` / `delegator.cancel` /
   * `presence.clearRoomTimers` / **`timers.remove`** を呼んでいない
   * （`application/destroy-room.ts` が並べている順序のうち、ここに写っているのは
   * `releaseRoom` と `store.remove` の 2 つだけである）。`destroy-room.ts` の冒頭は
   * まさにこの状態（「契機ごとに後始末を並べ直すと、片方だけが更新されて必ずずれる」）を
   * 禁じている。poker だけの世界では 4 つとも空振りだったので害が無かったが、
   * **名簿が 1 つになったいま、越境した接続がここへ入ると timer のルームに対して
   * 予約が残ったまま実体だけが消える。**
   *
   * ⚠ **`timers.remove` が落ちているのは、予約の残存より始末が悪い。**
   * poker の `HandlerDeps` に `TimerStore` は無い（この文脈は timer の状態を知らない）ので、
   * **越境した timer ルームをここで捨てると、名簿だけ消えて `TimerStore` のエントリが
   * 孤児として残る**。`ports/timer-store.ts` の宣言が「名簿とは `code` で対になる。
   * 同じ `code` の一方だけが存在する状態は作らない」と、`destroy-room.ts` が
   * 「名簿と対で消す（片方だけ残すと幽霊のルームができる・#95 S4a）」と、
   * どちらも名指しで禁じている状態そのものである。
   *
   * さらに `tokens.releaseRoom(roomId)` は roomCode 単位で、どちらのツールのものかを
   * 見ない。**timer ルームの合言葉と全参加者の復帰トークンまで巻き添えで消える。**
   *
   * ⚠ **この即時破棄は次の段で撤去する（R10・D8）。** 撤去したうえで、寿命は
   * `room-reclaimer` の TTL と `createRoomDestroyer` の 1 本へ寄る。**そこで
   * `RoundStore` の解放も `createRoomDestroyer` 側へ移る** —— この関数を「トークンと
   * ラウンドを足すだけ」と読まないこと。落ちているのは上の 4 つである。
   */
  function discardRoom(roomId: string): void {
    tokens.releaseRoom(roomId);
    store.remove(roomId);
    rounds.remove(roomId);
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
   * presence 更新・自動公開の再評価（US4-AS1）・接続数 0 での即時破棄（FR-014）を
   * ここで一元的に行う。
   *
   * かつてはホスト繰上（旧 FR-012）もここが担っていたが、#95 S3 でホストの概念ごと
   * 廃止した（poker-core からホスト継承ロジックを撤去）。
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

    if (broadcaster.countIn(roomId) === 0) {
      discardRoom(roomId);
      return;
    }

    // 名簿から接続を外す（旧 `markDisconnected`。`presence` が offline になり
    // `connected` は false に見える）。票はラウンド側に残る —— 保管が別なので、
    // 名簿を触っても票には触れないことが構造で保証される。
    const room = detachConnection(state.room, participantId);
    commit({ room, round: applyAutoReveal(state.round, fragmentsOf(room)) });
  }

  /**
   * join 成功の完了処理（create / token 復帰 / 新規 join の3経路で共用）。
   * 順序に不変条件がある: socket 登録 → 接続状態の更新 → joined 送信 → 保管と配信
   *
   * `persist` が false のときは配信だけ行い、保管しない。**書き戻すと保管にだけ
   * ルームが復活し、Broadcaster 側に接続が無い「到達不能なルーム」が `maxRooms` の枠を
   * 永久に食い潰す**（#165 レビューで発見）。判断は {@link handleJoinRoom} が持つ。
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
      connId,
      presence: 'online',
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
    const name = validateName(msg.name);
    if (name.isErr()) {
      sendError(ws, 'invalid-message', messageForRoomError(name.error));
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

    const state = loadState(msg.roomId);
    if (!state) {
      rateLimit.consumeOnMiss();
      sendError(ws, 'room-not-found', 'ルームが見つかりません');
      return;
    }

    // **既にこのルームに居る接続からの再送は冪等に扱う（#171）。切り離してはならない。**
    // 自分がこのルーム唯一の接続だと、下の detachFromCurrentRoom は接続数 0 の分岐に入って
    // ルームを破棄し（FR-014）、それでも joined を返す。以後この接続は存在しないルームに
    // attach されたままになり、vote / reveal / next-round は commitRoomAction の
    // store.get で落ちる（#171 の前は無応答。今は room-not-found を返す）。
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

    // 以下の 2 つは、**detach が参加先のルームそのものを触った場合**への備えである。
    // #171 の修正で「参加先＝現在地」は上の冪等分岐が先に返すようになったため、
    // ここでそうなりうるのは「roomId は一致するのに参加者一覧に自分が居ない」という、
    // ドメインが作らない状態（participants は増えるか更新されるだけで減らない）に限られる。
    // 到達経路は無いが、落とすと戻ってくる欠陥がどちらも重いので残してある。
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
    // 判定は 2 段ある。**いま実際に越境を止めているのは後段の `findParticipant` である。**
    // トークンが指す参加者 ID が、要求されたルームの名簿に居なければ復帰は成立しない。
    // 参加者 ID は全ルームを通じて一意（poker は `crypto.randomUUID()`、timer は
    // `p_${nanoid(16)}`）なので、別ルームのトークンはここで必ず外れて新規参加に落ちる。
    // **この 1 行を「冗長だ」として外してはならない。** 前段だけでは止まらない。
    //
    // 前段の `resume.roomCode === msg.roomId` は**現状では到達しない分岐**であり、
    // 変異検査でも殺せない（外しても全テストが緑のまま。2026-09-10 実測）。それでも置くのは
    // (1) **ID 生成が変わって同じ ID が 2 つのルームに現れうる形になったとき**に、
    // 唯一の防波堤になるため、(2) timer 側の `command-handlers/room-join.ts` が同じ形
    // （`tokenData.roomCode === cmd.code` → `findParticipant`）で書かれており、
    // 2 つの入口で判定の形が違うと片方だけが直る、の 2 つである。
    // 旧 `findParticipantByToken(room, token)` はルーム内を探していたので、
    // 「トークンが指すルームが要求されたルームと同じか」は署名の側で済んでいた。
    const presented = msg.token;
    const resume = presented !== undefined ? tokens.getResume(presented) : undefined;
    const existing =
      presented !== undefined && resume !== undefined && resume.roomCode === msg.roomId
        ? findParticipant(live.room, resume.participantId)
        : undefined;
    if (existing !== undefined && presented !== undefined) {
      const room = attachConnection(live.room, existing.id, ws.data.connId);
      completeJoin(ws, { ...live, room }, existing.id, presented, stillRegistered);
      return;
    }

    const name = validateName(msg.name);
    if (name.isErr()) {
      sendError(ws, 'invalid-message', messageForRoomError(name.error));
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

    if (store.get(msg.roomId) === undefined) {
      rateLimit.consumeOnMiss();
      sendError(ws, 'room-not-found', 'ルームが見つかりません');
    }
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
    dispatch,
    generateRoomId,
    sendError,
  };
}
