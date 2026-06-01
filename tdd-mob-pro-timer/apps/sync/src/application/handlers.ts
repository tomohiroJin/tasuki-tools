/**
 * アプリケーションハンドラ
 * T034, T036, T040c, T045, T047, T049, T053, T055
 * フロー: validate → authorize → decide → evolve → store → broadcast
 */

import { ok, err, type Result } from "neverthrow";
import {
  decide,
  evolve,
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

export interface HandlerDeps {
  store: RoomStore;
  clock: Clock;
  broadcaster: Broadcaster;
  codeGen: RoomCodeGen;
  /** サーバー権威タイマー（省略時は自動交代をスケジュールしない＝テスト用） */
  scheduler?: Scheduler;
  /** お題代表生成（省略時は problem.request/submit を受け付けない） */
  delegator?: ProblemDelegator;
}

export interface CreateResult {
  code: string;
  participantId: string;
  hostToken: string;
  resumeToken: string;
}

export function makeHandlers(deps: HandlerDeps) {
  const { store, clock, broadcaster, codeGen, scheduler, delegator } = deps;

  // トークンはハンドラインスタンスごとに保持（モジュール共有を避け、テスト間汚染を防ぐ）。
  /** ホストトークンのマップ（roomCode → hostToken） */
  const hostTokens = new Map<string, string>();
  /** リジュームトークンのマップ（resumeToken → {participantId, roomCode}） */
  const resumeTokens = new Map<
    string,
    { participantId: string; roomCode: string }
  >();

  // ─── サーバー権威タイマーの調停 ───────────────────────────────────────────

  /** ルームの clock 状態に応じて次回自動交代をスケジュール/解除する（FR-003） */
  function reconcileSchedule(room: Room): void {
    if (!scheduler) return;
    // 稼働中かつ休憩でなく、完成フェーズに入っていない場合のみ次回交代を予約する
    if (room.clock.running && !room.onBreak && room.phase !== "celebration") {
      const left = secondsLeft(room.clock, clock.now());
      scheduler.schedule(room.code, left, autoSwitch);
    } else {
      scheduler.clear(room.code);
    }
  }

  /** タイマー発火時にサーバー側で SWITCH を実行し再スケジュールする */
  function autoSwitch(roomCode: string): void {
    const room = store.get(roomCode);
    if (!room || !room.clock.running) return;
    const now = clock.now();
    const agg = { session: room.session, clock: room.clock };
    const result = decide({ command: "session.act", action: "SWITCH" }, agg, now);
    if (result.isErr()) return;
    let newAgg = agg;
    for (const event of result.value) newAgg = evolve(newAgg, event, now);
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
          cmd as { command: "room.create"; displayName: string; config?: SessionConfig },
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
    cmd: { command: "room.create"; displayName: string; config?: SessionConfig },
  ): Promise<Result<CreateResult, string>> {
    const now = clock.now();
    const code = codeGen.generate();
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
    },
  ): Promise<Result<CreateResult, string>> {
    const now = clock.now();
    const room = store.get(cmd.code);

    if (!room) {
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

    // 新規参加者は viewer として登録（FR-016）
    const participantId = codeGen.generateParticipantId();
    const resumeToken = codeGen.generateResumeToken();

    const newParticipant: Participant = {
      participantId,
      connId,
      displayName: cmd.displayName,
      role: "viewer",
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

    // ドメインコマンドを構築して decide/evolve を実行
    const domainCmd = buildDomainCommand(cmd);
    // 改名は対象の現在名を解決して decide へ渡す。decide は「自分の現在名と同一」を
    // 重複検査から除外するために旧名を必要とする（rotation は名前配列のみで participantId を持たない）。
    if (domainCmd && domainCmd.command === "participant.rename") {
      const target = targetRoom.participants.find(
        (p) => p.participantId === domainCmd.participantId,
      );
      domainCmd.currentDisplayName = target?.displayName;
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
    let newAgg = agg;
    for (const event of result.value) {
      newAgg = evolve(newAgg, event, now);
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

  return { handleCommand };
}

// ─── 権限チェック ─────────────────────────────────────────────────────────────

/** ホスト限定操作 */
const HOST_ONLY_COMMANDS = new Set([
  "session.complete",
  "session.abort",
  "session.reset",
  "phase.set",
  "break.start",
  "break.end",
  "role.set",
  "participant.addProxy",
]);

/** 編集者以上が必要な操作 */
const EDITOR_PLUS_COMMANDS = new Set([
  "config.set",
  "member.add",
  "member.remove",
  "member.move",
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
    case "break.start":
      return { command: "break.start" as const };
    case "break.end":
      return { command: "break.end" as const };
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
      // 初期(設定)状態へ戻す（FR-001, US4-AC4）。集約は evolve が初期化済み。
      // お題・引き継ぎ・休憩フラグをクリアし phase を setup へ。記録履歴は保持。
      return {
        ...room,
        phase: "setup",
        problem: null,
        handoffNote: "",
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
