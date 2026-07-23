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
  buildCompletionRecord,
  type Room,
  type Participant,
  type SessionConfig,
  type Problem,
  type ProblemMode,
  type DomainEvent,
  type IntervalMinutes,
} from "@tdd-mob/core";
import type { Clock } from "../ports/clock.js";
import type { Broadcaster } from "../ports/broadcaster.js";
import type { RoomStore } from "../ports/room-store.js";
import type { RoomCodeGen } from "../ports/code-gen.js";
import type { Scheduler } from "./schedule.js";
import type { ProblemDelegator } from "./problem-delegation.js";
import { constantTimeEqual } from "./secure-compare.js";

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

export interface CreateResult {
  code: string;
  participantId: string;
  hostToken: string;
  resumeToken: string;
}

export function makeHandlers(deps: HandlerDeps) {
  const { store, clock, broadcaster, codeGen, scheduler, delegator } = deps;
  const maxRooms = deps.maxRooms ?? 50;
  const aiUnlockKey = deps.aiUnlockKey;

  // トークンはハンドラインスタンスごとに保持（モジュール共有を避け、テスト間汚染を防ぐ）。
  /** ホストトークンのマップ（roomCode → hostToken） */
  const hostTokens = new Map<string, string>();
  /** ルームパスフレーズ（roomCode → 平文）。snapshot には載せない（R4-2）。 */
  const roomPassphrases = new Map<string, string>();
  /** リジュームトークンのマップ（resumeToken → {participantId, roomCode}） */
  const resumeTokens = new Map<
    string,
    { participantId: string; roomCode: string }
  >();

  // 単一接続あたりの room.join 連続失敗のレート制限（コード列挙の緩和）。
  // 正常利用には干渉しない緩い閾値。本来の防御はエッジ/IP 層（リバースプロキシ等）で行うべき。
  const JOIN_FAIL_WINDOW_MS = 10_000;
  const JOIN_FAIL_MAX = 30;
  /** connId → 直近の join 失敗時刻（epoch ms） */
  const joinFailures = new Map<string, number[]>();
  const recentJoinFailures = (connId: string, now: number): number[] => {
    const arr = (joinFailures.get(connId) ?? []).filter(
      (t) => now - t < JOIN_FAIL_WINDOW_MS,
    );
    if (arr.length === 0) joinFailures.delete(connId);
    else joinFailures.set(connId, arr);
    return arr;
  };

  // ─── サーバー権威タイマーの調停 ───────────────────────────────────────────

  /** ルームの clock 状態に応じて次回自動交代をスケジュール/解除する（FR-003） */
  function reconcileSchedule(room: Room): void {
    if (!scheduler) return;
    // 稼働中かつ完成フェーズに入っていない場合のみ次回交代を予約する。
    // `!room.onBreak` は後方互換のための dormant ガード（v2.10 で休憩機能の UI/コマンドは撤去済み。
    // break.start/end は受理されず onBreak が true になる経路は無いため常に通過する）。
    if (room.clock.running && !room.onBreak && room.phase !== "celebration") {
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
      nextDriverName: updated.session.rotation[updated.session.currentIndex] ?? "",
    });
    reconcileSchedule(updated);
  }

  /**
   * コマンドを処理するメインエントリポイント
   */
  async function handleCommand(
    connId: string,
    cmd: { command: string; [key: string]: unknown },
  ): Promise<Result<CreateResult, string>> {
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
  ): Promise<Result<CreateResult, string>> {
    const now = clock.now();
    // ルーム数上限（DoS 緩和）。上限到達時は作成を拒否する。
    if (store.list().length >= maxRooms) {
      broadcaster.sendTo(connId, {
        type: "error",
        code: "ROOM_LIMIT_EXCEEDED",
        message: "サーバーのルーム数が上限に達しています。時間をおいて再試行してください。",
      });
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

    const agg = initialAggregate(defaultConfig);

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
      config: defaultConfig,
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
    hostTokens.set(code, hostToken);
    resumeTokens.set(resumeToken, { participantId, roomCode: code });

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
  ): Promise<Result<CreateResult, string>> {
    const now = clock.now();

    // 連続失敗が閾値を超えた接続は一時的に拒否（コード総当たりの緩和）。
    if (recentJoinFailures(connId, now).length >= JOIN_FAIL_MAX) {
      broadcaster.sendTo(connId, {
        type: "error",
        code: "RATE_LIMITED",
        message: "参加の試行が多すぎます。しばらく待ってから再試行してください。",
      });
      return err("RATE_LIMITED");
    }

    const room = store.get(cmd.code);

    if (!room) {
      // 失敗を記録（次回以降のレート判定に使う）。
      joinFailures.set(connId, [...(joinFailures.get(connId) ?? []), now]);
      broadcaster.sendTo(connId, {
        type: "error",
        code: "ROOM_NOT_FOUND",
        message: "指定されたルームコードが見つかりません",
      });
      return err("ROOM_NOT_FOUND");
    }

    // リジューム処理
    if (cmd.resumeToken) {
      const tokenData = resumeTokens.get(cmd.resumeToken);
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
            hostToken: hostTokens.get(cmd.code) ?? "",
            resumeToken: cmd.resumeToken,
          });
        }
      }
    }

    // パスフレーズ保護ルームは新規参加時に一致を要求する（R4-2）。
    // resume（再接続）は上の resume ブロックで return 済みのためここには来ない＝再認証不要。
    const requiredPassphrase = roomPassphrases.get(cmd.code);
    // 保持側と同じく前後空白を正規化して比較する。
    const providedPassphrase = (cmd.passphrase ?? "").trim();
    if (requiredPassphrase !== undefined && providedPassphrase !== requiredPassphrase) {
      // 失敗をレート制限に積算（パスフレーズ総当たりの緩和・既存 join 制限と統合）。
      joinFailures.set(connId, [...(joinFailures.get(connId) ?? []), now]);
      const code = providedPassphrase ? "PASSPHRASE_MISMATCH" : "PASSPHRASE_REQUIRED";
      broadcaster.sendTo(connId, {
        type: "error",
        code,
        message:
          code === "PASSPHRASE_REQUIRED"
            ? "このルームはパスフレーズが必要です"
            : "パスフレーズが一致しません",
      });
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
    resumeTokens.set(resumeToken, { participantId, roomCode: cmd.code });

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

    return ok({ code: cmd.code, participantId, hostToken: "", resumeToken });
  }

  /** time.ping — 状態を変えずにサーバー時刻を返す（FR-007, SC-001） */
  async function handleTimePing(
    connId: string,
    cmd: { command: "time.ping"; clientTime: number },
  ): Promise<Result<CreateResult, string>> {
    broadcaster.sendTo(connId, {
      type: "time.pong",
      serverTime: clock.now(),
    });
    return ok({ code: "", participantId: "", hostToken: "", resumeToken: "" });
  }

  /** ルームコマンド（session.act, config.set 等） */
  async function handleRoomCommand(
    connId: string,
    cmd: { command: string; [key: string]: unknown },
  ): Promise<Result<CreateResult, string>> {
    // connId からルームを特定する
    let targetRoom = findRoomByConnId(connId);

    if (!targetRoom) {
      broadcaster.sendTo(connId, {
        type: "error",
        code: "NOT_IN_ROOM",
        message: "ルームに参加していません",
      });
      return err("NOT_IN_ROOM");
    }

    const participant = targetRoom.participants.find((p) => p.connId === connId);
    if (!participant) {
      return err("PARTICIPANT_NOT_FOUND");
    }

    // participant.rename / driver.skip / driver.resume は「本人 or host」権限
    // （FR-046/048・plan.md L209-210）。いずれも対象 participantId に依存する関係的
    // 権限で、集合方式の authorize（ロール集合）では「対象が本人か」を表現できない。
    // EDITOR_PLUS に置くと editor が他人を skip/resume でき（fail-open）、かつ viewer が
    // 自分すら skip できない（過剰拒否）ため、ここで個別に fail-closed 判定する。
    const RELATIONAL_SELF_OR_HOST = new Set([
      "participant.rename",
      "driver.skip",
      "driver.resume",
    ]);
    if (RELATIONAL_SELF_OR_HOST.has(cmd.command)) {
      const isSelf = cmd.participantId === participant.participantId;
      const isHost = participant.role === "host";
      if (!isSelf && !isHost) {
        broadcaster.sendTo(connId, {
          type: "error",
          code: "UNAUTHORIZED",
          message: "他の参加者への操作はホストのみ実行できます",
        });
        return err("UNAUTHORIZED");
      }
    }

    // member.add/remove の関係的権限（横方向の権限濫用防止）。
    // editor は「自分の rotation 出入り」のみ許可し、他人分の追加/除外は host に限定する。
    // （UI は自名/自 index のみ送るが、コマンド直送で他人を操作されないようサーバで強制。）
    if (
      participant.role !== "host" &&
      (cmd.command === "member.add" || cmd.command === "member.remove")
    ) {
      const ownName = participant.displayName;
      const ownsTarget =
        cmd.command === "member.add"
          ? cmd.name === ownName
          : targetRoom.session.rotation[Number(cmd.index)] === ownName;
      if (!ownsTarget) {
        broadcaster.sendTo(connId, {
          type: "error",
          code: "UNAUTHORIZED",
          message: "他の参加者のローテーション操作はホストのみ実行できます",
        });
        return err("UNAUTHORIZED");
      }
    }

    // 権限チェック（FR-017）
    const authError = authorize(participant.role, cmd.command as string, targetRoom.hostParticipantId, participant.participantId);
    if (authError) {
      broadcaster.sendTo(connId, {
        type: "error",
        code: "UNAUTHORIZED",
        message: authError,
      });
      return err("UNAUTHORIZED");
    }

    // 参加者の退出（host 限定・⑪）。参加者は Room レベルのため decide ではなくここで扱う。
    // rotation に居れば rotation からも外し（現ドライバーなら evolve が繰り上げ）、
    // 最後の1人は外せない（rotation を空にしない）。
    if (cmd.command === "participant.remove") {
      const now = clock.now();
      const targetId = cmd.participantId;
      if (typeof targetId !== "string" || targetId === participant.participantId) {
        broadcaster.sendTo(connId, { type: "error", code: "INVALID", message: "自分自身や不正な対象は外せません" });
        return err("INVALID");
      }
      const target = targetRoom.participants.find((p) => p.participantId === targetId);
      if (!target) {
        broadcaster.sendTo(connId, { type: "error", code: "PARTICIPANT_NOT_FOUND", message: "対象の参加者が見つかりません" });
        return err("PARTICIPANT_NOT_FOUND");
      }
      const idx = targetRoom.session.rotation.indexOf(target.displayName);
      let next: Room = {
        ...targetRoom,
        participants: targetRoom.participants.filter((p) => p.participantId !== targetId),
      };
      if (idx >= 0) {
        if (targetRoom.session.rotation.length <= 1) {
          broadcaster.sendTo(connId, { type: "error", code: "BelowMinMembers", message: "最後のドライバーは外せません" });
          return err("BelowMinMembers");
        }
        const agg = evolve(
          { session: targetRoom.session, clock: targetRoom.clock },
          { type: "MemberRemoved", index: idx, now },
          now,
        );
        next = { ...next, session: agg.session, clock: agg.clock, config: { ...next.config, members: [...agg.session.rotation] } };
      }
      store.put(next);
      broadcaster.broadcastSnapshot(next.code, next);
      reconcileSchedule(next);
      // 外された本人へ専用通知を送る（残りメンバーの snapshot には含まれず取り残されるため）。
      // クライアントはこれを受けて退出メッセージ＋参加画面へ遷移し、再参加可能にする。
      // 代理(connId=null)はクライアントが無いので送らない。
      if (target.connId) {
        broadcaster.sendTo(target.connId, {
          type: "error",
          code: "REMOVED_BY_HOST",
          message: "ホストにより退出させられました",
        });
      }
      return ok({ code: next.code, participantId: "", hostToken: "", resumeToken: "" });
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
    // 改名は対象の現在名を解決して decide へ渡す。decide は「自分の現在名と同一」を
    // 重複検査から除外するために旧名を必要とする（rotation は名前配列のみで participantId を持たない）。
    if (domainCmd && domainCmd.command === "participant.rename") {
      const target = targetRoom.participants.find(
        (p) => p.participantId === domainCmd.participantId,
      );
      // 対象が存在しなければ早期に拒否する。ここで弾かないと旧名 undefined のまま decide に渡り、
      // 自己同一の除外が効かず DuplicateName 等の誤った理由で失敗しうる（実体は対象不在）。
      if (!target) {
        broadcaster.sendTo(connId, {
          type: "error",
          code: "PARTICIPANT_NOT_FOUND",
          message: "対象の参加者が見つかりません",
        });
        return err("PARTICIPANT_NOT_FOUND");
      }
      domainCmd.currentDisplayName = target.displayName;
    }
    // 指名は participantId → 表示名 → rotation index を解決して decide へ渡す（Issue #13）。
    // 集約は participantId→名前の対応を持たないため、rotation 内の位置をここで確定する。
    if (domainCmd && domainCmd.command === "driver.assign") {
      const targetPid = typeof cmd.participantId === "string" ? cmd.participantId : "";
      const target = targetRoom.participants.find((p) => p.participantId === targetPid);
      const index = target
        ? targetRoom.session.rotation.indexOf(target.displayName)
        : -1;
      // 対象不在 or rotation 外（見学者）は指名できない。
      if (index < 0) {
        broadcaster.sendTo(connId, {
          type: "error",
          code: "PARTICIPANT_NOT_FOUND",
          message: "指名対象が見つからないか、ローテーション外です",
        });
        return err("PARTICIPANT_NOT_FOUND");
      }
      domainCmd.index = index;
    }
    // 代理参加者の participantId は client 供給（信頼境界外）。既存参加者との衝突で
    // participantId 突合（skip/rename 等）が誤動作するのを防ぐため、サーバーで一意に再生成する。
    if (domainCmd && domainCmd.command === "participant.addProxy") {
      domainCmd.participantId = codeGen.generateParticipantId();
    }
    if (!domainCmd) {
      broadcaster.sendTo(connId, {
        type: "error",
        code: "UNKNOWN_COMMAND",
        message: `不明なコマンド: ${cmd.command}`,
      });
      return err("UNKNOWN_COMMAND");
    }

    const now = clock.now();
    const agg = { session: targetRoom.session, clock: targetRoom.clock };
    const result = decide(domainCmd, agg, now);

    if (result.isErr()) {
      broadcaster.sendTo(connId, {
        type: "error",
        code: result.error.type,
        message: `操作エラー: ${result.error.type}`,
      });
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

    // evolve の結果を Room に反映してから、Room レベルイベントを適用する。
    // applyRoomLevelEvent は session.rotation 等をさらに更新しうる
    // （ProxyMemberAdded の rotation 追加・ParticipantRenamed の rotation 改名）ため、
    // evolve 結果を基底に置かないと session 変更が捨てられる。
    targetRoom = { ...targetRoom, session: newAgg.session, clock: newAgg.clock };
    for (const event of result.value) {
      // PhaseSet/ProblemSet/ConfigSet/SessionCompleted 等はルームレベルで処理
      targetRoom = applyRoomLevelEvent(targetRoom, event, now);
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
        targetRoom = { ...targetRoom, session: advanced.session, clock: advanced.clock };
      }
    }

    // 指名先が一時離脱中なら離脱フラグを解除して自動復帰させる（Issue #13）。
    // DriverSwitched は正確な index で評価済みのため advanceDriver 差し替えはしない。
    if (domainCmd.command === "driver.assign") {
      const targetPid = typeof cmd.participantId === "string" ? cmd.participantId : "";
      const target = targetRoom.participants.find((p) => p.participantId === targetPid);
      if (target?.driverEligible === false) {
        targetRoom = applyRoomLevelEvent(
          targetRoom,
          { type: "DriverResumed", participantId: targetPid, now },
          now,
        );
      }
    }

    const updatedRoom: Room = {
      ...targetRoom,
      // config.members を session.rotation に同期する。
      // member.add/remove/move・addProxy は rotation のみ更新するため、ミラーしないと
      // 完成記録（config.members を使用）が古いメンバーになる。
      config: { ...targetRoom.config, members: [...targetRoom.session.rotation] },
    };

    store.put(updatedRoom);
    broadcaster.broadcastSnapshot(updatedRoom.code, updatedRoom);
    // clock 状態が変わった可能性があるので自動交代を調停する（FR-003）
    reconcileSchedule(updatedRoom);

    return ok({ code: updatedRoom.code, participantId: participant.participantId, hostToken: "", resumeToken: "" });
  }

  /** 役割変更（host 限定）FR-016, FR-017 */
  async function handleRoleSet(
    connId: string,
    cmd: { command: "role.set"; participantId: string; role: "editor" | "viewer" },
  ): Promise<Result<CreateResult, string>> {
    const room = findRoomByConnId(connId);
    if (!room) {
      broadcaster.sendTo(connId, {
        type: "error",
        code: "NOT_IN_ROOM",
        message: "ルームに参加していません",
      });
      return err("NOT_IN_ROOM");
    }

    const actor = room.participants.find((p) => p.connId === connId);
    if (!actor || actor.role !== "host") {
      broadcaster.sendTo(connId, {
        type: "error",
        code: "UNAUTHORIZED",
        message: "role.set はホストのみ実行できます",
      });
      return err("UNAUTHORIZED");
    }

    // ホスト自身の役割は変更できない（委譲は別経路）
    if (cmd.participantId === room.hostParticipantId) {
      broadcaster.sendTo(connId, {
        type: "error",
        code: "CANNOT_CHANGE_HOST",
        message: "ホストの役割は変更できません",
      });
      return err("CANNOT_CHANGE_HOST");
    }

    const target = room.participants.find(
      (p) => p.participantId === cmd.participantId,
    );
    if (!target) {
      broadcaster.sendTo(connId, {
        type: "error",
        code: "PARTICIPANT_NOT_FOUND",
        message: "対象の参加者が見つかりません",
      });
      return err("PARTICIPANT_NOT_FOUND");
    }

    const updatedRoom: Room = {
      ...room,
      participants: room.participants.map((p) =>
        p.participantId === cmd.participantId ? { ...p, role: cmd.role } : p,
      ),
    };

    store.put(updatedRoom);
    broadcaster.broadcastSnapshot(updatedRoom.code, updatedRoom);

    return ok({
      code: updatedRoom.code,
      participantId: actor.participantId,
      hostToken: "",
      resumeToken: "",
    });
  }

  /** ルームパスフレーズを設定/解除する（host 限定・R4-2）。空文字で解除。
   *  平文は roomPassphrases に保持し、Room には passphraseProtected(boolean)のみ反映。 */
  async function handleRoomPassphraseSet(
    connId: string,
    cmd: { command: "room.passphrase.set"; passphrase: string },
  ): Promise<Result<CreateResult, string>> {
    const room = findRoomByConnId(connId);
    if (!room) {
      broadcaster.sendTo(connId, {
        type: "error",
        code: "NOT_IN_ROOM",
        message: "ルームに参加していません",
      });
      return err("NOT_IN_ROOM");
    }
    const actor = room.participants.find((p) => p.connId === connId);
    if (!actor || actor.role !== "host") {
      broadcaster.sendTo(connId, {
        type: "error",
        code: "UNAUTHORIZED",
        message: "パスフレーズ設定はホストのみ実行できます",
      });
      return err("UNAUTHORIZED");
    }

    // 前後空白を正規化して保持（設定側/参加側の trim 差異による「正しいのに不一致」を防ぐ）。
    // 空白のみ・空文字は解除扱い。
    const passphrase = cmd.passphrase.trim();
    if (passphrase === "") {
      roomPassphrases.delete(room.code);
    } else {
      roomPassphrases.set(room.code, passphrase);
    }
    const updatedRoom: Room = {
      ...room,
      passphraseProtected: passphrase !== "",
    };
    store.put(updatedRoom);
    broadcaster.broadcastSnapshot(updatedRoom.code, updatedRoom);

    return ok({
      code: updatedRoom.code,
      participantId: actor.participantId,
      hostToken: "",
      resumeToken: "",
    });
  }

  /** AI お題生成を合言葉で解錠する（host 限定）。
   *  合言葉はサーバ env（AI_UNLOCK_KEY）のみに存在し、Room には aiUnlocked(boolean) だけ反映。
   *  未設定（機能無効）でも不一致と同じ AI_UNLOCK_FAILED を返し、機能の存在を秘匿する。
   *  失敗は join と同じレート制限窓（joinFailures）に積算する（総当たり対策）。 */
  async function handleAiUnlock(
    connId: string,
    cmd: { command: "ai.unlock"; key: string },
  ): Promise<Result<CreateResult, string>> {
    const room = findRoomByConnId(connId);
    if (!room) {
      broadcaster.sendTo(connId, {
        type: "error",
        code: "NOT_IN_ROOM",
        message: "ルームに参加していません",
      });
      return err("NOT_IN_ROOM");
    }
    const actor = room.participants.find((p) => p.connId === connId);
    if (!actor || actor.role !== "host") {
      broadcaster.sendTo(connId, {
        type: "error",
        code: "UNAUTHORIZED",
        message: "AI 生成の解錠はホストのみ実行できます",
      });
      return err("UNAUTHORIZED");
    }

    // 連続失敗のレート制限（join と同じ窓・閾値を共用）
    const now = clock.now();
    if (recentJoinFailures(connId, now).length >= JOIN_FAIL_MAX) {
      broadcaster.sendTo(connId, {
        type: "error",
        code: "RATE_LIMITED",
        message: "試行が多すぎます。しばらく待ってから再試行してください",
      });
      return err("RATE_LIMITED");
    }

    const provided = cmd.key.trim();
    const matched =
      aiUnlockKey !== undefined &&
      provided !== "" &&
      constantTimeEqual(provided, aiUnlockKey);
    if (!matched) {
      joinFailures.set(connId, [...(joinFailures.get(connId) ?? []), now]);
      broadcaster.sendTo(connId, {
        type: "error",
        code: "AI_UNLOCK_FAILED",
        message: "合言葉が違います",
      });
      return err("AI_UNLOCK_FAILED");
    }

    const updatedRoom: Room = { ...room, aiUnlocked: true, problemMode: "ai" };
    store.put(updatedRoom);
    broadcaster.broadcastSnapshot(updatedRoom.code, updatedRoom);

    return ok({
      code: updatedRoom.code,
      participantId: actor.participantId,
      hostToken: "",
      resumeToken: "",
    });
  }

  /** ホストを明示的に他のオンライン参加者へ移譲する（host 限定・R2-3）。
   *  自動委譲（presence）と同じ transferHost を用い、snapshot で全員に反映する。 */
  async function handleHostTransfer(
    connId: string,
    cmd: { command: "host.transfer"; participantId: string },
  ): Promise<Result<CreateResult, string>> {
    const room = findRoomByConnId(connId);
    if (!room) {
      broadcaster.sendTo(connId, {
        type: "error",
        code: "NOT_IN_ROOM",
        message: "ルームに参加していません",
      });
      return err("NOT_IN_ROOM");
    }

    const actor = room.participants.find((p) => p.connId === connId);
    if (!actor || actor.role !== "host") {
      broadcaster.sendTo(connId, {
        type: "error",
        code: "UNAUTHORIZED",
        message: "host.transfer はホストのみ実行できます",
      });
      return err("UNAUTHORIZED");
    }

    // 自分自身へは移譲できない（現ホスト＝対象は無意味）
    if (cmd.participantId === room.hostParticipantId) {
      broadcaster.sendTo(connId, {
        type: "error",
        code: "CANNOT_CHANGE_HOST",
        message: "自分自身へは移譲できません",
      });
      return err("CANNOT_CHANGE_HOST");
    }

    const target = room.participants.find(
      (p) => p.participantId === cmd.participantId,
    );
    if (!target) {
      broadcaster.sendTo(connId, {
        type: "error",
        code: "PARTICIPANT_NOT_FOUND",
        message: "対象の参加者が見つかりません",
      });
      return err("PARTICIPANT_NOT_FOUND");
    }

    // オフラインの相手をホストにすると無人運用になり得るため拒否する
    if (target.presence === "offline") {
      broadcaster.sendTo(connId, {
        type: "error",
        code: "PARTICIPANT_OFFLINE",
        message: "オフラインの参加者へは移譲できません",
      });
      return err("PARTICIPANT_OFFLINE");
    }

    const updatedRoom = transferHost(room, cmd.participantId);
    store.put(updatedRoom);
    broadcaster.broadcastSnapshot(updatedRoom.code, updatedRoom);

    return ok({
      code: updatedRoom.code,
      participantId: actor.participantId,
      hostToken: "",
      resumeToken: "",
    });
  }

  /** お題生成依頼（editor+）FR-025, FR-027 */
  async function handleProblemRequest(
    connId: string,
    cmd: { command: "problem.request"; requestId: string },
  ): Promise<Result<CreateResult, string>> {
    const guard = requireEditor(connId, "problem.request");
    if (guard.isErr()) return err(guard.error);
    const { room, actor } = guard.value;

    if (!delegator) {
      broadcaster.sendTo(connId, {
        type: "error",
        code: "DELEGATION_UNAVAILABLE",
        message: "お題生成が利用できません",
      });
      return err("DELEGATION_UNAVAILABLE");
    }

    // リロール時は旧依頼をキャンセルしてから再委譲する（FR-027）
    delegator.request(room.code, cmd.requestId);

    return ok({
      code: room.code,
      participantId: actor.participantId,
      hostToken: "",
      resumeToken: "",
    });
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
  ): Promise<Result<CreateResult, string>> {
    const guard = requireEditor(connId, "problem.submit");
    if (guard.isErr()) return err(guard.error);
    const { room, actor } = guard.value;

    if (!delegator) {
      broadcaster.sendTo(connId, {
        type: "error",
        code: "DELEGATION_UNAVAILABLE",
        message: "お題生成が利用できません",
      });
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
      broadcaster.sendTo(connId, {
        type: "error",
        code: "STALE_SUBMISSION",
        message: "この投入は受理されませんでした（期限切れ・権限外）",
      });
      return err("STALE_SUBMISSION");
    }

    return ok({
      code: room.code,
      participantId: actor.participantId,
      hostToken: "",
      resumeToken: "",
    });
  }

  /** connId から在室ルームと参加者を解決し、editor 以上であることを確認する */
  function requireEditor(
    connId: string,
    command: string,
  ): Result<{ room: Room; actor: Participant }, string> {
    const room = findRoomByConnId(connId);
    if (!room) {
      broadcaster.sendTo(connId, {
        type: "error",
        code: "NOT_IN_ROOM",
        message: "ルームに参加していません",
      });
      return err("NOT_IN_ROOM");
    }
    const actor = room.participants.find((p) => p.connId === connId);
    if (!actor) return err("PARTICIPANT_NOT_FOUND");
    if (actor.role === "viewer") {
      broadcaster.sendTo(connId, {
        type: "error",
        code: "UNAUTHORIZED",
        message: `${command} は編集者以上が必要です`,
      });
      return err("UNAUTHORIZED");
    }
    return ok({ room, actor });
  }

  /** connId からルームを特定する（参加者として在室しているルーム） */
  function findRoomByConnId(connId: string): Room | undefined {
    return store
      .list()
      .find((r) => r.participants.some((p) => p.connId === connId));
  }

  /** 接続クローズ時の後始末。レート制限用の失敗履歴を解放しマップのリークを防ぐ。 */
  function handleConnectionClose(connId: string): void {
    joinFailures.delete(connId);
  }

  /** ルーム回収時の後始末。当該ルームのホスト/リジュームトークンを解放する。 */
  function releaseRoom(roomCode: string): void {
    hostTokens.delete(roomCode);
    roomPassphrases.delete(roomCode);
    for (const [token, info] of resumeTokens) {
      if (info.roomCode === roomCode) resumeTokens.delete(token);
    }
  }

  // ドライバー不在の猶予後繰り上げ（R2-1）。presence の不在タイマーから呼ばれ、
  // 中身は通常の interval 交代(autoSwitch)と同一。
  return { handleCommand, handleConnectionClose, releaseRoom, advanceForAbsence: autoSwitch };
}

// ─── 権限チェック ─────────────────────────────────────────────────────────────

/** ホスト限定操作 */
const HOST_ONLY_COMMANDS = new Set([
  "session.complete",
  "session.abort",
  "session.reset",
  "phase.set",
  "role.set",
  "room.passphrase.set",
  "ai.unlock",
  "host.transfer",
  "participant.addProxy",
  "participant.remove",
  // 並べ替えはホスト専用（UI も host のみ提供）。editor による他人の順序操作を防ぐ。
  "member.move",
  // ランダム化もホスト専用（順列はサーバー権威で生成）。
  "member.shuffle",
  // 任意メンバーへのドライバー強制指名は host 専用（Issue #13）。
  "driver.assign",
]);

/** 編集者以上が必要な操作 */
const EDITOR_PLUS_COMMANDS = new Set([
  "config.set",
  // member.add/remove は EDITOR_PLUS だが、handleRoomCommand の関係ガードで
  // 「自分の rotation 出入りのみ本人可・他人分は host」に絞る（横方向の権限濫用防止）。
  "member.add",
  "member.remove",
  "session.act",
  "problem.request",
  "problem.submit",
  "problem.edit",
  "problem.mode.set",
  "handoff.note.set",
  // driver.skip / driver.resume は「本人 or host」の関係的権限のため EDITOR_PLUS に
  // は含めない（handleRoomCommand の RELATIONAL_SELF_OR_HOST ガードで判定する）。
]);

function authorize(
  role: "host" | "editor" | "viewer",
  command: string,
  hostParticipantId: string,
  participantId: string,
): string | null {
  if (HOST_ONLY_COMMANDS.has(command)) {
    if (role !== "host") {
      return `${command} はホストのみ実行できます`;
    }
    return null;
  }

  if (EDITOR_PLUS_COMMANDS.has(command)) {
    if (role === "viewer") {
      return `${command} は編集者以上が必要です`;
    }
    return null;
  }

  return null;
}

// ─── コマンド変換 ────────────────────────────────────────────────────────────

const VALID_ACTIONS = new Set(["START", "SWITCH", "PAUSE", "RESUME"]);
const VALID_PHASES = new Set(["setup", "ready", "session", "celebration"]);

function buildDomainCommand(cmd: { command: string; [key: string]: unknown }) {
  switch (cmd.command) {
    case "session.act": {
      const action = cmd.action;
      if (typeof action !== "string" || !VALID_ACTIONS.has(action)) return null;
      return { command: "session.act" as const, action: action as "START" | "SWITCH" | "PAUSE" | "RESUME" };
    }
    case "session.complete":
      return { command: "session.complete" as const };
    case "session.reset":
      return { command: "session.reset" as const };
    case "config.set":
      if (typeof cmd.config !== "object" || cmd.config === null) return null;
      return { command: "config.set" as const, config: cmd.config as Partial<SessionConfig> };
    case "member.add":
      if (typeof cmd.name !== "string") return null;
      return { command: "member.add" as const, name: cmd.name };
    case "member.remove":
      if (typeof cmd.index !== "number") return null;
      return { command: "member.remove" as const, index: cmd.index };
    case "member.move":
      if (typeof cmd.fromIndex !== "number" || typeof cmd.toIndex !== "number") return null;
      return { command: "member.move" as const, fromIndex: cmd.fromIndex, toIndex: cmd.toIndex };
    case "phase.set": {
      const phase = cmd.phase;
      if (typeof phase !== "string" || !VALID_PHASES.has(phase)) return null;
      return { command: "phase.set" as const, phase: phase as "setup" | "ready" | "session" | "celebration" };
    }
    case "handoff.note.set":
      if (typeof cmd.text !== "string") return null;
      return { command: "handoff.note.set" as const, text: cmd.text };
    // ─── v2 新コマンド ─────────────────────────────────────────────────────
    case "session.abort":
      return { command: "session.abort" as const };
    case "participant.addProxy":
      if (typeof cmd.displayName !== "string" || typeof cmd.participantId !== "string") return null;
      return { command: "participant.addProxy" as const, displayName: cmd.displayName, participantId: cmd.participantId };
    case "participant.rename":
      if (typeof cmd.participantId !== "string" || typeof cmd.displayName !== "string") return null;
      // currentDisplayName は呼び出し側（handleRoomCommand）が対象の現在名を解決して埋める
      return { command: "participant.rename" as const, participantId: cmd.participantId, displayName: cmd.displayName, currentDisplayName: undefined as string | undefined };
    case "driver.skip":
      if (typeof cmd.participantId !== "string") return null;
      return { command: "driver.skip" as const, participantId: cmd.participantId };
    case "driver.resume":
      if (typeof cmd.participantId !== "string") return null;
      return { command: "driver.resume" as const, participantId: cmd.participantId };
    case "driver.assign":
      if (typeof cmd.participantId !== "string") return null;
      // index は handleRoomCommand が participantId から解決して埋める（-1 はプレースホルダ）。
      return { command: "driver.assign" as const, index: -1 };
    case "problem.edit":
      if (typeof cmd.patch !== "object" || cmd.patch === null) return null;
      return { command: "problem.edit" as const, patch: cmd.patch as { title?: string; description?: string; requirements?: string[]; exampleTest?: string; hints?: string[] } };
    case "problem.mode.set":
      if (cmd.mode !== "ai" && cmd.mode !== "fallback") return null;
      return { command: "problem.mode.set" as const, mode: cmd.mode as ProblemMode };
    default:
      return null;
  }
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
 * rotation は表示名配列で participantId を持たないため、表示名で突き合わせる
 * （改名時の一意性ガードにより rotation 内に同名は無く、一意に対応付く）。
 */
function computeIneligibleIndices(room: Room): Set<number> {
  const ineligibleNames = new Set(
    room.participants
      // 一時離脱(driverEligible=false)は対象外。実在の切断中(offline)の人も対象外（R2-1）。
      // ただし代理(placeholder)は Web 非接続が常態で対面在席する実在の人を表すため、
      // offline でも eligible として扱う（さもないとタイマー自動交代で永久に飛ばされ交代しない）。
      .filter((p) => p.driverEligible === false || (p.presence === "offline" && p.isPlaceholder !== true))
      .map((p) => p.displayName),
  );
  const set = new Set<number>();
  room.session.rotation.forEach((name, i) => {
    if (ineligibleNames.has(name)) set.add(i);
  });
  return set;
}

// ─── ルームレベルのイベント適用 ──────────────────────────────────────────────

function applyRoomLevelEvent(
  room: Room,
  event: DomainEvent,
  _now: number,
): Room {
  switch (event.type) {
    case "PhaseSet":
      return { ...room, phase: event.phase };
    case "SessionReset":
      // リセット＝最初から再スタート（v2.3 #3）。集約(session/clock)は evolve が
      // 先頭・満タン・走行に初期化済み。お題・メンバー・設定・引き継ぎは維持し、
      // phase は session のまま（その場で走り直す）。休憩フラグのみ解除する。
      return {
        ...room,
        onBreak: false,
      };
    case "ProblemSet":
      return { ...room, problem: event.problem };
    case "ConfigSet":
      // 検証済み部分設定を Room.config にマージ（言語/難易度/メンバー/間隔を反映）
      return { ...room, config: { ...room.config, ...event.config } };
    case "HandoffNoteSet":
      return { ...room, handoffNote: event.text };
    case "BreakStarted":
      return { ...room, onBreak: true };
    case "BreakEnded":
      return { ...room, onBreak: false };
    case "SessionCompleted": {
      // 既に完成済みなら二重計上しない（complete の冪等性）
      if (room.phase === "celebration") return room;
      // 完成フェーズへ遷移し、揮発な完成記録を Room に追加（FR-028）
      const next: Room = { ...room, phase: "celebration" };
      if (room.problem) {
        const agg = { session: room.session, clock: room.clock };
        const record = buildCompletionRecord(
          agg,
          room.problem,
          room.config,
          event.now,
          room.code,
        );
        next.sessionRecords = [...room.sessionRecords, record];
      }
      return next;
    }
    // ─── v2 イベント ──────────────────────────────────────────────────────
    case "SessionAborted":
      // 中断: 記録を生成せず締めくくりフェーズへ（FR-020）
      return { ...room, phase: "celebration" };
    case "ProxyMemberAdded": {
      // 代理参加者をルームに追加し、rotation・driverCounts にも追加して
      // ドライバーローテーションに含める（FR-047）。
      const proxyParticipant: Participant = {
        participantId: event.participantId,
        connId: null,
        displayName: event.displayName,
        role: "editor",
        presence: "offline",
        hasAiKey: false,
        joinedAt: _now,
        isPlaceholder: true,
        driverEligible: true,
      };
      return {
        ...room,
        participants: [...room.participants, proxyParticipant],
        session: {
          ...room.session,
          rotation: [...room.session.rotation, event.displayName],
          driverCounts: [...room.session.driverCounts, 0],
        },
      };
    }
    case "ParticipantRenamed": {
      // 改名対象の旧名をループ外で一度だけ解決する。rotation は名前配列であり
      // participantId を持たないため、旧名で位置を特定して置換する。
      // 重複名は member.add/addProxy で拒否されるため rotation 内に同名はなく、一意に特定できる。
      const target = room.participants.find((p) => p.participantId === event.participantId);
      const oldName = target?.displayName;
      return {
        ...room,
        participants: room.participants.map((p) =>
          p.participantId === event.participantId
            ? { ...p, displayName: event.displayName }
            : p,
        ),
        session:
          oldName === undefined
            ? room.session
            : {
                ...room.session,
                rotation: room.session.rotation.map((name) =>
                  name === oldName ? event.displayName : name,
                ),
              },
      };
    }
    case "DriverSkipped":
      return {
        ...room,
        participants: room.participants.map((p) =>
          p.participantId === event.participantId
            ? { ...p, driverEligible: false }
            : p,
        ),
      };
    case "DriverResumed":
      return {
        ...room,
        participants: room.participants.map((p) =>
          p.participantId === event.participantId
            ? { ...p, driverEligible: true }
            : p,
        ),
      };
    case "ProblemEdited": {
      if (!room.problem) return room;
      return {
        ...room,
        problem: { ...room.problem, ...event.patch, edited: true },
      };
    }
    case "ProblemModeSet":
      return { ...room, problemMode: event.mode };
    default:
      return room;
  }
}
