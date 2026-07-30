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
  initialAggregate,
  secondsLeft,
  checkPermission,
  canRemoveParticipant,
  canDemote,
  conflictsWithExisting,
  removalNotificationFor,
  ERROR_MESSAGES,
  errorMessageFor,
  type Room,
  type Participant,
  type SessionConfig,
  type Problem,
  type IntervalMinutes,
  type ErrorCode,
  type RemovalNotification,
  type Command,
} from "@tdd-mob/core";
import type { Clock } from "../ports/clock.js";
import type { Broadcaster } from "../ports/broadcaster.js";
import type { RoomStore } from "../ports/room-store.js";
import type { RoomCodeGen } from "../ports/code-gen.js";
import type { Scheduler } from "./schedule.js";
import type { ProblemDelegator } from "./problem-delegation.js";
import { constantTimeEqual } from "./secure-compare.js";
import { createTokenStore } from "./token-store.js";
import { createJoinRateLimiter } from "./join-rate-limiter.js";
import { applyEvents } from "./apply-room-level-event.js";
import { buildDomainCommand } from "./build-domain-command.js";

/**
 * 在室を前提としないコマンド（FR-151）。
 *
 * `room.create`/`room.join`/`time.ping` は `handleCommand` の switch で早期分岐する。
 * `presence.ping` は `apps/sync/src/server.ts` が `handleCommand` を呼ぶ**手前**で
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
 * うち `packages/core/src/permissions.ts` の `REGISTERED_COMMANDS` に登録されている
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
  scheduler?: Scheduler;
  /** お題代表生成（省略時は problem.request/submit を受け付けない） */
  delegator?: ProblemDelegator;
  /** サーバー全体のルーム数上限（省略時は 50）。DoS 緩和用。 */
  maxRooms?: number;
  /** AI 解錠合言葉。undefined なら AI 機能は無効（解錠は常に失敗＝存在秘匿）。
   *  server.ts はトークン未設定時にもここを undefined にする。 */
  aiUnlockKey?: string;
}

/** `room.create` が呼び出し元へ返す値。ホストトークンは作成者だけが受け取る。 */
export interface CreateResult {
  code: string;
  participantId: string;
  hostToken: string;
  resumeToken: string;
}

/** `room.join` が呼び出し元へ返す値。参加者はホストトークンを持たない。 */
export interface JoinResult {
  code: string;
  participantId: string;
  resumeToken: string;
}

/**
 * **コマンド処理の結果。**
 *
 * ⚠ **本番（`apps/sync/src/server.ts`）はこの戻り値を使っていない**
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

  // 単一接続あたりの room.join 連続失敗のレート制限（コード列挙の緩和）。
  // 正常利用には干渉しない緩い閾値。本来の防御はエッジ/IP 層（リバースプロキシ等）で行うべき。
  const JOIN_FAIL_MAX = 30;
  // `join-rate-limiter.ts` の createJoinRateLimiter() へ切り出した（フェーズ3・純粋な移動）。
  // ★ room.join と ai.unlock は「合言葉/コード総当たりの緩和」という同じ目的のため、
  // 意図的に同一インスタンス（joinRateLimiter）の窓を共有する。この関数は
  // makeHandlers 内で1度しか呼ばない（コマンドごとに別インスタンスを作らない）ことで、
  // 共有が構造的に保証される（join-rate-limiter.ts のdocstring参照）。
  const joinRateLimiter = createJoinRateLimiter({ windowMs: 10_000, max: JOIN_FAIL_MAX });

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

      case "role.set":
        return handleRoleSet(
          connId,
          cmd as { command: "role.set"; participantId: string; role: "editor" | "viewer" },
        );

      case "room.passphrase.set":
        return handleRoomPassphraseSet(
          connId,
          cmd as { command: "room.passphrase.set"; passphrase: string },
        );

      case "ai.unlock":
        return handleAiUnlock(
          connId,
          cmd as { command: "ai.unlock"; key: string },
        );

      case "host.transfer":
        return handleHostTransfer(
          connId,
          cmd as { command: "host.transfer"; participantId: string },
        );

      case "problem.request":
        return handleProblemRequest(
          connId,
          cmd as { command: "problem.request"; requestId: string },
        );

      case "problem.submit":
        return handleProblemSubmit(
          connId,
          cmd as {
            command: "problem.submit";
            requestId: string;
            problem: Problem;
            usedFallback: boolean;
          },
        );

      default:
        return handleRoomCommand(connId, cmd);
    }
  }

  /** ルーム作成 */
  async function handleRoomCreate(
    connId: string,
    cmd: { command: "room.create"; displayName: string; config?: SessionConfig; roomName?: string },
  ): Promise<Result<CreateResult, ErrorCode>> {
    const now = clock.now();
    // ルーム数上限（DoS 緩和）。上限到達時は作成を拒否する。
    if (store.list().length >= maxRooms) {
      sendError(connId, "ROOM_LIMIT_EXCEEDED", "サーバーのルーム数が上限に達しています。時間をおいて再試行してください。");
      return err("ROOM_LIMIT_EXCEEDED");
    }
    // ルーム名があれば「slug-接尾辞」、無ければランダム。衝突時は接尾辞を引き直す。
    let code = codeGen.generate(cmd.roomName);
    for (let i = 0; i < 5 && store.get(code) !== undefined; i++) {
      code = codeGen.generate(cmd.roomName);
    }
    const participantId = codeGen.generateParticipantId();
    const resumeToken = codeGen.generateResumeToken();
    const hostToken = codeGen.generateResumeToken();

    const defaultConfig: SessionConfig = cmd.config ?? {
      language: "TypeScript",
      difficulty: "easy",
      members: [cmd.displayName],
      intervalMinutes: 5 as IntervalMinutes,
    };

    // rotation は参加者IDの配列（D6b）。作成時点の在室者は作成者ただ一人なので、
    // config.members に何が入っていても輪に並べられるのは作成者だけである。
    const agg = initialAggregate(defaultConfig, [participantId]);

    const host: Participant = {
      participantId,
      connId,
      displayName: cmd.displayName,
      role: "host",
      presence: "online",
      hasAiKey: false,
      joinedAt: now,
    };

    const room: Room = {
      code,
      createdAt: now,
      hostParticipantId: participantId,
      // config.members は rotation の表示名ミラー（D6b）。作成者以外は輪に並べないので、
      // クライアントが渡した members に他人が含まれていてもここで作成者だけに揃える。
      config: { ...defaultConfig, members: [cmd.displayName] },
      problem: null,
      session: agg.session,
      clock: agg.clock,
      phase: "setup",
      participants: [host],
      sessionRecords: [],
      handoffNote: "",
      onBreak: false,
    };

    store.put(room);
    tokenStore.issueHost(code, hostToken);
    tokenStore.issueResume(resumeToken, { participantId, roomCode: code });

    broadcaster.sendTo(connId, {
      type: "room.created",
      code,
      hostToken,
      resumeToken,
      participantId,
    });

    broadcaster.broadcastSnapshot(code, room);

    return ok({ code, participantId, hostToken, resumeToken });
  }

  /** ルーム参加 */
  async function handleRoomJoin(
    connId: string,
    cmd: {
      command: "room.join";
      code: string;
      displayName: string;
      hasAiKey: boolean;
      resumeToken?: string;
      passphrase?: string;
    },
  ): Promise<Result<JoinResult, ErrorCode>> {
    const now = clock.now();

    // 連続失敗が閾値を超えた接続は一時的に拒否（コード総当たりの緩和）。
    if (joinRateLimiter.recentFailures(connId, now).length >= JOIN_FAIL_MAX) {
      sendError(connId, "JOIN_RATE_LIMITED", errorMessageFor("JOIN_RATE_LIMITED"));
      return err("JOIN_RATE_LIMITED");
    }

    const room = store.get(cmd.code);

    if (!room) {
      // 失敗を記録（次回以降のレート判定に使う）。
      joinRateLimiter.recordFailure(connId, now);
      sendError(connId, "ROOM_NOT_FOUND", "指定されたルームコードが見つかりません");
      return err("ROOM_NOT_FOUND");
    }

    // リジューム処理
    if (cmd.resumeToken) {
      const tokenData = tokenStore.getResume(cmd.resumeToken);
      if (tokenData && tokenData.roomCode === cmd.code) {
        const existingParticipant = room.participants.find(
          (p) => p.participantId === tokenData.participantId,
        );
        if (existingParticipant) {
          const updatedRoom: Room = {
            ...room,
            participants: room.participants.map((p) =>
              p.participantId === tokenData.participantId
                ? { ...p, connId, presence: "online" }
                : p,
            ),
          };
          store.put(updatedRoom);
          broadcaster.sendTo(connId, {
            type: "snapshot",
            room: updatedRoom,
          });
          broadcaster.broadcastSnapshot(cmd.code, updatedRoom);
          return ok({
            code: cmd.code,
            participantId: tokenData.participantId,
            resumeToken: cmd.resumeToken,
          });
        }
      }
    }

    // パスフレーズ保護ルームは新規参加時に一致を要求する（R4-2）。
    // resume（再接続）は上の resume ブロックで return 済みのためここには来ない＝再認証不要。
    const requiredPassphrase = tokenStore.getPassphrase(cmd.code);
    // 保持側と同じく前後空白を正規化して比較する。
    const providedPassphrase = (cmd.passphrase ?? "").trim();
    if (requiredPassphrase !== undefined && providedPassphrase !== requiredPassphrase) {
      // 失敗をレート制限に積算（パスフレーズ総当たりの緩和・既存 join 制限と統合）。
      joinRateLimiter.recordFailure(connId, now);
      const code: ErrorCode = providedPassphrase
        ? "PASSPHRASE_MISMATCH"
        : "PASSPHRASE_REQUIRED";
      sendError(
        connId,
        code,
        code === "PASSPHRASE_REQUIRED"
          ? errorMessageFor("PASSPHRASE_REQUIRED")
          : errorMessageFor("PASSPHRASE_MISMATCH"),
      );
      return err(code);
    }

    // 新規参加者は editor として登録（UX 再設計の2層モデル: 名乗って参加した人は
    // すぐドライバーに加われる。ローテーション加入は別操作＝「ドライバーに加わる」）。
    // 純粋な見学者は host が role.set で viewer へ降格できる。
    const participantId = codeGen.generateParticipantId();
    const resumeToken = codeGen.generateResumeToken();

    const newParticipant: Participant = {
      participantId,
      connId,
      displayName: cmd.displayName,
      role: "editor",
      presence: "online",
      hasAiKey: cmd.hasAiKey,
      joinedAt: now,
    };

    const updatedRoom: Room = {
      ...room,
      participants: [...room.participants, newParticipant],
    };

    store.put(updatedRoom);
    tokenStore.issueResume(resumeToken, { participantId, roomCode: cmd.code });

    broadcaster.sendTo(connId, {
      type: "room.joined",
      resumeToken,
      participantId,
    });

    broadcaster.sendTo(connId, {
      type: "snapshot",
      room: updatedRoom,
    });

    broadcaster.broadcastSnapshot(cmd.code, updatedRoom);

    return ok({ code: cmd.code, participantId, resumeToken });
  }

  /** time.ping — 状態を変えずにサーバー時刻を返す（FR-007, SC-001） */
  async function handleTimePing(
    connId: string,
    // 受信形を型として残すが、応答はサーバー時刻のみで clientTime は使わない
    // （往復遅延の推定はクライアント側が送信時刻と突き合わせて行う）。
    _cmd: { command: "time.ping"; clientTime: number },
  ): Promise<Result<undefined, ErrorCode>> {
    broadcaster.sendTo(connId, {
      type: "time.pong",
      serverTime: clock.now(),
    });
    return ok(undefined);
  }

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
    // rotation に居れば rotation からも外し（現ドライバーなら evolve が繰り上げ）、
    // 最後の1人は外せない（rotation を空にしない）。
    // 自己退出も可能（FR-079）。誰が実行できるかは既に rejectIfUnauthorized が判定済みで、
    // ここでは「結果の状態が妥当か」だけを検査する。
    if (cmd.command === "participant.remove") {
      const now = clock.now();
      const targetId = cmd.participantId;
      if (typeof targetId !== "string") {
        sendError(connId, "INVALID", "不正な対象は外せません");
        return err("INVALID");
      }
      const target = targetRoom.participants.find((p) => p.participantId === targetId);
      if (!target) {
        sendError(connId, "PARTICIPANT_NOT_FOUND", errorMessageFor("PARTICIPANT_NOT_FOUND"));
        return err("PARTICIPANT_NOT_FOUND");
      }
      // 不変条件: 実在（非代理）の編集者以上が1名以上残ること（FR-072/073）。
      // 権限ではなくドメインガードなので checkPermission とは別に検査する（plan.md D3）。
      if (!canRemoveParticipant(targetRoom.participants, targetId)) {
        sendError(connId, "LAST_MANAGER_LEAVE", errorMessageFor("LAST_MANAGER_LEAVE"));
        return err("LAST_MANAGER_LEAVE");
      }
      // 対象が現ホストなら、退出させる前にホストを引き継ぐ（plan.md D2b）。
      // 引き継がずに退出させると hostParticipantId が実在しない参加者を指し、
      // 開始前のルームはホスト限定操作が誰にも実行できなくなって恒久的に詰む。
      // 自動委譲は切断契機でしか発火しないため救済もない。
      const roomBeforeRemoval = target.participantId === targetRoom.hostParticipantId
        ? transferHostBeforeRemoval(targetRoom, targetId)
        : targetRoom;
      // rotation の枠を外すかを決める（D6b・FR-085）。
      // rotation は参加者IDの配列なので、退出者の枠は ID でそのまま一意に引ける。
      // 参加順から「枠の持ち主」を推測していた G6 の規則（sameNameOwner）は、
      // 同名の二重参加や再接続で実態とずれたため撤去した。
      const idx = roomBeforeRemoval.session.rotation.indexOf(targetId);
      let next: Room = {
        ...roomBeforeRemoval,
        participants: roomBeforeRemoval.participants.filter((p) => p.participantId !== targetId),
      };
      if (idx >= 0) {
        if (roomBeforeRemoval.session.rotation.length <= 1) {
          sendError(connId, "BelowMinMembers", errorMessageFor("BelowMinMembers"));
          return err("BelowMinMembers");
        }
        const agg = evolve(
          { session: roomBeforeRemoval.session, clock: roomBeforeRemoval.clock },
          { type: "MemberRemoved", index: idx, now },
          now,
        );
        next = { ...next, session: agg.session, clock: agg.clock };
        next = { ...next, config: { ...next.config, members: rotationDisplayNames(next) } };
      }
      store.put(next);
      broadcaster.broadcastSnapshot(next.code, next);
      reconcileSchedule(next);
      // 誰が誰を退出させたかを在室者へ伝える（FR-077）。
      // store.put の後に配信することが重要で、broadcastSignal は呼び出し時点のストアから
      // 宛先を決めるため、この順序により退出させられた本人には届かない（本人向けは下の error）。
      broadcaster.broadcastSignal(next.code, {
        type: "signal",
        signal: "notice",
        action: "participant-removed",
        actorName: participant.displayName,
        actorParticipantId: participant.participantId,
        targetName: target.displayName,
        targetParticipantId: target.participantId,
      });
      // 退出した本人へ専用通知を送る（残りメンバーの snapshot には含まれず取り残されるため）。
      // クライアントはこれを受けて退出メッセージ＋次の画面へ遷移する。
      // 代理(connId=null)はクライアントが無いので送らない。
      // 「通知しない」ではなく「誰の操作かで種類を分ける」（Issue #32）。自己退出（本人が
      // 自分自身を対象に退出した）と他者による退出を同じ種類で伝えると、自分で押した操作を
      // 「外されました」と伝えることになるため、removalNotificationFor() で種類を判定し、
      // どちらの場合も必ず本人へ送る。
      if (target.connId) {
        // ホストが自分自身を退出させる経路では先に transferHostBeforeRemoval が走るが、
        // transferHost は role と hostParticipantId だけを書き換え participantId は変えない
        // ため、実行者と対象の同一判定（removalNotificationFor）はずれない。
        const removalCode = removalNotificationFor(participant.participantId, targetId);
        sendError(target.connId, removalCode, messageForRemoval(removalCode, participant.displayName));
      }
      return ok(undefined);
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

    const now = clock.now();
    const agg = { session: targetRoom.session, clock: targetRoom.clock };
    const result = decide(domainCmd, agg, now);

    if (result.isErr()) {
      // 表（ERROR_MESSAGES）に該当コードがあればそれを使う。無ければ元のままの
      // 汎用文言にフォールバックする（表に無いコードの文言・挙動は変えない）。
      sendError(connId, result.error.type, ERROR_MESSAGES[result.error.type] ?? `操作エラー: ${result.error.type}`);
      return err(result.error.type);
    }

    // まず evolve で集約（session+clock）を更新する。
    // 手動スキップ(session.act SWITCH)は自動交代と同じく一時離脱/オフライン(非placeholder)を飛ばす。
    // decide はバリデーション(clock.running)に使い、行き先だけ eligible-aware な advanceDriver に差し替える。
    let newAgg = agg;
    const isManualSwitch =
      domainCmd.command === "session.act" && domainCmd.action === "SWITCH";
    if (isManualSwitch) {
      newAgg = advanceDriver(agg, computeIneligibleIndices(targetRoom), now);
    } else {
      for (const event of result.value) {
        newAgg = evolve(newAgg, event, now);
      }
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

  /** 役割変更（host 限定）FR-016, FR-017 */
  async function handleRoleSet(
    connId: string,
    cmd: { command: "role.set"; participantId: string; role: "editor" | "viewer" },
  ): Promise<Result<undefined, ErrorCode>> {
    const room = findRoomByConnId(connId);
    if (!room) {
      sendError(connId, "NOT_IN_ROOM", errorMessageFor("NOT_IN_ROOM"));
      return err("NOT_IN_ROOM");
    }

    const actor = room.participants.find((p) => p.connId === connId);
    if (!actor) {
      // 在室ルームは connId で引いているため通常は到達しない防御分岐。
      // 可否ではなくアクター解決の失敗なので、権限の文言は使わない。
      sendError(connId, "UNAUTHORIZED", errorMessageFor("UNAUTHORIZED"));
      return err("UNAUTHORIZED");
    }
    // 開始後は主催者であることを条件にしない（FR-063）。このハンドラは handleCommand の
    // switch で分岐するため handleRoomCommand の判定を通らない。個別に呼ぶ必要がある。
    if (rejectIfUnauthorized(connId, room, actor, cmd)) return err("UNAUTHORIZED");

    // ホスト自身の役割は変更できない（委譲は別経路）
    if (cmd.participantId === room.hostParticipantId) {
      sendError(connId, "CANNOT_CHANGE_HOST_ROLE", errorMessageFor("CANNOT_CHANGE_HOST_ROLE"));
      return err("CANNOT_CHANGE_HOST_ROLE");
    }

    const target = room.participants.find(
      (p) => p.participantId === cmd.participantId,
    );
    if (!target) {
      sendError(connId, "PARTICIPANT_NOT_FOUND", errorMessageFor("PARTICIPANT_NOT_FOUND"));
      return err("PARTICIPANT_NOT_FOUND");
    }

    // 不変条件: 実在（非代理）の編集者以上が1名以上残ること（FR-072/073）。
    // 権限（誰が実行できるか）とは独立したドメインガードなので、checkPermission が
    // 許可した後に別途検査する（plan.md D3）。昇格は人数を減らさないので対象外。
    if (cmd.role === "viewer" && !canDemote(room.participants, cmd.participantId)) {
      sendError(connId, "LAST_MANAGER_DEMOTE", errorMessageFor("LAST_MANAGER_DEMOTE"));
      return err("LAST_MANAGER_DEMOTE");
    }

    const updatedRoom: Room = {
      ...room,
      participants: room.participants.map((p) =>
        p.participantId === cmd.participantId ? { ...p, role: cmd.role } : p,
      ),
    };

    store.put(updatedRoom);
    broadcaster.broadcastSnapshot(updatedRoom.code, updatedRoom);

    return ok(undefined);
  }

  /** ルームパスフレーズを設定/解除する（host 限定・R4-2）。空文字で解除。
   *  平文は tokenStore（旧 roomPassphrases）に保持し、Room には passphraseProtected(boolean)のみ反映。 */
  async function handleRoomPassphraseSet(
    connId: string,
    cmd: { command: "room.passphrase.set"; passphrase: string },
  ): Promise<Result<undefined, ErrorCode>> {
    const room = findRoomByConnId(connId);
    if (!room) {
      sendError(connId, "NOT_IN_ROOM", errorMessageFor("NOT_IN_ROOM"));
      return err("NOT_IN_ROOM");
    }
    const actor = room.participants.find((p) => p.connId === connId);
    if (!actor) {
      // 在室ルームは connId で引いているため通常は到達しない防御分岐。
      // 可否ではなくアクター解決の失敗なので、権限の文言は使わない。
      sendError(connId, "UNAUTHORIZED", errorMessageFor("UNAUTHORIZED"));
      return err("UNAUTHORIZED");
    }
    // 開始後は主催者であることを条件にしない（FR-063）。このハンドラは handleCommand の
    // switch で分岐するため handleRoomCommand の判定を通らない。個別に呼ぶ必要がある。
    if (rejectIfUnauthorized(connId, room, actor, cmd)) return err("UNAUTHORIZED");

    // 前後空白を正規化して保持（設定側/参加側の trim 差異による「正しいのに不一致」を防ぐ）。
    // 空白のみ・空文字は解除扱い。
    const passphrase = cmd.passphrase.trim();
    if (passphrase === "") {
      tokenStore.deletePassphrase(room.code);
    } else {
      tokenStore.setPassphrase(room.code, passphrase);
    }
    const updatedRoom: Room = {
      ...room,
      passphraseProtected: passphrase !== "",
    };
    store.put(updatedRoom);
    broadcaster.broadcastSnapshot(updatedRoom.code, updatedRoom);

    return ok(undefined);
  }

  /** AI お題生成を合言葉で解錠する（host 限定）。
   *  合言葉はサーバ env（AI_UNLOCK_KEY）のみに存在し、Room には aiUnlocked(boolean) だけ反映。
   *  未設定（機能無効）でも不一致と同じ AI_UNLOCK_FAILED を返し、機能の存在を秘匿する。
   *  失敗は join と同じレート制限窓（joinRateLimiter・共有インスタンス）に積算する（総当たり対策）。 */
  async function handleAiUnlock(
    connId: string,
    cmd: { command: "ai.unlock"; key: string },
  ): Promise<Result<undefined, ErrorCode>> {
    const room = findRoomByConnId(connId);
    if (!room) {
      sendError(connId, "NOT_IN_ROOM", errorMessageFor("NOT_IN_ROOM"));
      return err("NOT_IN_ROOM");
    }
    const actor = room.participants.find((p) => p.connId === connId);
    if (!actor) {
      // 在室ルームは connId で引いているため通常は到達しない防御分岐。
      // 可否ではなくアクター解決の失敗なので、権限の文言は使わない。
      sendError(connId, "UNAUTHORIZED", errorMessageFor("UNAUTHORIZED"));
      return err("UNAUTHORIZED");
    }
    // 開始後は主催者であることを条件にしない（FR-063）。このハンドラは handleCommand の
    // switch で分岐するため handleRoomCommand の判定を通らない。個別に呼ぶ必要がある。
    if (rejectIfUnauthorized(connId, room, actor, cmd)) return err("UNAUTHORIZED");

    // 連続失敗のレート制限（join と同じ窓・閾値を共用）
    const now = clock.now();
    if (joinRateLimiter.recentFailures(connId, now).length >= JOIN_FAIL_MAX) {
      sendError(connId, "RATE_LIMITED", errorMessageFor("RATE_LIMITED"));
      return err("RATE_LIMITED");
    }

    const provided = cmd.key.trim();
    const matched =
      aiUnlockKey !== undefined &&
      provided !== "" &&
      constantTimeEqual(provided, aiUnlockKey);
    if (!matched) {
      joinRateLimiter.recordFailure(connId, now);
      sendError(connId, "AI_UNLOCK_FAILED", errorMessageFor("AI_UNLOCK_FAILED"));
      return err("AI_UNLOCK_FAILED");
    }

    const updatedRoom: Room = { ...room, aiUnlocked: true, problemMode: "ai" };
    store.put(updatedRoom);
    broadcaster.broadcastSnapshot(updatedRoom.code, updatedRoom);

    return ok(undefined);
  }

  /** ホストを明示的に他のオンライン参加者へ移譲する（host 限定・R2-3）。
   *  自動委譲（presence）と同じ transferHost を用い、snapshot で全員に反映する。 */
  async function handleHostTransfer(
    connId: string,
    cmd: { command: "host.transfer"; participantId: string },
  ): Promise<Result<undefined, ErrorCode>> {
    const room = findRoomByConnId(connId);
    if (!room) {
      sendError(connId, "NOT_IN_ROOM", errorMessageFor("NOT_IN_ROOM"));
      return err("NOT_IN_ROOM");
    }

    const actor = room.participants.find((p) => p.connId === connId);
    if (!actor) {
      // 在室ルームは connId で引いているため通常は到達しない防御分岐。
      // 可否ではなくアクター解決の失敗なので、権限の文言は使わない。
      sendError(connId, "UNAUTHORIZED", errorMessageFor("UNAUTHORIZED"));
      return err("UNAUTHORIZED");
    }
    // 開始後は主催者であることを条件にしない（FR-063）。このハンドラは handleCommand の
    // switch で分岐するため handleRoomCommand の判定を通らない。個別に呼ぶ必要がある。
    if (rejectIfUnauthorized(connId, room, actor, cmd)) return err("UNAUTHORIZED");

    // 対象がすでにホストなら移譲は無意味（実行者と対象は同一とは限らない。
    // Issue #22 以降 host.transfer は開始後 editor+ が実行できるため、
    // 「自分自身には」という表現はここでは使わない・FR-138）
    if (cmd.participantId === room.hostParticipantId) {
      sendError(connId, "ALREADY_HOST", errorMessageFor("ALREADY_HOST"));
      return err("ALREADY_HOST");
    }

    const target = room.participants.find(
      (p) => p.participantId === cmd.participantId,
    );
    if (!target) {
      sendError(connId, "PARTICIPANT_NOT_FOUND", errorMessageFor("PARTICIPANT_NOT_FOUND"));
      return err("PARTICIPANT_NOT_FOUND");
    }

    // オフラインの相手をホストにすると無人運用になり得るため拒否する
    if (target.presence === "offline") {
      sendError(connId, "HOST_TRANSFER_OFFLINE", errorMessageFor("HOST_TRANSFER_OFFLINE"));
      return err("HOST_TRANSFER_OFFLINE");
    }

    const updatedRoom = transferHost(room, cmd.participantId);
    store.put(updatedRoom);
    broadcaster.broadcastSnapshot(updatedRoom.code, updatedRoom);

    return ok(undefined);
  }

  /** お題生成依頼（editor+）FR-025, FR-027 */
  async function handleProblemRequest(
    connId: string,
    cmd: { command: "problem.request"; requestId: string },
  ): Promise<Result<undefined, ErrorCode>> {
    const guard = requireEditor(connId, "problem.request");
    if (guard.isErr()) return err(guard.error);
    const { room } = guard.value;

    if (!delegator) {
      sendError(connId, "DELEGATION_UNAVAILABLE", errorMessageFor("DELEGATION_UNAVAILABLE"));
      return err("DELEGATION_UNAVAILABLE");
    }

    // リロール時は旧依頼をキャンセルしてから再委譲する（FR-027）
    delegator.request(room.code, cmd.requestId);

    return ok(undefined);
  }

  /** お題投入（委譲代表のみ・editor+）FR-025, FR-026 */
  async function handleProblemSubmit(
    connId: string,
    cmd: {
      command: "problem.submit";
      requestId: string;
      problem: Problem;
      usedFallback: boolean;
    },
  ): Promise<Result<undefined, ErrorCode>> {
    const guard = requireEditor(connId, "problem.submit");
    if (guard.isErr()) return err(guard.error);
    const { room, actor } = guard.value;

    if (!delegator) {
      sendError(connId, "DELEGATION_UNAVAILABLE", errorMessageFor("DELEGATION_UNAVAILABLE"));
      return err("DELEGATION_UNAVAILABLE");
    }

    const accepted = delegator.submit(
      room.code,
      cmd.requestId,
      actor.participantId,
      cmd.problem,
      cmd.usedFallback,
    );
    if (!accepted) {
      sendError(connId, "STALE_SUBMISSION", "この投入は受理されませんでした（期限切れ・権限外）");
      return err("STALE_SUBMISSION");
    }

    return ok(undefined);
  }

  /**
   * connId から在室ルームと参加者を解決し、そのコマンドを実行できることを確認する。
   *
   * 在室確認（NOT_IN_ROOM）とアクター解決はここに残すが、可否の判定そのものは
   * `checkPermission()` に委ねる（FR-071）。この関数も handleCommand の switch で
   * 分岐するハンドラ（problem.request / problem.submit）から呼ばれるため、
   * handleRoomCommand の判定を通らない。viewer 判定をここに残すと規則が2箇所に分裂する。
   */
  function requireEditor(
    connId: string,
    command: string,
  ): Result<{ room: Room; actor: Participant }, ErrorCode> {
    const room = findRoomByConnId(connId);
    if (!room) {
      sendError(connId, "NOT_IN_ROOM", errorMessageFor("NOT_IN_ROOM"));
      return err("NOT_IN_ROOM");
    }
    const actor = room.participants.find((p) => p.connId === connId);
    if (!actor) return err("PARTICIPANT_NOT_FOUND");
    if (rejectIfUnauthorized(connId, room, actor, { command })) {
      return err("UNAUTHORIZED");
    }
    return ok({ room, actor });
  }

  /**
   * 権限を判定し、拒否ならエラーを送って true を返す（呼び出し側は即 return する）。
   *
   * 判定そのものは `@tdd-mob/core` の `checkPermission()` が単独で担う（FR-071）。
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

  /** 接続クローズ時の後始末。レート制限用の失敗履歴を解放しマップのリークを防ぐ。 */
  function handleConnectionClose(connId: string): void {
    joinRateLimiter.clear(connId);
  }

  /** ルーム回収時の後始末。当該ルームのホスト/リジュームトークンを解放する。 */
  function releaseRoom(roomCode: string): void {
    tokenStore.releaseRoom(roomCode);
  }

  // ドライバー不在の猶予後繰り上げ（R2-1）。presence の不在タイマーから呼ばれ、
  // 中身は通常の interval 交代(autoSwitch)と同一。
  return { handleCommand, handleConnectionClose, releaseRoom, advanceForAbsence: autoSwitch };
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
