/**
 * アプリケーションハンドラ
 * T034, T036, T040c, T045, T047, T049, T053, T055
 * フロー: validate → authorize → decide → evolve → store → broadcast
 */

import { ok, err, type Result } from "neverthrow";
import {
  decide,
  evolve,
  advanceDriver,
  transferHost,
  secondsLeft,
  checkPermission,
  conflictsWithExisting,
  ERROR_MESSAGES,
  errorMessageFor,
  type Room,
  type Participant,
  type SessionConfig,
  type Problem,
  type ErrorCode,
  type RemovalNotification,
  type Command,
} from "@tasuki/timer-core";
import {
  createTokenBucketLimiter,
  DEFAULT_CAPACITY,
  DEFAULT_REFILL_PER_SEC,
} from "@tasuki/rate-limit";
import type { Clock } from "../ports/clock.js";
import type { Broadcaster } from "../ports/broadcaster.js";
import type { RoomStore } from "../ports/room-store.js";
import type { RoomCodeGen } from "../ports/code-gen.js";
import type { Scheduler } from "./schedule.js";
import type { ProblemDelegator } from "./problem-delegation.js";
import { createTokenStore } from "./token-store.js";
import { createRateLimitGate } from "./rate-limit-gate.js";
import { applyEvents } from "./apply-room-level-event.js";
import { buildDomainCommand } from "./build-domain-command.js";
import { createRoomCreateHandler, type CreateResult } from "./command-handlers/room-create.js";
import { createRoomJoinHandler, type JoinResult } from "./command-handlers/room-join.js";
export type { CreateResult } from "./command-handlers/room-create.js";
export type { JoinResult } from "./command-handlers/room-join.js";
import { createTimePingHandler } from "./command-handlers/time-ping.js";
import { createRoleSetHandler } from "./command-handlers/role-set.js";
import { createRoomPassphraseSetHandler } from "./command-handlers/room-passphrase-set.js";
import { createAiUnlockHandler } from "./command-handlers/ai-unlock.js";
import { createHostTransferHandler } from "./command-handlers/host-transfer.js";
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
 * うち `packages/timer-core/src/permissions.ts` の `REGISTERED_COMMANDS` に登録されている
 * 25個が「共通パイプラインが実際にドメイン処理する」コマンドであり、`break.start`/
 * `break.end` の2個は wire スキーマ上は残っているが `REGISTERED_COMMANDS` にも
 * `buildDomainCommand` の switch にも無い（`default` → `UNKNOWN_COMMAND` になる
 * 到達しない枝。`reconcileSchedule` のコメント参照）。この2個も `handleCommand` の
 * default 分岐（`handleRoomCommand`）へは届く必要があるため（現状の挙動を変えない）、
 * 型としては `RoomScopedCommand` に含めておく。
 */
export type RoomScopedCommand = Exclude<Command, PreRoomCommand>;

export interface HandlerDeps {
  store: RoomStore;
  clock: Clock;
  broadcaster: Broadcaster;
  codeGen: RoomCodeGen;
  /** サーバー権威タイマー（省略時は自動交代をスケジュールしない＝テスト用） */
  scheduler?: Scheduler | undefined;
  /** お題代表生成（省略時は problem.request/submit を受け付けない） */
  delegator?: ProblemDelegator | undefined;
  /** サーバー全体のルーム数上限（省略時は 50）。DoS 緩和用。 */
  maxRooms?: number | undefined;
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
   * 不在タイマーの解放だけが静かに失われる）。`tsconfig.json` の `include` は
   * `["src/**\/*"]` なので、必須にすると `tsc --noEmit` が `create-sync-server.ts` の
   * 漏れを検出する。テスト（`test/**`）は include の外なので影響を受けない。
   *
   * ⚠ **この対処は「テストが型検査の対象外である」ことに依存している。**
   * `include` にテストを加えるなら、その時点でテスト側の呼び出しにも
   * この依存を渡すか、別の形で本番配線を検査すること。
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
 * かつては全ハンドラが `CreateResult` を返す形で、`hostToken: ""` のような
 * **呼び出し側が決して読まないダミー値を 10 箇所で充填していた**。
 */
export type CommandResult = Result<CreateResult | JoinResult | undefined, ErrorCode>;

export function makeHandlers(deps: HandlerDeps) {
  const { store, clock, broadcaster, codeGen, scheduler, delegator } = deps;
  const maxRooms = deps.maxRooms ?? 50;
  const aiUnlockKey = deps.aiUnlockKey;

  // トークン保持（ホスト/リジュームトークン・ルームパスフレーズ）は
  // `token-store.ts` の `createTokenStore()` へ切り出した（フェーズ2・純粋な移動）。
  // ハンドラインスタンスごとに1個生成し、モジュール共有を避けてテスト間汚染を防ぐ。
  const tokenStore = createTokenStore();

  // 入室失敗のレート制限（コード・合言葉の総当たりの緩和）。
  // **数える単位は接続ではなくクライアント（IP の HMAC）である**（#103・ADR 0011 S1）。
  // 接続単位だと再接続で窓がリセットされ、総当たりを止められなかった。
  //
  // ★ room.join と ai.unlock は「総当たりの緩和」という同じ目的のため、
  // 意図的に同一インスタンスのバケツを共有する。makeHandlers 内で 1 度しか生成しない
  // ことで共有が構造的に保証される。コマンドごとに別インスタンスを作ると、
  // ai.unlock の総当たり対策が黙って弱まる。
  // （共有が壊れていないことは `test/join-rate-limit.test.ts` の
  //   「room.join と ai.unlock のレート制限バケツの共有」で直接検査している。）
  const rateLimitGate = createRateLimitGate(
    createTokenBucketLimiter({
      capacity: DEFAULT_CAPACITY,
      refillPerSec: DEFAULT_REFILL_PER_SEC,
    }),
  );

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
   * `apps/sync/test/error-code-coverage.test.ts` の `collectServerErrorCodes()` が
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

  /** ルームの clock 状態に応じて次回自動交代をスケジュール/解除する（FR-003） */
  function reconcileSchedule(room: Room): void {
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
    const room = store.get(roomCode);
    if (!room || !room.clock.running) return;
    const now = clock.now();
    const agg = { session: room.session, clock: room.clock };
    const newAgg = advanceDriver(agg, computeIneligibleIndices(room), now);
    const updated: Room = { ...room, session: newAgg.session, clock: newAgg.clock };
    store.put(updated);
    broadcaster.broadcastSnapshot(updated.code, updated);
    broadcaster.broadcastSignal(updated.code, {
      type: "signal",
      signal: "switch",
      nextDriverName: rotationDisplayNames(updated)[updated.session.currentIndex] ?? "",
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
    clock,
    broadcaster,
    codeGen,
    tokenStore,
    maxRooms,
    sendError,
  });

  const handleRoomJoin = createRoomJoinHandler({
    store,
    clock,
    broadcaster,
    codeGen,
    tokenStore,
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
    let targetRoom = findRoomByConnId(connId);

    if (!targetRoom) {
      sendError(connId, "NOT_IN_ROOM", errorMessageFor("NOT_IN_ROOM"));
      return err("NOT_IN_ROOM");
    }

    const participant = targetRoom.participants.find((p) => p.connId === connId);
    if (!participant) {
      return err("PARTICIPANT_NOT_FOUND");
    }

    // 権限チェック（FR-017・FR-071）。段階（startedAt）と役割と自己対象かの3点だけを
    // 事実として渡し、可否の規則は core の checkPermission が単独で持つ。
    // 関係的権限（本人 or host）もローテーション所有権も、その規則表の中で表現される。
    if (rejectIfUnauthorized(connId, targetRoom, participant, cmd)) {
      return err("UNAUTHORIZED");
    }

    // 参加者の退出（⑪）。参加者は Room レベルのため decide ではなくここで扱う。
    // 実装本体は command-handlers/participant-remove.ts へ移動した（フェーズ5・
    // 純粋な移動。ロジック変更なし）。ここでは在室確認・アクター解決・
    // rejectIfUnauthorized（上で完了済み）の結果を ctx として渡すだけ。
    if (cmd.command === "participant.remove") {
      return handleParticipantRemove(
        connId,
        { room: targetRoom, actor: participant },
        cmd as { command: "participant.remove"; [key: string]: unknown },
        {
          store,
          clock,
          broadcaster,
          reconcileSchedule,
          rotationDisplayNames,
          transferHostBeforeRemoval,
          messageForRemoval,
          sendError,
          destroyRoom,
        },
      );
    }

    // role.set は decide/evolve を通らない Room レベルの専用処理（フェーズ7合流）。
    // 実装本体は command-handlers/role-set.ts へ移動済み。ここでは在室確認・
    // アクター解決・rejectIfUnauthorized（上で完了済み）の結果を ctx として渡すだけ。
    if (cmd.command === "role.set") {
      return handleRoleSet(
        connId,
        { room: targetRoom, actor: participant },
        cmd as { command: "role.set"; participantId: string; role: "editor" | "viewer" },
      );
    }

    // room.passphrase.set も decide/evolve を通らない Room レベルの専用処理（フェーズ7合流）。
    if (cmd.command === "room.passphrase.set") {
      return handleRoomPassphraseSet(
        connId,
        { room: targetRoom, actor: participant },
        cmd as { command: "room.passphrase.set"; passphrase: string },
      );
    }

    // ai.unlock も decide/evolve を通らない Room レベルの専用処理（フェーズ7合流）。
    if (cmd.command === "ai.unlock") {
      return handleAiUnlock(
        connId,
        { room: targetRoom, actor: participant },
        cmd as { command: "ai.unlock"; key: string },
      );
    }

    // host.transfer も decide/evolve を通らない Room レベルの専用処理（フェーズ7合流）。
    if (cmd.command === "host.transfer") {
      return handleHostTransfer(
        connId,
        { room: targetRoom, actor: participant },
        cmd as { command: "host.transfer"; participantId: string },
      );
    }

    // problem.request/problem.submit も decide/evolve を通らない Room レベルの
    // 専用処理（フェーズ7合流）。旧 requireEditor（在室確認・アクター解決・
    // rejectIfUnauthorized を束ねたヘルパ）は、その3つを共通パイプラインが既に
    // 済ませたため不要になり撤去した（FR-156: 権限判定の呼び出し箇所を1箇所に集約）。
    if (cmd.command === "problem.request") {
      return handleProblemRequest(
        connId,
        { room: targetRoom, actor: participant },
        cmd as { command: "problem.request"; requestId: string },
      );
    }
    if (cmd.command === "problem.submit") {
      return handleProblemSubmit(
        connId,
        { room: targetRoom, actor: participant },
        cmd as {
          command: "problem.submit";
          requestId: string;
          problem: Problem;
          usedFallback: boolean;
        },
      );
    }

    // ドメインコマンドを構築して decide/evolve を実行。
    // member.shuffle は順列をサーバーが生成する（wire は order を持たない）。
    // 稼働中は現ドライバー位置を固定し、それ以外をシャッフルする（現ドライバー現役維持）。
    const domainCmd =
      cmd.command === "member.shuffle"
        ? {
            command: "member.shuffle" as const,
            order: buildShuffleOrder(
              targetRoom.session.rotation.length,
              targetRoom.clock.running,
              targetRoom.session.currentIndex,
            ),
          }
        : buildDomainCommand(cmd);
    // 輪に並べられるのは在室者だけ（D6b）。実在しない ID を rotation に入れると
    // 表示名を引けない枠が残り、順番表示も指名も破綻する。
    if (domainCmd && domainCmd.command === "member.add") {
      const exists = targetRoom.participants.some(
        (p) => p.participantId === domainCmd.participantId,
      );
      if (!exists) {
        sendError(connId, "PARTICIPANT_NOT_FOUND", errorMessageFor("PARTICIPANT_NOT_FOUND"));
        return err("PARTICIPANT_NOT_FOUND");
      }
    }
    // 代理追加の表示名一意性もここで検査する（D6b）。改名と同じ理由で、rotation が
    // 参加者IDの配列になったため集約からは名前の重複を判定できない。
    // 「既存の表示名と重複する代理は追加できない」という従来の挙動を維持する。
    if (domainCmd && domainCmd.command === "participant.addProxy") {
      const conflicts = conflictsWithExisting(targetRoom.participants, domainCmd.displayName);
      if (conflicts) {
        sendError(connId, "DuplicateName", errorMessageFor("DuplicateName"));
        return err("DuplicateName");
      }
    }
    // 改名の表示名一意性はここで検査する（T052・D6b）。rotation が参加者IDの配列になり
    // 名前の重複を集約から判定できなくなったため、participants を持つこの層が受け持つ。
    // 「既存の表示名へは改名できない」という従来の挙動はそのまま維持する（後方互換）。
    if (domainCmd && domainCmd.command === "participant.rename") {
      const target = targetRoom.participants.find(
        (p) => p.participantId === domainCmd.participantId,
      );
      // 対象が存在しなければ早期に拒否する（実体は対象不在なのに DuplicateName 等の
      // 誤った理由で失敗させないため）。
      if (!target) {
        sendError(connId, "PARTICIPANT_NOT_FOUND", errorMessageFor("PARTICIPANT_NOT_FOUND"));
        return err("PARTICIPANT_NOT_FOUND");
      }
      // 自分自身は比較対象から外す（現在名と同じ名前への改名は no-op 相当で許可する）。
      // 大文字小文字は無視する（表示上の識別が付かないため衝突とみなす・FR-046/048）。
      const conflicts = conflictsWithExisting(
        targetRoom.participants,
        domainCmd.displayName,
        target.participantId,
      );
      if (conflicts) {
        sendError(connId, "DuplicateName", errorMessageFor("DuplicateName"));
        return err("DuplicateName");
      }
    }
    // 指名は participantId → rotation index を解決して decide へ渡す（Issue #13）。
    // 集約は participants を持たないため、rotation 内の位置をここで確定する。
    if (domainCmd && domainCmd.command === "driver.assign") {
      const targetPid = typeof cmd.participantId === "string" ? cmd.participantId : "";
      const target = targetRoom.participants.find((p) => p.participantId === targetPid);
      // 対象解決を2段に分ける（Issue #29・T112）。「対象が存在しない」と
      // 「対象は居るが rotation に居ない（見学者）」は解消手段が異なるため、
      // 同じ index<0 の1条件で吸収せず、コードも分ける。
      if (!target) {
        sendError(connId, "PARTICIPANT_NOT_FOUND", errorMessageFor("PARTICIPANT_NOT_FOUND"));
        return err("PARTICIPANT_NOT_FOUND");
      }
      const index = targetRoom.session.rotation.indexOf(target.participantId);
      if (index < 0) {
        sendError(connId, "NOT_IN_ROTATION", errorMessageFor("NOT_IN_ROTATION"));
        return err("NOT_IN_ROTATION");
      }
      // 実在（非代理）オフラインのメンバーは指名できない（R2-1: 無人ドライバーを防ぐ。
      // 自動交代・手動 SWITCH の computeIneligibleIndices と同じ判定に揃える）。
      // 代理(placeholder)は Web 非接続が常態で対面在席する実在の人を表すため offline でも許可する。
      if (target.presence === "offline" && target.isPlaceholder !== true) {
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
      domainCmd.ineligible = computeIneligibleIndices(targetRoom);
    }

    const now = clock.now();
    const agg = { session: targetRoom.session, clock: targetRoom.clock };
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
    targetRoom = applyEvents(targetRoom, newAgg, result.value, now);

    // startedAt は「一度でも開始したか」を表す単調フラグ（host-spof-relaxation D2）。
    // かつては PhaseSet(phase==="session") と SessionStarted の2イベントに限定して
    // 記録していたが、これはイベント名のホワイトリストであり、時計を走らせる別のイベント
    // （例: SessionResumed）が漏れると「時計が走っているのに startedAt が未設定」という
    // 状態が生じる（Issue #22 実測: 新規ルームへ session.act RESUME を単独送信すると
    // clock.running=true / startedAt=undefined になる。session.act は EDITOR_PLUS_COMMANDS
    // に属し phase によるゲートが無いため到達可能）。
    // イベント名を列挙する設計は将来イベントが増えるたびに更新を要し、この種の見落としが
    // 既に繰り返し起きている。そこでイベント名ではなく「イベント適用後の状態」で判定する:
    // 時計が走っており、かつ startedAt がまだ未設定なら、この時点を開始時刻として記録する。
    // 単調性（一度立てたら上書きしない）は startedAt == null の条件で維持される。
    // なお phase.set(session) 単独は時計を動かさないため、この状態判定だけでは拾えない
    // （実測確認済み）。そのため PhaseSet(phase==="session") 時の記録は
    // applyRoomLevelEvent 側に残してある。
    if (targetRoom.clock.running && targetRoom.startedAt == null) {
      targetRoom = { ...targetRoom, startedAt: now };
    }

    // 現ドライバーが driver.skip で ineligible になり、かつ稼働中なら即座に次の eligible へ
    // 繰り上げる（plan.md L209）。交代先が無ければ advanceDriver が現状維持する。
    if (domainCmd.command === "driver.skip" && targetRoom.clock.running) {
      const ineligible = computeIneligibleIndices(targetRoom);
      if (ineligible.has(targetRoom.session.currentIndex)) {
        const advanced = advanceDriver(
          { session: targetRoom.session, clock: targetRoom.clock },
          ineligible,
          now,
        );
        targetRoom = applyEvents(targetRoom, advanced, [], now);
      }
    }

    // 指名先が一時離脱中なら離脱フラグを解除して自動復帰させる（Issue #13）。
    // DriverSwitched は正確な index で評価済みのため advanceDriver 差し替えはしない。
    // 現ドライバー自身の指名は decide が no-op（空イベント）を返すため、ここは実際に交代が
    // 起きたとき（result.value 非空）だけ走らせる。no-op で driverEligible を書き換えない。
    if (domainCmd.command === "driver.assign" && result.value.length > 0) {
      const targetPid = typeof cmd.participantId === "string" ? cmd.participantId : "";
      const target = targetRoom.participants.find((p) => p.participantId === targetPid);
      if (target?.driverEligible === false) {
        // 集約はこの時点で反映済みなので、そのまま基底として渡す（applyEvents の契約）。
        targetRoom = applyEvents(
          targetRoom,
          { session: targetRoom.session, clock: targetRoom.clock },
          [{ type: "DriverResumed", participantId: targetPid, now }],
          now,
        );
      }
    }

    const updatedRoom: Room = {
      ...targetRoom,
      // config.members を session.rotation に同期する。
      // member.add/remove/move・addProxy は rotation のみ更新するため、ミラーしないと
      // 完成記録（config.members を使用）が古いメンバーになる。
      // rotation は参加者IDの配列なので、表示名へ写してから載せる（D6b）。
      config: { ...targetRoom.config, members: rotationDisplayNames(targetRoom) },
    };

    store.put(updatedRoom);
    broadcaster.broadcastSnapshot(updatedRoom.code, updatedRoom);
    // clock 状態が変わった可能性があるので自動交代を調停する（FR-003）
    reconcileSchedule(updatedRoom);

    // セッションを畳む操作は、開始後は主催者以外も実行できる（FR-063）。
    // 誰が実行したか分からないと画面が突然変わった理由を追えないため全員へ伝える（FR-077）。
    const noticeAction = SESSION_NOTICE_ACTIONS[domainCmd.command];
    if (noticeAction) {
      broadcaster.broadcastSignal(updatedRoom.code, {
        type: "signal",
        signal: "notice",
        action: noticeAction,
        actorName: participant.displayName,
        actorParticipantId: participant.participantId,
      });
    }

    return ok(undefined);
  }

  // ─── 専用ハンドラの合成（フェーズ7・パイプライン統合済み）───────────────────
  //
  // role.set/room.passphrase.set/ai.unlock/host.transfer/problem.request/
  // problem.submit は、いずれも handleCommand の switch から専用ケースを削除し、
  // default（handleRoomCommand・共通パイプライン）経由へ合流させた。在室確認・
  // アクター解決・rejectIfUnauthorized（旧 requireEditor が束ねていた3つを含む）は
  // handleRoomCommand 側で1度だけ行い、その結果（{ room, actor }）を各ハンドラへ
  // ctx として渡す。各ハンドラはドメイン処理のみを持つ関数へ縮退済み（FR-152〜154, 156）。

  const handleRoleSet = createRoleSetHandler({
    store,
    broadcaster,
    sendError,
  });

  const handleRoomPassphraseSet = createRoomPassphraseSetHandler({
    store,
    broadcaster,
    tokenStore,
  });

  const handleAiUnlock = createAiUnlockHandler({
    store,
    broadcaster,
    rateLimitGate,
    aiUnlockKey,
    sendError,
  });

  const handleHostTransfer = createHostTransferHandler({
    store,
    broadcaster,
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

  /**
   * 権限を判定し、拒否ならエラーを送って true を返す（呼び出し側は即 return する）。
   *
   * 判定そのものは `@tasuki/timer-core` の `checkPermission()` が単独で担う（FR-071）。
   * かつて5層に分散していた検査（集合ベース・関係ベース・個別ガード・requireEditor・
   * 専用ハンドラの host 検査）は、すべてこの1関数の呼び出しに集約されている。
   * 判定に必要な事実の算出（在室・段階・自己対象か）だけがサーバー側の責務である。
   */
  function rejectIfUnauthorized(
    connId: string,
    room: Room,
    actor: Participant,
    cmd: { command: string; [key: string]: unknown },
  ): boolean {
    const verdict = checkPermission({
      command: cmd.command,
      role: actor.role,
      started: room.startedAt != null,
      isSelfTarget: resolveIsSelfTarget(room, actor, cmd),
    });
    if (verdict.allowed) return false;
    sendError(connId, verdict.code, verdict.message);
    return true;
  }

  /** connId からルームを特定する（参加者として在室しているルーム） */
  function findRoomByConnId(connId: string): Room | undefined {
    return store
      .list()
      .find((r) => r.participants.some((p) => p.connId === connId));
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

  /** ルーム回収時の後始末。当該ルームのホスト/リジュームトークンを解放する。 */
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

// ─── 権限判定に必要な事実の算出 ───────────────────────────────────────────────

/**
 * 対象コマンドの指定方法ごとに「操作対象が実行者自身か」を算出する（FR-068）。
 *
 * 対象の指定方法がコマンドごとに異なる（participantId / rotation の位置）ため、
 * 算出を各所へ散らすと判定漏れが起きる。`checkPermission()` を呼ぶ前に必ずここを通す。
 *
 * rotation が参加者IDの配列になった（D6b）ことで全ての判定が識別子ベースになり、
 * かつて表示名で突き合わせていた2件（member.add / member.remove）の
 * 「同名参加者を区別できない」限界は解消した。
 *
 * 設計: docs/plans/host-spof-relaxation/plan.md「isSelfTarget の算出は単一の resolver に集約する」
 */
function resolveIsSelfTarget(
  room: Room,
  actor: Participant,
  cmd: { command: string; [key: string]: unknown },
): boolean {
  switch (cmd.command) {
    // participantId で対象を指す関係コマンド。
    case "participant.rename":
    case "driver.skip":
    case "driver.resume":
    case "participant.remove":
    case "role.set":
      return cmd.participantId === actor.participantId;

    // 参加者IDで rotation への参加を指す。
    case "member.add":
      return cmd.participantId === actor.participantId;

    // rotation の位置で対象を指す（中身は参加者ID）。
    case "member.remove":
      return room.session.rotation[Number(cmd.index)] === actor.participantId;

    // 上記以外は対象を持たない（host.transfer の participantId は「移譲先」であり
    // 自己対象という概念が成立しないため、ここには含めない）。
    default:
      return false;
  }
}

/**
 * 退出しようとしている現ホストから、残る在室者へホストを引き継いだルームを返す（plan.md D2b）。
 *
 * D2b の目的は「ホストが抜けた後も誰かが実際に操作できる」ことである。したがって
 * 単純に参加時刻が最も古い在室者を選んではならない。次の優先順で選ぶ。
 *
 *   1. オンラインの編集者   ← `presence.ts` の自動委譲と同じ条件
 *   2. オンラインの見学者   ← 誰も操作できない部屋を残さないための保険
 *   3. オフラインの編集者   ← 全員オフラインならアイドル回収に任せる
 *   4. オフラインの見学者
 *
 * 同順位内は参加時刻の古い順。代理（isPlaceholder）は自分では操作できないので候補にしない。
 *
 * **オフラインの見学者を選んではならない理由（実際に踏んだ落とし穴）:**
 * 参加時刻だけで選ぶと、切断済みの見学者が新ホストになり、オンラインの編集者が
 * 開始前操作を実行できない状態が作れてしまう。D2b が防ぐはずだった詰みそのものである。
 * しかも自動委譲は「ホストの切断」契機でしか発火しないため、既にオフラインの参加者が
 * ホストへ昇格しても新たな委譲タイマーは張られず、自動復旧もしない。
 *
 * 候補がいなければ引き継がずそのまま返す。このとき残るのは代理のみで、代理は
 * presence: "offline" で登録されるためアイドル回収の対象になる。
 *
 * 役割の付け替えは core の純粋関数 `transferHost` に委ねる（二重実装の乖離を防ぐ・R2-4）。
 */
function transferHostBeforeRemoval(room: Room, leavingParticipantId: string): Room {
  /** 小さいほど優先。オンラインかどうかを役割より優先する（操作できることが第一）。 */
  const priority = (p: Participant): number =>
    (p.presence === "online" ? 0 : 2) + (p.role === "viewer" ? 1 : 0);

  const successor = room.participants
    .filter((p) => p.participantId !== leavingParticipantId && p.isPlaceholder !== true)
    .sort((a, b) => priority(a) - priority(b) || a.joinedAt - b.joinedAt)[0];
  if (!successor) return room;
  return transferHost(room, successor.participantId);
}

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
 * driverEligible===false の参加者を rotation インデックスへ対応付けた集合を返す。
 * rotation は参加者IDの配列（D6b）なので、ID でそのまま突き合わせる。
 */
function computeIneligibleIndices(room: Room): Set<number> {
  const ineligibleIds = new Set(
    room.participants
      // 一時離脱(driverEligible=false)は対象外。実在の切断中(offline)の人も対象外（R2-1）。
      // ただし代理(placeholder)は Web 非接続が常態で対面在席する実在の人を表すため、
      // offline でも eligible として扱う（さもないとタイマー自動交代で永久に飛ばされ交代しない）。
      .filter((p) => p.driverEligible === false || (p.presence === "offline" && p.isPlaceholder !== true))
      .map((p) => p.participantId),
  );
  const set = new Set<number>();
  room.session.rotation.forEach((participantId, i) => {
    if (ineligibleIds.has(participantId)) set.add(i);
  });
  return set;
}

// ─── rotation（参加者ID）→ 表示名の写像 ─────────────────────────────────────

/**
 * rotation を表示名の配列へ写す（D6b）。
 *
 * rotation は参加者IDの配列なので、人に見せる名前（`config.members` のミラー、
 * `nextDriverName` シグナル）は必ずここを通す。名前解決を各所へ散らすと、
 * 本 Issue で繰り返し踏んだ「同名の取り違え」が別の形で再発する。
 *
 * 対応する参加者が居ない ID は空文字になるが、退出時に rotation からも外し、
 * 追加時は在室者だけを受け付けるため通常は発生しない。
 */
function rotationDisplayNames(room: Room): string[] {
  const names = new Map(room.participants.map((p) => [p.participantId, p.displayName]));
  return room.session.rotation.map((participantId) => names.get(participantId) ?? "");
}

// ─── ルームレベルのイベント適用 ──────────────────────────────────────────────
//
// `applyEvents`/`applyRoomLevelEvent`（集約反映 → Room レベルイベント適用の
// 適用順序契約を含む）は `apply-room-level-event.ts` へ移動した（フェーズ4・
// 純粋な移動。ロジック変更なし）。本ファイルはファイル先頭で `applyEvents` を
// import して従来通り呼び出す。適用順の依存関係の説明は移動先の docstring を参照。
