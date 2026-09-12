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
  advanceDriver,
  rotationEntryId,
  secondsLeft,
  ERROR_MESSAGES,
  errorMessageFor,
  type SessionConfig,
  type TimerState,
  type Problem,
  type ErrorCode,
  type RemovalNotification,
  type Command,
} from "@tasuki/timer-core";
// 表示名の規約はメンバーシップ文脈（room-core）が持つ（#95 S1・docs/adr/0017 決定 2）。
// アプリ層が上流の文脈へ依存するのは決定 2 の対象外で、許されている。
// S4a で名簿そのものもこの文脈が持つようになった。
import {
  conflictsWithExisting,
  findParticipantByConnId,
  isPresentIn,
  type Room as MembershipRoom,
} from "@tasuki/room-core";
import { TOOL_TIMER } from "./tool-id.js";
import type { RateLimiter } from "@tasuki/rate-limit";
import type { Clock } from "../ports/clock.js";
import type { Broadcaster } from "../ports/broadcaster.js";
import type { RoomStore } from "../ports/room-store.js";
import type { TimerStore } from "../ports/timer-store.js";
import type { RoomCodeGen } from "../ports/code-gen.js";
import type { Scheduler } from "./schedule.js";
import type { ProblemDelegator } from "./problem-delegation.js";
import { createRateLimitGate } from "./rate-limit-gate.js";
import { saveRoster } from "./save-roster.js";
import type { HubBroadcaster } from "../ports/hub-broadcaster.js";
import type { ToolGate } from "./tool-gate.js";
import type { TokenStore } from "./token-store.js";
import { applyEvents, type RoomState } from "./apply-room-level-event.js";
import { buildTimerSnapshotRoom, occupants, rotationDisplayNames } from "./timer-snapshot-dto.js";
import { buildDomainCommand } from "./build-domain-command.js";
import { createRoomCreateHandler, type CreateResult } from "./command-handlers/room-create.js";
import { createRoomJoinHandler, type JoinResult } from "./command-handlers/room-join.js";
export type { CreateResult } from "./command-handlers/room-create.js";
export type { JoinResult } from "./command-handlers/room-join.js";
import { createTimePingHandler } from "./command-handlers/time-ping.js";
import { createRoomPassphraseSetHandler } from "./command-handlers/room-passphrase-set.js";
import { createAiUnlockHandler } from "./command-handlers/ai-unlock.js";
import { createProblemRequestHandler } from "./command-handlers/problem-request.js";
import { createProblemSubmitHandler } from "./command-handlers/problem-submit.js";
import { handleParticipantRemove } from "./command-handlers/participant-remove.js";

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
 * このうち `break.start`/`break.end` の2個は wire スキーマ上は残っているが
 * `buildDomainCommand` の switch には無い（`default` → `UNKNOWN_COMMAND` になる
 * 到達しない枝。`reconcileSchedule` のコメント参照）。この2個も `handleCommand` の
 * default 分岐（`handleRoomCommand`）へは届く必要があるため（現状の挙動を変えない）、
 * 型としては `RoomScopedCommand` に含めておく。
 *
 * かつてここには「25個が `permissions.ts` の `REGISTERED_COMMANDS` に登録されている」
 * という但し書きがあったが、#95 S3 でその登録表ごと権限判定が消えたため落とした。
 */
export type RoomScopedCommand = Exclude<Command, PreRoomCommand>;

export interface HandlerDeps {
  /** 名簿（`@tasuki/room-core` の `Room`）の保管。 */
  store: RoomStore;
  /** timer の状態（`TimerState`）の保管。名簿とは `code` で対になる（#95 S4a）。 */
  timers: TimerStore;
  clock: Clock;
  broadcaster: Broadcaster;
  codeGen: RoomCodeGen;
  /** サーバー権威タイマー（省略時は自動交代をスケジュールしない＝テスト用） */
  scheduler?: Scheduler | undefined;
  /** お題代表生成（省略時は problem.request/submit を受け付けない） */
  delegator?: ProblemDelegator | undefined;
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
   * 入口ごとの門（`tool-gate.ts`。#95 S4a）。**timer と poker で同じ 1 個を共有する。**
   *
   * 名簿は poker と 1 つなので、「名簿にある」ことは「timer のルームである」ことを
   * 意味しない。timer の状態が無いルーム（poker の入口で作られたルーム）へ
   * `room.join` で入れてしまわないよう、`command-handlers/room-join.ts` がここを通す。
   *
   * **必須にしてある。** 理由は {@link HandlerDeps.tokens} と同じで、既定を持つと
   * 本番（`create-sync-server.ts`）が注入を忘れても全テストが緑のまま、
   * 2 つの入口が別々の規則で判定する状態へ静かに戻る。
   */
  toolGate: ToolGate;
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
   *   したがって **`room.join` と `ai.unlock` が同じバケツを見ることは、いまも
   *   構造が保証している**（同じゲートのインスタンスを両ハンドラへ渡している）。
   *   `test/join-rate-limit.test.ts` の「room.join と ai.unlock のレート制限バケツの共有」は
   *   その構造を裏から確かめるもので、構造の**代わり**ではない
   *
   * **必須にしてある**（理由は {@link HandlerDeps.toolGate} と同じ）。
   * 既定を持たせると、注入を忘れた瞬間に 1 IP あたりの実効予算が黙って 2 倍になる。
   */
  rateLimiter: RateLimiter;
  /**
   * 選択画面（ハブ）への配信（#95 S5a）。
   *
   * **必須にしてある**（理由は {@link HandlerDeps.toolGate} と同じ）。既定を持たせると、
   * 注入を忘れた瞬間に名簿の更新が選択画面へ届かなくなり、しかも timer は正しく動くので
   * 誰も気づかない。
   */
  hub: HubBroadcaster;
  /** AI 解錠合言葉。undefined なら AI 機能は無効（解錠は常に失敗＝存在秘匿）。
   *  createSyncServer はトークン未設定時にもここを undefined にする。 */
  aiUnlockKey?: string | undefined;
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
  const { store, timers, clock, broadcaster, codeGen, scheduler, delegator, maxRooms } = deps;
  const aiUnlockKey = deps.aiUnlockKey;

  // トークン保持（リジュームトークン・ルームパスフレーズ）は
  // `token-store.ts` の `createTokenStore()` へ切り出した（フェーズ2・純粋な移動）。
  //
  // **#95 S4a で生成は呼び出し側（配線）へ移った。** それまではハンドラインスタンスごとに
  // 1 個作っていたが、poker の復帰トークンも同じ保管へ寄ったため、**timer と poker が
  // 同じインスタンスを見ている必要がある**（`create-sync-server.ts` が 1 個作って両方へ渡す）。
  // テスト間の汚染は、テストごとに新しい保管を渡すことで従来どおり避けられる。
  const tokenStore = deps.tokens;

  // 入室失敗のレート制限（コード・合言葉の総当たりの緩和）。
  // **数える単位は接続ではなくクライアント（IP の HMAC）である**（#103・ADR 0011 S1）。
  // 接続単位だと再接続で窓がリセットされ、総当たりを止められなかった。
  //
  // ★ room.join と ai.unlock は「総当たりの緩和」という同じ目的のため、
  // 同一インスタンスのバケツを共有する。**この共有はいまも構造の帰結である** ——
  // ゲートをここで 1 度だけ包み、その 1 個を `handleRoomJoin` と `handleAiUnlock` の
  // 両方へ渡しているので、片方だけ別のバケツを見る書き方ができない。
  // コマンドごとに `createRateLimitGate` を呼ぶ形へ崩すと、ai.unlock の総当たり対策が
  // 黙って弱まる。（裏取りは `test/join-rate-limit.test.ts` の
  // 「room.join と ai.unlock のレート制限バケツの共有」。構造の代わりではなく裏付けである。）
  //
  // ⚠ **#95 S4a で構造から出たのは「どのバケツか」だけである。** バケツそのものの生成は
  // 配線（`create-sync-server.ts`）へ移り、poker の入口とも同じ 1 本になった
  // （名簿が 1 つになった以上、コード空間も 1 つだから・ADR 0004 の追記）。
  // **入口をまたぐ共有（timer ↔ poker）はもう構造では保証されず、テストが受け持つ** ——
  // `test/live-ws.rate-limit.test.ts`（実 WS で timer と poker の 3 経路）である。
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
   * - `application/problem-delegation.ts`（`finalize`）…… timer の状態だけ（`timers.put`）
   *
   * **ここを「1 箇所」と書くと、次に presence か delegation を触る人は `commit` を探さず、
   * その場で 2 行書き足す。** 足すなら DTO を通すことだけは外さないこと。
   *
   * **名簿を書くときは `saveRoster` を通す**（#95 S5a）。素の `store.put` を書くと
   * 選択画面（ハブ）への配信が落ちる。`test/save-roster.wiring.test.ts` が
   * 「製品コードで `store.put` を呼ぶのは `save-roster.ts` だけ」を機械的に固定している。
   */
  function commit(state: RoomState): void {
    // 名簿の保管とハブへの配信は対にする（`save-roster.ts`・#95 S5a）。
    // **`store.put` をここへ書き戻さないこと** —— 選択画面が更新されなくなる。
    // 名簿の保管とハブへの配信は対にする（`save-roster.ts`・#95 S5a）。
    // **`store.put` をここへ書き戻さないこと** —— 選択画面が更新されなくなる。
    saveRoster({ store, hub: deps.hub }, state.membership);
    timers.put(state.timer);
    broadcaster.broadcastSnapshot(
      state.timer.code,
      buildTimerSnapshotRoom(state.membership, state.timer),
    );
  }

  /** ルームの clock 状態に応じて次回自動交代をスケジュール/解除する（FR-003） */
  function reconcileSchedule(room: TimerState): void {
    if (!scheduler) return;
    // 稼働中かつ完成フェーズに入っていない場合のみ次回交代を予約する。
    //
    // かつてここには `!room.onBreak` という到達不能なガードがあった（Issue #28・T080・FR-119）。
    // v2.10 で休憩機能の UI とコマンドを撤去した際、`buildDomainCommand` の switch から
    // `break.start` / `break.end` の case が消え、以後この 2 コマンドは `default:` に落ちて
    // `UNKNOWN_COMMAND` になる。つまり `BreakStarted` イベントは生成されず、
    // **`room.onBreak` が true になる経路が存在しない**ため `!room.onBreak` は常に真だった。
    //
    // wire スキーマ（`schemas.ts` の `break.start` / `break.end`）と `Room.onBreak`
    // フィールドは**残す**（FR-089: 受理側の後方互換 / snapshot の形を変えない）。
    // 撤去したのは、この到達しない条件だけである。
    if (room.clock.running && room.phase !== "celebration") {
      const left = secondsLeft(room.clock, clock.now());
      scheduler.schedule(room.code, left, autoSwitch);
    } else {
      scheduler.clear(room.code);
    }
  }

  /** タイマー発火時にサーバー側で交代を実行し再スケジュールする。
   *  driverEligible=false の参加者を飛ばし、全員 ineligible なら現状維持する（plan.md L194）。 */
  function autoSwitch(roomCode: string): void {
    const state = loadState(roomCode);
    if (!state || !state.timer.clock.running) return;
    const { membership, timer } = state;
    const now = clock.now();
    const agg = { session: timer.session, clock: timer.clock };
    const newAgg = advanceDriver(agg, computeIneligibleIndices(membership, timer), now);
    const updated: TimerState = { ...timer, session: newAgg.session, clock: newAgg.clock };
    commit({ membership, timer: updated });
    broadcaster.broadcastSignal(updated.code, {
      type: "signal",
      signal: "switch",
      nextDriverName: rotationDisplayNames(membership, updated)[updated.session.currentIndex] ?? "",
    });
    reconcileSchedule(updated);
  }

  /**
   * コマンドを処理するメインエントリポイント
   */
  async function handleCommand(
    connId: string,
    cmd: RoomScopedCommand | PreRoomCommand,
  ): Promise<CommandResult> {
    switch (cmd.command) {
      case "room.create":
        return handleRoomCreate(
          connId,
          cmd as { command: "room.create"; displayName: string; config?: SessionConfig; roomName?: string },
        );

      case "room.join":
        return handleRoomJoin(
          connId,
          cmd as {
            command: "room.join";
            code: string;
            displayName: string;
            hasAiKey: boolean;
            resumeToken?: string;
            passphrase?: string;
          },
        );

      case "time.ping":
        return handleTimePing(
          connId,
          cmd as { command: "time.ping"; clientTime: number },
        );

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
  });

  const handleRoomJoin = createRoomJoinHandler({
    store,
    timers,
    clock,
    broadcaster,
    commit,
    codeGen,
    tokenStore,
    toolGate: deps.toolGate,
    rateLimitGate,
    sendError,
  });

  const handleTimePing = createTimePingHandler({ clock, broadcaster });

  /** ルームコマンド（session.act, config.set 等） */
  async function handleRoomCommand(
    connId: string,
    cmd: { command: string; [key: string]: unknown },
  ): Promise<Result<undefined, ErrorCode>> {
    // connId からルームを特定する
    let state = findStateByConnId(connId);

    if (!state) {
      sendError(connId, "NOT_IN_ROOM", errorMessageFor("NOT_IN_ROOM"));
      return err("NOT_IN_ROOM");
    }

    const participant = findParticipantByConnId(state.membership, connId);
    if (!participant) {
      return err("PARTICIPANT_NOT_FOUND");
    }

    // ⚠ ここに可否判定は無い。#95 S3 でルームに居る全員が同格になったため、
    // 在室確認（上の NOT_IN_ROOM）とアクター解決だけがこの段の責務である。
    // wire スキーマ（`CommandSchema`）に無いコマンドは、ここへ届く手前の valibot が
    // 落とす（`test/unknown-command-boundary.test.ts` が default-deny を固定している）。
    // スキーマにあってドメイン処理を持たないものは、下の `UNKNOWN_COMMAND` で落ちる。

    // 参加者の退出（⑪）。参加者は Room レベルのため decide ではなくここで扱う。
    // 実装本体は command-handlers/participant-remove.ts へ移動した（フェーズ5・
    // 純粋な移動。ロジック変更なし）。ここでは在室確認・アクター解決の結果を
    // ctx として渡すだけ。
    if (cmd.command === "participant.remove") {
      return handleParticipantRemove(
        connId,
        { state, actor: participant },
        cmd as { command: "participant.remove"; [key: string]: unknown },
        {
          clock,
          broadcaster,
          commit,
          reconcileSchedule,
          messageForRemoval,
          sendError,
          destroyRoom,
        },
      );
    }

    // room.passphrase.set は decide/evolve を通らない Room レベルの専用処理（フェーズ7合流）。
    if (cmd.command === "room.passphrase.set") {
      return handleRoomPassphraseSet(
        connId,
        { state, actor: participant },
        cmd as { command: "room.passphrase.set"; passphrase: string },
      );
    }

    // ai.unlock も decide/evolve を通らない Room レベルの専用処理（フェーズ7合流）。
    if (cmd.command === "ai.unlock") {
      return handleAiUnlock(
        connId,
        { state, actor: participant },
        cmd as { command: "ai.unlock"; key: string },
      );
    }

    // problem.request/problem.submit も decide/evolve を通らない Room レベルの
    // 専用処理（フェーズ7合流）。旧 requireEditor（在室確認・アクター解決・
    // 可否判定を束ねたヘルパ）は、その3つを共通パイプラインが既に済ませたため
    // 不要になり撤去した。可否判定はさらに #95 S3 で概念ごと消えている。
    if (cmd.command === "problem.request") {
      return handleProblemRequest(
        connId,
        { state, actor: participant },
        cmd as { command: "problem.request"; requestId: string },
      );
    }
    if (cmd.command === "problem.submit") {
      return handleProblemSubmit(
        connId,
        { state, actor: participant },
        cmd as {
          command: "problem.submit";
          requestId: string;
          problem: Problem;
          usedFallback: boolean;
        },
      );
    }

    // 「名乗っている人」は名簿の参加者＋輪の上の代理である（#95 S4a）。
    // S4a 以前は `Room.participants` が両方を含んでいたので、下の 3 つの検査は
    // そこを見ていた。**名簿だけを見ると代理が消えて挙動が変わる**ため、合成した
    // 一覧（`occupants`）で突き合わせる。
    const residents = occupants(state.membership, state.timer);

    // ドメインコマンドを構築して decide/evolve を実行。
    // member.shuffle は順列をサーバーが生成する（wire は order を持たない）。
    // 稼働中は現ドライバー位置を固定し、それ以外をシャッフルする（現ドライバー現役維持）。
    const domainCmd =
      cmd.command === "member.shuffle"
        ? {
            command: "member.shuffle" as const,
            order: buildShuffleOrder(
              state.timer.session.rotation.length,
              state.timer.clock.running,
              state.timer.session.currentIndex,
            ),
          }
        : buildDomainCommand(cmd);
    // 輪に並べられるのは在室者だけ（D6b）。実在しない ID を rotation に入れると
    // 表示名を引けない枠が残り、順番表示も指名も破綻する。
    if (domainCmd && domainCmd.command === "member.add") {
      const exists = residents.some((p) => p.participantId === domainCmd.participantId);
      if (!exists) {
        sendError(connId, "PARTICIPANT_NOT_FOUND", errorMessageFor("PARTICIPANT_NOT_FOUND"));
        return err("PARTICIPANT_NOT_FOUND");
      }
    }
    // 代理追加の表示名一意性もここで検査する（D6b）。改名と同じ理由で、rotation が
    // 席の配列になったため集約からは名前の重複を判定できない。
    // 「既存の表示名と重複する代理は追加できない」という従来の挙動を維持する。
    if (domainCmd && domainCmd.command === "participant.addProxy") {
      const conflicts = conflictsWithExisting(residents, domainCmd.displayName);
      if (conflicts) {
        sendError(connId, "DuplicateName", errorMessageFor("DuplicateName"));
        return err("DuplicateName");
      }
    }
    // 改名の表示名一意性はここで検査する（T052・D6b）。rotation が席の配列になり
    // 名前の重複を集約から判定できなくなったため、名簿を持つこの層が受け持つ。
    // 「既存の表示名へは改名できない」という従来の挙動はそのまま維持する（後方互換）。
    if (domainCmd && domainCmd.command === "participant.rename") {
      const target = residents.find((p) => p.participantId === domainCmd.participantId);
      // 対象が存在しなければ早期に拒否する（実体は対象不在なのに DuplicateName 等の
      // 誤った理由で失敗させないため）。
      if (!target) {
        sendError(connId, "PARTICIPANT_NOT_FOUND", errorMessageFor("PARTICIPANT_NOT_FOUND"));
        return err("PARTICIPANT_NOT_FOUND");
      }
      // 自分自身は比較対象から外す（現在名と同じ名前への改名は no-op 相当で許可する）。
      // 大文字小文字は無視する（表示上の識別が付かないため衝突とみなす・FR-046/048）。
      const conflicts = conflictsWithExisting(
        residents,
        domainCmd.displayName,
        target.participantId,
      );
      if (conflicts) {
        sendError(connId, "DuplicateName", errorMessageFor("DuplicateName"));
        return err("DuplicateName");
      }
    }
    // 指名は participantId → rotation index を解決して decide へ渡す（Issue #13）。
    // 集約は名簿を持たないため、rotation 内の位置をここで確定する。
    if (domainCmd && domainCmd.command === "driver.assign") {
      const targetPid = typeof cmd.participantId === "string" ? cmd.participantId : "";
      const target = residents.find((p) => p.participantId === targetPid);
      // 対象解決を2段に分ける（Issue #29・T112）。「対象が存在しない」と
      // 「対象は居るが rotation に居ない」は解消手段が異なるため、
      // 同じ index<0 の1条件で吸収せず、コードも分ける。
      if (!target) {
        sendError(connId, "PARTICIPANT_NOT_FOUND", errorMessageFor("PARTICIPANT_NOT_FOUND"));
        return err("PARTICIPANT_NOT_FOUND");
      }
      const index = state.timer.session.rotation.findIndex(
        (e) => rotationEntryId(e) === target.participantId,
      );
      if (index < 0) {
        sendError(connId, "NOT_IN_ROTATION", errorMessageFor("NOT_IN_ROTATION"));
        return err("NOT_IN_ROTATION");
      }
      // 実在（非代理）オフラインのメンバーは指名できない（R2-1: 無人ドライバーを防ぐ。
      // 自動交代・手動 SWITCH の computeIneligibleIndices と同じ判定に揃える）。
      // 代理(placeholder)は Web 非接続が常態で対面在席する実在の人を表すため offline でも許可する。
      if (target.presence === "offline" && !target.isPlaceholder) {
        sendError(connId, "DRIVER_ASSIGN_OFFLINE", errorMessageFor("DRIVER_ASSIGN_OFFLINE"));
        return err("DRIVER_ASSIGN_OFFLINE");
      }
      domainCmd.index = index;
    }
    // 代理参加者の participantId は client 供給（信頼境界外）。既存参加者との衝突で
    // participantId 突合（skip/rename 等）が誤動作するのを防ぐため、サーバーで一意に再生成する。
    if (domainCmd && domainCmd.command === "participant.addProxy") {
      domainCmd.participantId = codeGen.generateParticipantId();
    }
    if (!domainCmd) {
      sendError(connId, "UNKNOWN_COMMAND", `不明なコマンド: ${cmd.command}`);
      return err("UNKNOWN_COMMAND");
    }

    // 手動 SWITCH は自動交代と同じく一時離脱/オフライン(非placeholder)を飛ばす（B-2統合）。
    // 交代先の決定は decide 自身（nextEligibleIndex 経由）に一本化されたため、ここでは
    // ineligible を decide への入力として注入するだけで、決定結果を後から差し替えない。
    if (domainCmd.command === "session.act" && domainCmd.action === "SWITCH") {
      domainCmd.ineligible = computeIneligibleIndices(state.membership, state.timer);
    }

    const now = clock.now();
    const agg = { session: state.timer.session, clock: state.timer.clock };
    const result = decide(domainCmd, agg, now);

    if (result.isErr()) {
      // 表（ERROR_MESSAGES）に該当コードがあればそれを使う。無ければ元のままの
      // 汎用文言にフォールバックする（表に無いコードの文言・挙動は変えない）。
      sendError(connId, result.error.type, ERROR_MESSAGES[result.error.type] ?? `操作エラー: ${result.error.type}`);
      return err(result.error.type);
    }

    // decide が返したイベント列を他コマンドと同じ evolve ループへ通す（isManualSwitch分岐は撤去済み）。
    let newAgg = agg;
    for (const event of result.value) {
      newAgg = evolve(newAgg, event, now);
    }

    // 集約の反映 → Room レベルイベントの適用（順序は applyEvents が保証する・FR-103）。
    // PhaseSet/ProblemSet/ConfigSet/SessionCompleted 等はルームレベルで処理される。
    state = applyEvents(state, newAgg, result.value, now);

    // 現ドライバーが driver.skip で ineligible になり、かつ稼働中なら即座に次の eligible へ
    // 繰り上げる（plan.md L209）。交代先が無ければ advanceDriver が現状維持する。
    if (domainCmd.command === "driver.skip" && state.timer.clock.running) {
      const ineligible = computeIneligibleIndices(state.membership, state.timer);
      if (ineligible.has(state.timer.session.currentIndex)) {
        const advanced = advanceDriver(
          { session: state.timer.session, clock: state.timer.clock },
          ineligible,
          now,
        );
        state = applyEvents(state, advanced, [], now);
      }
    }

    // 指名先が一時離脱中なら離脱フラグを解除して自動復帰させる（Issue #13）。
    // DriverSwitched は正確な index で評価済みのため advanceDriver 差し替えはしない。
    // 現ドライバー自身の指名は decide が no-op（空イベント）を返すため、ここは実際に交代が
    // 起きたとき（result.value 非空）だけ走らせる。no-op で eligible を書き換えない。
    if (domainCmd.command === "driver.assign" && result.value.length > 0) {
      const targetPid = typeof cmd.participantId === "string" ? cmd.participantId : "";
      const targetEntry = state.timer.session.rotation.find(
        (e) => rotationEntryId(e) === targetPid,
      );
      if (targetEntry?.eligible === false) {
        // 集約はこの時点で反映済みなので、そのまま基底として渡す（applyEvents の契約）。
        state = applyEvents(
          state,
          { session: state.timer.session, clock: state.timer.clock },
          [{ type: "DriverResumed", participantId: targetPid, now }],
          now,
        );
      }
    }

    // config.members はもう保持しない（#95 S4a・D15）。かつてここには rotation を
    // 表示名へ写して `config.members` へミラーする代入があったが、snapshot を組む
    // たびに DTO が解決するようになったので不要になった（二重帳簿の解消）。
    commit(state);
    // clock 状態が変わった可能性があるので自動交代を調停する（FR-003）
    reconcileSchedule(state.timer);

    // セッションを畳む操作は在室者なら誰でも実行できる（#95 S3）。
    // 誰が実行したか分からないと画面が突然変わった理由を追えないため全員へ伝える（FR-077）。
    const noticeAction = SESSION_NOTICE_ACTIONS[domainCmd.command];
    if (noticeAction) {
      broadcaster.broadcastSignal(state.timer.code, {
        type: "signal",
        signal: "notice",
        action: noticeAction,
        actorName: participant.displayName,
        actorParticipantId: participant.id,
      });
    }

    return ok(undefined);
  }

  // ─── 専用ハンドラの合成（フェーズ7・パイプライン統合済み）───────────────────
  //
  // room.passphrase.set/ai.unlock/problem.request/problem.submit は、いずれも
  // handleCommand の switch から専用ケースを削除し、default（handleRoomCommand・
  // 共通パイプライン）経由へ合流させた。在室確認とアクター解決は handleRoomCommand
  // 側で1度だけ行い、その結果（{ room, actor }）を各ハンドラへ ctx として渡す。
  // 各ハンドラはドメイン処理のみを持つ関数へ縮退済み（FR-152〜154）。

  const handleRoomPassphraseSet = createRoomPassphraseSetHandler({
    commit,
    tokenStore,
  });

  const handleAiUnlock = createAiUnlockHandler({
    commit,
    rateLimitGate,
    aiUnlockKey,
    sendError,
  });

  const handleProblemRequest = createProblemRequestHandler({
    delegator,
    sendError,
  });

  const handleProblemSubmit = createProblemSubmitHandler({
    delegator,
    sendError,
  });

  /** connId からルームの状態一式を特定する（参加者として在室しているルーム） */
  function findStateByConnId(connId: string): RoomState | undefined {
    const membership = store
      .list()
      .find((r) => findParticipantByConnId(r, connId) !== undefined);
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

// ─── モブ順のランダム化（サーバー権威）──────────────────────────────────────

/**
 * Fisher–Yates で配列をその場シャッフルする（サーバープロセス内なので Math.random で十分）。
 * 返り値は引数と同じ配列（破壊的）。
 */
function fisherYatesShuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/**
 * member.shuffle の順列 order を生成する（サーバー権威）。
 * - 非稼働中: [0..len-1] を完全シャッフルする。
 * - 稼働中: currentIndex の位置を固定し、それ以外のインデックスのみをシャッフルして
 *   現ドライバーが「その位置で」現役のままになるようにする。
 *
 * @param len rotation の長さ
 * @param running clock が稼働中か
 * @param currentIndex 現ドライバーの位置（稼働中のみ固定対象）
 */
function buildShuffleOrder(len: number, running: boolean, currentIndex: number): number[] {
  if (len <= 1) return Array.from({ length: len }, (_, i) => i);

  if (!running) {
    return fisherYatesShuffle(Array.from({ length: len }, (_, i) => i));
  }

  // 稼働中: currentIndex 以外のインデックスだけシャッフルし、currentIndex はその位置に固定する。
  const others = Array.from({ length: len }, (_, i) => i).filter((i) => i !== currentIndex);
  fisherYatesShuffle(others);
  const order: number[] = [];
  let cursor = 0;
  for (let pos = 0; pos < len; pos++) {
    order.push(pos === currentIndex ? currentIndex : others[cursor++]!);
  }
  return order;
}

// ─── ドライバー対象外の判定 ──────────────────────────────────────────────────

/**
 * ドライバー対象外の rotation インデックス集合を返す（#95 S4a、判定は S4b で在席へ）。
 *
 * **適格は席が持ち、在席は名簿が持つ。** 一時離脱（`entry.eligible === false`）は
 * 輪の上の属性なので席から、タイマーの前に居るかは名簿から引く。
 *
 * ## `presence` では判定しない（D21）
 *
 * S4a までは `presence === "offline"` を「timer を見ていない」と読んでいた。参加者が
 * 持てる接続が timer のものだけだった間は同義だったが、**1 人が選択画面（ハブ）や
 * poker のタブを持てるようになると崩れる** —— その人は `online` なのにタイマーの前には
 * 居ないので、**タイマーを見ていない人にドライバーが回る**。
 *
 * 判定材料を timer の在席（`isPresentIn(p, TOOL_TIMER)`）へ替えてある。
 * ハブがまだ無い S4b の時点でも、選択画面とツールの 2 タブを開いた利用者が
 * 片方を閉じた瞬間にこの差が出る。
 *
 * **代理（`kind === "proxy"`）は在席の概念を持たないので常に対象である。** Web 非接続が
 * 常態で、対面に居る実在の人を表すため（外すとタイマー自動交代で永久に飛ばされる）。
 *
 * 対象者が 0 名になった場合は呼び出し側（`advanceDriver` / `decide`）が現状維持に
 * 縮退する（R15）。ここでは「全員が対象外」という集合をそのまま返す。
 */
function computeIneligibleIndices(membership: MembershipRoom, timer: TimerState): Set<number> {
  const watchingTimer = new Set(
    membership.participants.filter((p) => isPresentIn(p, TOOL_TIMER)).map((p) => p.id),
  );
  const set = new Set<number>();
  timer.session.rotation.forEach((entry, i) => {
    if (entry.eligible === false) {
      set.add(i);
      return;
    }
    if (entry.kind === "member" && !watchingTimer.has(entry.participantId)) set.add(i);
  });
  return set;
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
