/**
 * アプリケーションハンドラ
 * T034, T036, T040c, T045, T047, T049, T053, T055
 * フロー: validate → decide → evolve → store → broadcast
 *
 * #95 S3 で役割とホストを廃止したため、かつて validate と decide の間にあった
 * authorize（可否判定）の段は無くなった。在室確認とアクター解決だけが残る。
 */

import { ok, err, type Result } from "neverthrow";
import {
  decide,
  evolve,
  createRecordIdGenerator,
  ERROR_MESSAGES,
  errorMessageFor,
  type ErrorCode,
  type RemovalNotification,
  type TimerState,
  type Command,
} from "@tasuki/timer-core";
// 表示名の規約はメンバーシップ文脈（room-core）が持つ（#95 S1・docs/adr/0017 決定 2）。
// アプリ層が上流の文脈へ依存するのは決定 2 の対象外で、許されている。
// S4a で名簿そのものもこの文脈が持つようになった。
import { findParticipantByConnId } from "@tasuki/room-core";
import type { RateLimiter } from "@tasuki/rate-limit";
import type { WallClock } from "../ports/wall-clock.js";
import type { Broadcaster } from "../ports/broadcaster.js";
import type { RoomStore } from "../ports/room-store.js";
import type { MonotonicClock } from "../ports/monotonic-clock.js";
import type { RandomSource } from "../ports/random-source.js";
import type { TimerStore } from "../ports/timer-store.js";
import type { RoomCodeGen } from "../ports/code-gen.js";
import type { Scheduler } from "./schedule.js";
import { createRateLimitGate } from "./rate-limit-gate.js";
import { saveRoster } from "./save-roster.js";
import type { HubBroadcaster } from "../ports/hub-broadcaster.js";
import type { TopicBroadcaster } from "./topic-broadcast.js";
import type { TopicStore } from "../ports/topic-store.js";
import type { TokenStore } from "./token-store.js";
import { applyEvents, type RoomState } from "./apply-room-level-event.js";
import {
  buildTimerSnapshotRoom,
  computeIneligibleIndices,
  occupants,
} from "./timer-snapshot-dto.js";
import { buildDomainCommand } from "./build-domain-command.js";
import { createRoomCreateHandler, type CreateResult } from "./command-handlers/room-create.js";
import { createRoomJoinHandler, type JoinResult } from "./command-handlers/room-join.js";
export type { CreateResult } from "./command-handlers/room-create.js";
export type { JoinResult } from "./command-handlers/room-join.js";
import { createTimePingHandler } from "./command-handlers/time-ping.js";
import { createRoomPassphraseSetHandler } from "./command-handlers/room-passphrase-set.js";
import { handleParticipantRemove } from "./command-handlers/participant-remove.js";
import { findRoomByConnId } from "./room-lookup.js";
import { createScheduleSync } from "./scheduler-sync.js";
import { applyAfterEffects } from "./room-commands/after-effects.js";
import { checkPreconditions, type PreconditionFailure } from "./room-commands/preconditions.js";
import { fillServerValues } from "./room-commands/server-values.js";
import { buildShuffleOrder } from "./room-commands/shuffle-order.js";
import type { DomainCommandDraft } from "./room-commands/domain-command.js";

/**
 * 在室を前提としないコマンド（FR-151）。
 *
 * `room.create`/`room.join`/`time.ping` は `handleCommand` の switch で早期分岐する。
 * `presence.ping` は配線（`create-sync-server.ts`）が `handleCommand` を呼ぶ**手前**で
 * 横取り済みであり（`presenceManager.handlePing(connId)`）、ここでは型としてだけ存在する
 * （挙動は変えない。`handlers.ts` 内に処理は書かない）。
 */
export type PreRoomCommand = Extract<
  Command,
  { command: "room.create" | "room.join" | "time.ping" | "presence.ping" }
>;

/**
 * 在室を前提とするルームスコープコマンド（FR-151/152）。
 *
 * `PreRoomCommand`（4個）を除いた `Command` の残り全variantを指す判別可能 union。
 * `break.start`/`break.end` も
 * `buildDomainCommand` が翻訳して受理する（#402）。
 *
 * かつてここには「25個が `permissions.ts` の `REGISTERED_COMMANDS` に登録されている」
 * という但し書きがあったが、#95 S3 でその登録表ごと権限判定が消えたため落とした。
 */
export type RoomScopedCommand = Exclude<Command, PreRoomCommand>;

export interface HandlerDeps {
  /** 名簿（`@tasuki/room-core` の `Room`）の保管。 */
  store: RoomStore;
  /** レート制限の時刻を読む単調時計（#367。参加の判定へ渡す） */
  monotonicClock: MonotonicClock;
  /** `member.shuffle` の順列を作る乱数（#367） */
  random: Pick<RandomSource, "randomInt">;
  /** timer の状態（`TimerState`）の保管。名簿とは `code` で対になる（#95 S4a）。 */
  timers: TimerStore;
  clock: WallClock;
  broadcaster: Broadcaster;
  codeGen: RoomCodeGen;
  /** サーバー権威タイマー（省略時は自動交代をスケジュールしない＝テスト用） */
  scheduler?: Scheduler | undefined;
  /**
   * サーバー全体のルーム数上限（DoS 緩和用）。**名簿の件数を数えるので timer と poker で
   * 共通の枠である**（#95 S4a）。
   *
   * **必須にしてある。** 理由は {@link HandlerDeps.tokens} と同じ ——
   * 既定値を持たせると、本番（`create-sync-server.ts`）の配線から外しても
   * `tsc --noEmit` が通り、実効上限が `config.ts` の値と黙って食い違う。
   * 必須なら型検査が漏れを検出する。テスト側の既定は
   * `test/support/room-builder.ts` の `TEST_MAX_ROOMS` が 1 箇所で持つ。
   */
  maxRooms: number;
  /**
   * 復帰トークンとパスフレーズの保管（`token-store.ts`）。
   *
   * **#95 S4a で poker と同じインスタンスを注入する形になった。** poker の復帰トークンも
   * ここへ寄ったので、`destroyRoom` / `releaseRoom` が 1 回でどちらのトークンも解放できる。
   *
   * **必須にしてある。** 理由は {@link HandlerDeps.destroyRoom} と同じ ——
   * 既定で `createTokenStore()` を作ると、本番（`create-sync-server.ts`）が注入を
   * 忘れても全テストが緑のまま、timer と poker のトークンが**別々の保管へ静かに分かれる**。
   * 必須なら `tsc --noEmit` が漏れを検出する。テスト側の既定は
   * `test/support/room-builder.ts` の `makeTestHandlers` が 1 箇所で持つ。
   */
  tokens: TokenStore;
  /**
   * 入室失敗のレート制限の**バケツ**（#103・#95 S4a）。
   * **timer と poker で同じ 1 個を共有する**（`create-sync-server.ts` が 1 度だけ作る）。
   *
   * ★ **共有は 2 段ある。取り違えないこと。**
   *
   * - **バケツは配線が 1 個作る**（このプロパティ）。**入口をまたぐ共有
   *   （timer ↔ poker）だけが構造から出て、テストが受け持つようになった** ——
   *   実 WS で 3 経路をまたぐ `test/live-ws.rate-limit.test.ts` の「1 IP 1 バケツ」である
   * - **ゲートは `makeHandlers` がそのバケツを 1 度だけ包む**（下の `rateLimitGate`）。
   *   **timer の `room.join`・ハブの参加・お題の参加と `ai.unlock` は、この 1 個のゲートを通す**
   *   （返り値の `rateLimitGate` を配線がハブとお題の入口へ渡す）。
   *   **poker の入口は通らない** —— `poker-handlers.ts` は同じバケツの上に自分のゲートを包む
   *   （接続の鍵を `ws.data.rateKey` から直接読むので、`connId → 鍵` の対応を要らない）。
   *   共有しているのはバケツであってゲートではない
   *
   * **必須にしてある**（理由は {@link HandlerDeps.tokens} と同じ）。
   * 既定を持たせると、注入を忘れた瞬間に 1 IP あたりの実効予算が黙って 2 倍になる。
   */
  rateLimiter: RateLimiter;
  /**
   * 選択画面（ハブ）への配信（#95 S5a）。
   *
   * **必須にしてある**（理由は {@link HandlerDeps.tokens} と同じ）。既定を持たせると、
   * 注入を忘れた瞬間に名簿の更新が選択画面へ届かなくなり、しかも timer は正しく動くので
   * 誰も気づかない。
   */
  hub: HubBroadcaster;
  /**
   * ルームごと破棄する経路（Issue #79）。在室者が 0 人になる退出で使う。
   *
   * 本番（`create-sync-server.ts`）は `PresenceManager` の不在タイマー解放まで含む
   * 完全な破棄経路を注入し、**アイドル回収（TTL）と同じ関数インスタンス**を共有する。
   *
   * **必須にしてある。** 以前は「省略時は presence 抜きの既定値」にしていたが、それだと
   * 本番の配線から注入を外しても全テストが緑のままだった（既定値が代わりに動き、
   * 不在タイマーの解放だけが静かに失われる）。必須にすると `tsc --noEmit` が
   * `create-sync-server.ts` の漏れを検出する。
   *
   * **かつてこの対処は「テストが型検査の対象外である」ことに依存していた**
   * （`tsconfig.json` の `include` が `["src/**\/*"]` だった）。#173 でテストを
   * 射程へ入れた（`include` は `["src", "test"]`）ので、その依存はもう無い。
   * 申し送りどおり、**テスト側は既定を 1 箇所で受け取る** ——
   * `test/support/room-builder.ts` の `makeTestHandlers` が、ここと同じ store / timers /
   * rounds / presence の上に組んだ**本物の `createRoomDestroyer`** を既定にしている
   * （#95 S4a まではそこも「呼ばれたら throw する偽物」だった）。
   *
   * ⚠ **optional へ戻してはならない。** 戻すと本番の配線から注入を外しても
   * 既定値が代わりに動き、上に書いた後退がそのまま再現する。
   * 実測（#173）: `create-sync-server.ts` から注入を外すと `TS2345` で落ちる。
   */
  destroyRoom: (roomCode: string) => void;
  /**
   * 名簿から人が消えたときに、その人の poker の票を捨てる（R8・#95 S5b）。
   *
   * **timer の文脈から poker の保管を触らない。** 配線（`create-sync-server.ts`）が
   * poker のメッセージ層（`poker-handlers.ts` の `handleParticipantRemoved`）へ繋ぐ。
   * 退出は**ルームの出来事**であって timer の出来事ではないので、片方の文脈が
   * もう片方の状態を知らないまま伝えられる形にしてある。
   *
   * ⚠ **optional へ戻してはならない**（理由は {@link HandlerDeps.destroyRoom} と同じ）。
   * 既定値が代わりに動くと、名簿に居ない人の票が公開時の集計へ混ざる。
   */
  discardPokerVote: (roomCode: string, participantId: string) => void;
  /**
   * いまのお題を参加・復帰した本人へ 1 通送る（#91・E4）。
   *
   * **必須にしてある**（理由は {@link HandlerDeps.tokens} と同じ）。既定を持たせると、
   * 注入を忘れた瞬間に timer で入った人にだけお題が出なくなり、しかもハブと
   * お題ツールでは正しく出るので誰も気づかない。
   */
  topicBroadcaster: Pick<TopicBroadcaster, "sendCurrent">;
  /**
   * お題の状態の保管（#91）。**完成記録にタイトルを写すためだけに読む**（spec T9）。
   * timer の文脈はお題を変えない（T4）ので `get` だけに絞る。
   */
  topics: Pick<TopicStore, "get">;
}

// `CreateResult`/`JoinResult`（`room.create`/`room.join` が呼び出し元へ返す値）の
// 定義本体は `command-handlers/room-create.ts`/`room-join.ts` へ移動した
// （フェーズ5・純粋な移動）。ここでは冒頭の import で `type CreateResult`/
// `type JoinResult` として取り込み、外部公開 API（`export` されるこのファイルの
// 型）としての互換性を保つ。

/**
 * **コマンド処理の結果。**
 *
 * ⚠ **本番（`create-sync-server.ts` の配線）はこの戻り値を使っていない**
 * （`await handlers.handleCommand(connId, cmd);` と破棄している）。
 * 本番の観測点は `Broadcaster` への送信（snapshot / error / signal）であり、
 * 戻り値ではない。したがってここに「返していない値」を載せてはならない（FR-100）。
 *
 * 値を返すのは `room.create` / `room.join` だけである。
 * 他のコマンドは副作用（配信）の完了だけを表すので `undefined` を返す。
 * かつては全ハンドラが `CreateResult` を返す形で、
 * **呼び出し側が決して読まないダミー値を 10 箇所で充填していた**。
 */
export type CommandResult = Result<CreateResult | JoinResult | undefined, ErrorCode>;

export function makeHandlers(deps: HandlerDeps) {
  const { store, timers, clock, broadcaster, codeGen, scheduler, maxRooms, topicBroadcaster } = deps;

  // トークン保持（リジュームトークン・ルームパスフレーズ）は
  // `token-store.ts` の `createTokenStore()` へ切り出した（フェーズ2・純粋な移動）。
  //
  // **#95 S4a で生成は呼び出し側（配線）へ移った。** それまではハンドラインスタンスごとに
  // 1 個作っていたが、poker の復帰トークンも同じ保管へ寄ったため、**timer と poker が
  // 同じインスタンスを見ている必要がある**（`create-sync-server.ts` が 1 個作って両方へ渡す）。
  // テスト間の汚染は、テストごとに新しい保管を渡すことで従来どおり避けられる。
  const tokenStore = deps.tokens;

  // 完成記録の ID の生成器（#364）。連番の状態はここが持つ。**本番では makeHandlers は 1 度しか
  // 呼ばれない**（`create-sync-server.ts`）ので、かつての timer-core のモジュールの状態と同じく
  // プロセスに 1 つになる。テストは makeHandlers ごとに独立した連番になる。
  const nextRecordId = createRecordIdGenerator();

  // 入室失敗のレート制限（コード・合言葉の総当たりの緩和）。
  // **数える単位は接続ではなくクライアント（IP の HMAC）である**（#103・ADR 0011 S1）。
  // 接続単位だと再接続で窓がリセットされ、総当たりを止められなかった。
  //
  // ★ **timer の `room.join`・ハブの参加・お題の参加と `ai.unlock` は、このゲートを通す。**
  // どれも「総当たりの緩和」という同じ目的なので、同じバケツを見ていなければならない。
  // ゲートはここで 1 度だけ包み、その 1 個を `handleRoomJoin` へ渡し、返り値の
  // `rateLimitGate` として配線（`create-sync-server.ts`）がハブとお題の入口へ渡す。
  // **poker の入口はこのゲートを通らない**（`poker-handlers.ts` が同じバケツの上に
  // 自分のゲートを包む。鍵を `ws.data.rateKey` から直接読むので `connId → 鍵` の対応が要らない）。
  // 入口ごとに `createRateLimitGate` を呼ぶ形へ崩すと、`connId → クライアント鍵` の
  // 対応が空のゲートができ、その入口の総当たり対策が黙って弱まる。
  //
  // ⚠ **#95 S4a で構造から出たのは「どのバケツか」だけである。** バケツそのものの生成は
  // 配線（`create-sync-server.ts`）へ移り、poker の入口とも同じ 1 本になった
  // （名簿が 1 つになった以上、コード空間も 1 つだから・ADR 0004 の追記）。
  // **入口をまたぐ共有（timer ↔ poker）はもう構造では保証されず、テストが受け持つ** ——
  // `test/live-ws.rate-limit.test.ts`（実 WS で timer の room.join・お題の ai.unlock・
  // poker の join-room の 3 経路）である。
  const rateLimitGate = createRateLimitGate(deps.rateLimiter);

  // ルーム破棄の経路（Issue #79）。後始末の内容と順序は destroy-room.ts の 1 箇所に
  // しか存在せず、ここは受け取るだけ（既定値を持たない理由は HandlerDeps の docstring）。
  const destroyRoom = deps.destroyRoom;

  /**
   * 失敗を 1 接続へ通知する（FR-101）。
   *
   * `code` を `ErrorCode` で受けることで、綴り違い・未定義のコードを型で弾く。
   * **wire に載る値と分岐は従来と同一**であり、`broadcaster.sendTo` に
   * `{ type: "error", code, message }` を渡す以上のことはしない。
   *
   * **`sendError(connId, "CODE", errorMessageFor("CODE"))` という、コードを
   * 2 回書く形（30 箇所超）を 1 引数のヘルパー（例 `rejectWith(connId, code)`）へ
   * 寄せることは検討したが、あえて寄せていない（T119）。理由は
   * `apps/tasuki-sync/test/error-code-coverage.test.ts` の `collectServerErrorCodes()` が
   * `code:\s*"CODE"` / `err\(\s*"CODE"` という**リテラルの形**だけを正規表現で
   * 走査して「利用者に見せる文言が決まっているか」を検出しているためである。
   * `rejectWith(connId, "CODE")` のような 1 引数呼び出しに変えると、その `"CODE"`
   * はどちらの正規表現にも一致せず走査から漏れる。すると新しいコードを足したときの
   * 検出は `EMITTED_VIA_VARIABLE`（手で保守する集合）への追記だけに頼ることになり、
   * 同ファイルの docstring が明言する「迷ったら走査に掛かる静的なリテラル形式で
   * 書けないか先に検討すること」という方針に反する（同ファイルは過去に
   * まさにこの追記漏れで検出力の穴を作った経緯がある）。
   * したがって、綴り違いの構造的リスクより走査の網羅性を優先し、
   * 各呼び出し箇所は `sendError(connId, "CODE", errorMessageFor("CODE"))` の
   * ままにしてある。
   */
  function sendError(connId: string, code: ErrorCode, message: string): void {
    broadcaster.sendTo(connId, { type: "error", code, message });
  }

  // ─── サーバー権威タイマーの調停 ───────────────────────────────────────────

  /**
   * 1 ルームの状態一式を読む（名簿と timer の状態）。片方でも欠けたら undefined を返す。
   *
   * **片方だけが存在する状態は作らない**（作成・破棄は必ず対で行う）。欠けを undefined に
   * 畳むことで、呼び出し側は「その部屋は無い」という 1 つの分岐だけを持てばよい。
   */
  function loadState(roomCode: string): RoomState | undefined {
    const membership = store.get(roomCode);
    const timer = timers.get(roomCode);
    if (!membership || !timer) return undefined;
    return { membership, timer };
  }

  /**
   * 更新した状態を保管し、合成した snapshot を配信する（#95 S4a）。
   *
   * ★ **wire を組む場所は `timer-snapshot-dto.ts` の `buildTimerSnapshotRoom` の 1 つである。**
   * 保管が 2 つに割れた以上、片方だけ put してもう片方を配信する取り違えが起こりうる。
   * それを防ぐのは「配信は必ず DTO を通す」という規律であって、経路の数ではない。
   *
   * ⚠ **put と配信を束ねた経路はここだけではない。** この `commit` は名簿と timer の状態を
   * **両方**書くので、両方を変えるコマンドはここを通す。片方しか変えない経路が別にある ——
   *
   * - `application/presence.ts`（`handlePing` / `handleDisconnect`）…… 名簿だけ
   *
   * **ここを「1 箇所」と書くと、次に presence を触る人は `commit` を探さず、
   * その場で 2 行書き足す。** 足すなら DTO を通すことだけは外さないこと。
   *
   * **名簿を書くときは `saveRoster` を通す**（#95 S5a）。素の `store.put` を書くと
   * 選択画面（ハブ）への配信が落ちる。`test/save-roster.wiring.test.ts` が
   * 「製品コードで `store.put` を呼ぶのは `save-roster.ts` だけ」を機械的に固定している。
   */
  function commit(state: RoomState): void {
    // 名簿の保管とハブへの配信は対にする（`save-roster.ts`・#95 S5a）。
    // **`store.put` をここへ書き戻さないこと** —— 選択画面が更新されなくなる。
    // timer の snapshot はこの直後に自分で配る（二重に配らない。`save-roster.ts`）。
    saveRoster({ store, hub: deps.hub, timers, timerBroadcaster: broadcaster }, state.membership, {
      timerSnapshotSentByCaller: true,
    });
    timers.put(state.timer);
    broadcaster.broadcastSnapshot(
      state.timer.code,
      buildTimerSnapshotRoom(state.membership, state.timer),
    );
  }

  // 自動交代のスケジュールの突き合わせ（#366 で `scheduler-sync.ts` へ出した）。
  const { reconcileSchedule, autoSwitch } = createScheduleSync({ scheduler, clock, broadcaster, loadState, commit });

  /**
   * コマンドを処理するメインエントリポイント
   */
  async function handleCommand(
    connId: string,
    // `presence.ping` は配線が手前で横取りする（create-sync-server.ts）ので、型の上でもここへ渡さない（#363）
    cmd: RoomScopedCommand | Exclude<PreRoomCommand, { command: "presence.ping" }>,
  ): Promise<CommandResult> {
    switch (cmd.command) {
      // 判別共用体の絞り込みで、各 case の cmd は対応するコマンドの型になる（#363 で as を外した）
      case "room.create":
        return handleRoomCreate(connId, cmd);

      case "room.join":
        return handleRoomJoin(connId, cmd);

      case "time.ping":
        return handleTimePing(connId, cmd);

      default:
        return handleRoomCommand(connId, cmd);
    }
  }

  // ─── 専用ハンドラの合成（フェーズ5・純粋な移動）───────────────────────────
  //
  // room.create/room.join/time.ping の実装本体は `command-handlers/*.ts` へ
  // 移動した（ロジック変更なし）。ここでは各ファイルが公開するファクトリへ、
  // このクロージャが持つ依存を渡してインスタンスを組み立てるだけになっている。

  const handleRoomCreate = createRoomCreateHandler({
    store,
    timers,
    clock,
    broadcaster,
    commit,
    codeGen,
    tokenStore,
    maxRooms,
    sendError,
    topicBroadcaster,
  });

  const handleRoomJoin = createRoomJoinHandler({
    store,
    timers,
    clock,
    broadcaster,
    commit,
    codeGen,
    tokenStore,
    rateLimitGate,
    monotonicClock: deps.monotonicClock,
    sendError,
    topicBroadcaster,
  });

  const handleTimePing = createTimePingHandler({ clock, broadcaster });

  /**
   * ルームコマンド（session.act, config.set 等）。
   *
   * 並びは「ルームと参加者を引く → 専用の処理（退出・合言葉）→ ドメインのコマンドへ翻訳 → 事前条件
   * （`room-commands/preconditions.ts`）→ サーバーが埋める値（`room-commands/server-values.ts`）→
   * `decide` → `evolve` → Room レベルのイベントの適用 → 事後処理（`room-commands/after-effects.ts`）→
   * 保管と配信」。#366 で事前条件・埋める値・事後処理をそれぞれのモジュールへ出した。
   *
   * ⚠ ここに可否判定は無い。#95 S3 でルームに居る全員が同格になったため、在室確認（NOT_IN_ROOM）と
   * アクター解決だけがこの段の責務である。wire スキーマに無いコマンドは、ここへ届く手前の valibot が落とす
   * （`test/unknown-command-boundary.test.ts`）。スキーマにあってドメイン処理を持たないものは UNKNOWN_COMMAND。
   */
  async function handleRoomCommand(
    connId: string,
    cmd: RoomScopedCommand,
  ): Promise<Result<undefined, ErrorCode>> {
    const state = findStateByConnId(connId);
    if (!state) {
      sendError(connId, "NOT_IN_ROOM", errorMessageFor("NOT_IN_ROOM"));
      return err("NOT_IN_ROOM");
    }
    const participant = findParticipantByConnId(state.membership, connId);
    if (!participant) return err("PARTICIPANT_NOT_FOUND");

    // 退出と合言葉は decide/evolve を通らない Room レベルの専用処理（`command-handlers/*.ts`）。
    if (cmd.command === "participant.remove") {
      return handleParticipantRemove(connId, { state, actor: participant }, cmd, participantRemoveDeps);
    }
    if (cmd.command === "room.passphrase.set") {
      return handleRoomPassphraseSet(connId, { state, actor: participant }, cmd);
    }

    const draft = toDomainCommand(cmd, state.timer, deps.random.randomInt);
    if (!draft) {
      sendError(connId, "UNKNOWN_COMMAND", `不明なコマンド: ${cmd.command}`);
      return err("UNKNOWN_COMMAND");
    }

    const assignTarget = cmd.command === "driver.assign" ? cmd.participantId : undefined;
    const prepared = prepareDomainCommand(draft, state, assignTarget);
    if (prepared.isErr()) {
      sendError(connId, prepared.error, errorMessageFor(prepared.error));
      return err(prepared.error);
    }
    const domainCmd = prepared.value;

    const now = clock.now();
    const agg = { session: state.timer.session, clock: state.timer.clock };
    const result = decide(domainCmd, agg, now);
    if (result.isErr()) {
      // 表（ERROR_MESSAGES）に該当コードがあればそれを使う。無ければ元のままの汎用文言にフォールバックする。
      sendError(connId, result.error.type, ERROR_MESSAGES[result.error.type] ?? `操作エラー: ${result.error.type}`);
      return err(result.error.type);
    }
    // decide が返したイベント列を evolve へ通し、集約の反映 → Room レベルイベントの適用（順序は applyEvents）。
    const evolved = result.value.reduce((acc, event) => evolve(acc, event, now), agg);
    const next = applyAfterEffects(applyEvents(state, evolved, result.value, nextRecordId), {
      command: domainCmd,
      events: result.value,
      assignTarget,
      now,
      nextRecordId,
    });

    commit(next);
    // clock 状態が変わった可能性があるので自動交代を調停する（FR-003）
    reconcileSchedule(next.timer);
    announceSessionNotice(next.timer.code, domainCmd.command, participant);
    return ok(undefined);
  }

  /** 事前条件を確かめ、通ればサーバーが埋める値を埋める（`room-commands/`）。 */
  function prepareDomainCommand(
    draft: DomainCommandDraft,
    state: RoomState,
    assignTarget: string | undefined,
  ): Result<DomainCommandDraft, PreconditionFailure> {
    const ctx = { residents: occupants(state.membership, state.timer), rotation: state.timer.session.rotation, assignTarget };
    return checkPreconditions(draft, ctx).map((checked) =>
      fillServerValues(checked, {
        topicTitle: () => deps.topics.get(state.timer.code)?.topic?.title ?? null,
        newParticipantId: () => codeGen.generateParticipantId(),
        ineligible: () => computeIneligibleIndices(state.membership, state.timer),
      }),
    );
  }

  /** 退出（`command-handlers/participant-remove.ts`）へ渡す依存。 */
  const participantRemoveDeps = {
    clock,
    broadcaster,
    commit,
    reconcileSchedule,
    messageForRemoval,
    sendError,
    destroyRoom,
    discardPokerVote: deps.discardPokerVote,
  };

  /**
   * セッションを畳む操作（中断・リセット・完成）を、誰が実行したかと一緒に全員へ伝える（#95 S3・FR-077）。
   * 在室者なら誰でも実行できるので、誰が実行したか分からないと画面が突然変わった理由を追えない。
   */
  function announceSessionNotice(roomCode: string, command: string, actor: { displayName: string; id: string }): void {
    const action = SESSION_NOTICE_ACTIONS[command];
    if (!action) return;
    broadcaster.broadcastSignal(roomCode, {
      type: "signal",
      signal: "notice",
      action,
      actorName: actor.displayName,
      actorParticipantId: actor.id,
    });
  }

  // ─── 専用ハンドラの合成（フェーズ7・パイプライン統合済み）───────────────────
  //
  // room.passphrase.set は handleCommand の switch から専用ケースを削除し、default（handleRoomCommand・
  // 共通パイプライン）経由へ合流させた。在室確認とアクター解決は handleRoomCommand
  // 側で1度だけ行い、その結果（{ room, actor }）を各ハンドラへ ctx として渡す。
  // 各ハンドラはドメイン処理のみを持つ関数へ縮退済み（FR-152〜154）。

  const handleRoomPassphraseSet = createRoomPassphraseSetHandler({
    commit,
    tokenStore,
  });

  /** connId からルームの状態一式を特定する（参加者として在室しているルーム） */
  function findStateByConnId(connId: string): RoomState | undefined {
    const membership = findRoomByConnId(store, connId);
    if (!membership) return undefined;
    return loadState(membership.code);
  }

  /** 接続の受理時。この接続が属するクライアント鍵を登録する。 */
  function handleConnectionOpen(connId: string, rateKey: string): void {
    rateLimitGate.open(connId, rateKey);
  }

  /**
   * 接続クローズ時の後始末。connId → 鍵の対応を捨てる（マップのリーク防止）。
   *
   * **レート制限の残量はここでは戻らない**（鍵はクライアントであって接続ではない）。
   * 張り直しで窓がリセットされるのが #103 が塞いだ回避経路そのものである。
   */
  function handleConnectionClose(connId: string): void {
    rateLimitGate.close(connId);
  }

  /** ルーム回収時の後始末。当該ルームのリジュームトークンとパスフレーズを解放する。 */
  function releaseRoom(roomCode: string): void {
    tokenStore.releaseRoom(roomCode);
  }

  // ドライバー不在の猶予後繰り上げ（R2-1）。presence の不在タイマーから呼ばれ、
  // 中身は通常の interval 交代(autoSwitch)と同一。
  return {
    handleCommand,
    handleConnectionOpen,
    handleConnectionClose,
    releaseRoom,
    advanceForAbsence: autoSwitch,
    /**
     * レート制限のゲート（#95 S5a）。
     *
     * **ハブの入口（`hub-handlers.ts`）へ同じインスタンスを渡すために公開する。**
     * 別インスタンスを作ると `connId → クライアント鍵` の対応が空になり、ハブでは
     * 鍵が connId へ落ちる —— つまり**再接続するだけでレート制限を回避できる**。
     * 鍵を登録するのは接続の受理（`handleConnectionOpen`）で、それを呼ぶのは
     * timer 側の `onConnect` 1 箇所だが、ハブの接続もそこを通る。
     */
    rateLimitGate,
  };
}

// ─── 実行者の通知（FR-077） ──────────────────────────────────────────────────

/**
 * wire のコマンドを、`decide` へ渡す前のドメインのコマンドにする。翻訳できなければ null（UNKNOWN_COMMAND）。
 *
 * member.shuffle は順列をサーバーが生成する（wire は order を持たない）。
 * 稼働中は現ドライバー位置を固定し、それ以外をシャッフルする（現ドライバー現役維持）。
 */
function toDomainCommand(
  cmd: RoomScopedCommand,
  timer: TimerState,
  randomInt: (n: number) => number,
): DomainCommandDraft | null {
  if (cmd.command !== "member.shuffle") return buildDomainCommand(cmd);
  return {
    command: "member.shuffle",
    order: buildShuffleOrder(timer.session.rotation.length, timer.clock.running, timer.session.currentIndex, randomInt),
  };
}

/**
 * セッションを畳むコマンドと、それを表す notice の action の対応。
 *
 * participant.remove は decide/evolve を通らず専用の分岐で処理するため、ここには含めない
 * （その場で対象の情報も併せて配信する）。
 */
const SESSION_NOTICE_ACTIONS: Readonly<Record<string, "session-aborted" | "session-reset" | "session-completed" | undefined>> = {
  "session.abort": "session-aborted",
  "session.reset": "session-reset",
  "session.complete": "session-completed",
};

/**
 * 退出させられた本人へ送る文言を、通知の種類から組み立てる（Issue #32）。
 *
 * `REMOVED_FROM_ROOM` だけ実行者名を差し込む動的文言であり、静的な表
 * （`ERROR_MESSAGES`）に収まらない。この差し込みが無い `LEFT_ROOM` は
 * `errorMessageFor` を素通しするだけで、判定はここでは行わない
 * （「誰の操作か」の判定は `removalNotificationFor` の責務のまま分離する）。
 *
 * 動的文言のリテラルは 1 文字も変えない（既存利用者が見る文言のため）。
 */
function messageForRemoval(code: RemovalNotification, actorDisplayName: string): string {
  return code === "REMOVED_FROM_ROOM"
    ? `${actorDisplayName} さんにより退出させられました。招待から再参加できます。`
    : errorMessageFor("LEFT_ROOM");
}

// ─── ルームレベルのイベント適用 ──────────────────────────────────────────────
//
// `applyEvents`/`applyRoomLevelEvent`（集約反映 → Room レベルイベント適用の
// 適用順序契約を含む）は `apply-room-level-event.ts` へ移動した（フェーズ4・
// 純粋な移動。ロジック変更なし）。本ファイルはファイル先頭で `applyEvents` を
// import して従来通り呼び出す。適用順の依存関係の説明は移動先の docstring を参照。
//
// rotation を表示名へ写す `rotationDisplayNames` は `timer-snapshot-dto.ts` へ移した
// （#95 S4a）。名簿と timer の状態が出会う場所を 1 つに保つためである。
