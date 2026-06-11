/**
 * decide 関数 — コマンドから DomainEvent[] を生成する純粋関数
 * T011: FR-002, FR-003, FR-004, FR-005, FR-009, FR-010
 */

import { ok, err, type Result } from "neverthrow";
import type { Aggregate, SessionConfig, IntervalMinutes, ProblemMode } from "./aggregate.js";
import {
  VALID_INTERVAL_MINUTES,
  MIN_MEMBERS,
  MAX_MEMBERS,
  MAX_PROBLEM_REQUIREMENTS,
} from "./aggregate.js";
import type { DomainEvent } from "./events.js";
import type { DomainError } from "./errors.js";

/** decide が受け付けるコマンド（スキーマ依存を避けた内部型） */
export type DecideCommand =
  | { command: "session.act"; action: "START" | "SWITCH" | "PAUSE" | "RESUME" }
  | { command: "session.complete" }
  | { command: "session.abort" }
  | { command: "session.reset"; config?: SessionConfig }
  | { command: "member.add"; name: string }
  | { command: "member.remove"; index: number }
  | { command: "member.move"; fromIndex: number; toIndex: number }
  // order はサーバー（handler）が生成して渡す（wire コマンドは order を持たない）。
  | { command: "member.shuffle"; order: number[] }
  | { command: "config.set"; config: Partial<SessionConfig> }
  | { command: "phase.set"; phase: "setup" | "ready" | "session" | "celebration" }
  | { command: "handoff.note.set"; text: string }
  | { command: "break.start" }
  | { command: "break.end" }
  | { command: "participant.addProxy"; displayName: string; participantId: string }
  | { command: "participant.rename"; participantId: string; displayName: string; currentDisplayName?: string }
  | { command: "driver.skip"; participantId: string }
  | { command: "driver.resume"; participantId: string }
  | { command: "problem.edit"; patch: { title?: string; description?: string; requirements?: string[]; exampleTest?: string; hints?: string[] } }
  | { command: "problem.mode.set"; mode: ProblemMode };

/**
 * コマンドを受け取り、DomainEvent[] または DomainError を返す純粋関数
 */
export function decide(
  cmd: DecideCommand,
  agg: Aggregate,
  now: number,
): Result<DomainEvent[], DomainError> {
  switch (cmd.command) {
    case "session.act":
      return decideSessionAct(cmd.action, agg, now);

    case "session.complete":
      return ok([{ type: "SessionCompleted", now }]);

    case "session.abort":
      return ok([{ type: "SessionAborted", now }]);

    case "session.reset":
      return ok([{ type: "SessionReset", now }]);

    case "member.add":
      return decideMemberAdd(cmd.name, agg, now);

    case "member.remove":
      return decideMemberRemove(cmd.index, agg, now);

    case "member.move":
      return decideMemberMove(cmd.fromIndex, cmd.toIndex, agg, now);

    case "member.shuffle":
      return decideMembersShuffle(cmd.order, agg, now);

    case "config.set":
      return decideConfigSet(cmd.config, agg, now);

    case "phase.set":
      return ok([{ type: "PhaseSet", phase: cmd.phase, now }]);

    case "handoff.note.set":
      return ok([{ type: "HandoffNoteSet", text: cmd.text, now }]);

    case "break.start":
      return ok([{ type: "BreakStarted", now }]);

    case "break.end":
      return ok([{ type: "BreakEnded", now }]);

    case "participant.addProxy":
      return decideAddProxy(cmd.displayName, cmd.participantId, agg, now);

    case "participant.rename":
      return decideRename(cmd.participantId, cmd.displayName, cmd.currentDisplayName, agg, now);

    case "driver.skip":
      return ok([{ type: "DriverSkipped", participantId: cmd.participantId, now }]);

    case "driver.resume":
      return ok([{ type: "DriverResumed", participantId: cmd.participantId, now }]);

    case "problem.edit":
      return decideProblemEdit(cmd.patch, now);

    case "problem.mode.set":
      return ok([{ type: "ProblemModeSet", mode: cmd.mode, now }]);
  }
}

// ─── v2 新コマンド ────────────────────────────────────────────────────────────

function decideAddProxy(
  displayName: string,
  participantId: string,
  agg: Aggregate,
  now: number,
): Result<DomainEvent[], DomainError> {
  const trimmed = displayName.trim();
  if (trimmed.length === 0) {
    return err({ type: "EmptyName" });
  }
  // 既存の表示名と重複しないか確認
  const existingNames = agg.session.rotation.map((n) => n.toLowerCase());
  if (existingNames.includes(trimmed.toLowerCase())) {
    return err({ type: "DuplicateName", name: trimmed });
  }
  if (agg.session.rotation.length >= MAX_MEMBERS) {
    return err({ type: "MemberLimitExceeded", limit: MAX_MEMBERS });
  }
  return ok([{ type: "ProxyMemberAdded", participantId, displayName: trimmed, now }]);
}

function decideRename(
  participantId: string,
  displayName: string,
  currentDisplayName: string | undefined,
  agg: Aggregate,
  now: number,
): Result<DomainEvent[], DomainError> {
  const trimmed = displayName.trim();
  if (trimmed.length === 0) {
    return err({ type: "EmptyName" });
  }
  // rotation 一意性の保護: 既存の表示名へ改名すると applyRoomLevelEvent の rotation 置換が
  // 同名を生み一意性が壊れる（FR-046/048）。大文字小文字を無視して重複を検査する。
  // ただし「自分の現在名」と同一への改名は no-op 相当なので許可する（rotation は名前配列のみで
  // participantId→名前の対応を持たないため、対象の旧名を currentDisplayName で受け取り除外する）。
  const lower = trimmed.toLowerCase();
  const ownNameLower = currentDisplayName?.trim().toLowerCase();
  const conflicts = agg.session.rotation.some(
    (name) => name.toLowerCase() === lower && name.toLowerCase() !== ownNameLower,
  );
  if (conflicts) {
    return err({ type: "DuplicateName", name: trimmed });
  }
  return ok([{ type: "ParticipantRenamed", participantId, displayName: trimmed, now }]);
}

function decideProblemEdit(
  patch: { title?: string; description?: string; requirements?: string[]; exampleTest?: string; hints?: string[] },
  now: number,
): Result<DomainEvent[], DomainError> {
  // requirements のサイズ上限チェック。メンバー数上限（MemberLimitExceeded）の流用ではなく、
  // 入力サイズ専用の InputLimitExceeded を返す（クライアント/ログでの誤解を避ける）。
  if (patch.requirements !== undefined && patch.requirements.length > MAX_PROBLEM_REQUIREMENTS) {
    return err({ type: "InputLimitExceeded", field: "requirements", limit: MAX_PROBLEM_REQUIREMENTS });
  }
  return ok([{ type: "ProblemEdited", patch, now }]);
}

// ─── セッション操作 ──────────────────────────────────────────────────────────

function decideSessionAct(
  action: "START" | "SWITCH" | "PAUSE" | "RESUME",
  agg: Aggregate,
  now: number,
): Result<DomainEvent[], DomainError> {
  const { clock, session } = agg;

  switch (action) {
    case "START":
      if (clock.running) {
        return err({
          type: "PhaseConflict",
          currentPhase: "session",
          requiredPhase: "stopped",
        });
      }
      return ok([{ type: "SessionStarted", now }]);

    case "SWITCH":
      if (!clock.running) {
        return err({
          type: "PhaseConflict",
          currentPhase: "stopped",
          requiredPhase: "session",
        });
      }
      {
        const nextIndex = (session.currentIndex + 1) % session.rotation.length;
        return ok([{ type: "DriverSwitched", nextIndex, now }]);
      }

    case "PAUSE":
      if (!clock.running || session.isPaused) {
        return err({
          type: "PhaseConflict",
          currentPhase: "paused",
          requiredPhase: "running",
        });
      }
      return ok([{ type: "SessionPaused", now }]);

    case "RESUME":
      if (clock.running && !session.isPaused) {
        return err({
          type: "PhaseConflict",
          currentPhase: "running",
          requiredPhase: "paused",
        });
      }
      return ok([{ type: "SessionResumed", now }]);
  }
}

// ─── メンバー管理 ────────────────────────────────────────────────────────────

function decideMemberAdd(
  name: string,
  agg: Aggregate,
  now: number,
): Result<DomainEvent[], DomainError> {
  const trimmed = name.trim();

  if (trimmed.length === 0) {
    return err({ type: "EmptyName" });
  }

  if (agg.session.rotation.includes(trimmed)) {
    return err({ type: "DuplicateName", name: trimmed });
  }

  if (agg.session.rotation.length >= MAX_MEMBERS) {
    return err({ type: "MemberLimitExceeded", limit: MAX_MEMBERS });
  }

  return ok([{ type: "MemberAdded", name: trimmed, now }]);
}

function decideMemberRemove(
  index: number,
  agg: Aggregate,
  now: number,
): Result<DomainEvent[], DomainError> {
  if (index < 0 || index >= agg.session.rotation.length) {
    return err({
      type: "InvalidIndex",
      index,
      max: agg.session.rotation.length - 1,
    });
  }

  // 2層モデル: ドライバーは各自が出入りする。最後の1人だけは外れられない
  // （rotation が 0 になると交代先が無く evolve が破綻するため）。
  if (agg.session.rotation.length <= 1) {
    return err({ type: "BelowMinMembers", min: 1 });
  }

  return ok([{ type: "MemberRemoved", index, now }]);
}

function decideMemberMove(
  fromIndex: number,
  toIndex: number,
  agg: Aggregate,
  now: number,
): Result<DomainEvent[], DomainError> {
  const maxIndex = agg.session.rotation.length - 1;

  if (fromIndex < 0 || fromIndex > maxIndex) {
    return err({ type: "InvalidIndex", index: fromIndex, max: maxIndex });
  }

  if (toIndex < 0 || toIndex > maxIndex) {
    return err({ type: "InvalidIndex", index: toIndex, max: maxIndex });
  }

  return ok([{ type: "MemberMoved", fromIndex, toIndex, now }]);
}

function decideMembersShuffle(
  order: number[],
  agg: Aggregate,
  now: number,
): Result<DomainEvent[], DomainError> {
  const len = agg.session.rotation.length;
  const maxIndex = len - 1;

  // 長さが rotation と一致しなければ不正（順列ではない）。
  if (order.length !== len) {
    return err({ type: "InvalidIndex", index: order.length, max: maxIndex });
  }

  // 各要素が 0..len-1 の範囲内かつ重複なし＝[0..len-1] の順列であることを検証する。
  const seen = new Set<number>();
  for (const i of order) {
    if (i < 0 || i > maxIndex) {
      return err({ type: "InvalidIndex", index: i, max: maxIndex });
    }
    if (seen.has(i)) {
      return err({ type: "InvalidIndex", index: i, max: maxIndex });
    }
    seen.add(i);
  }

  return ok([{ type: "MembersShuffled", order, now }]);
}

// ─── 設定変更 ────────────────────────────────────────────────────────────────

function decideConfigSet(
  partial: Partial<SessionConfig>,
  _agg: Aggregate,
  now: number,
): Result<DomainEvent[], DomainError> {
  // 交代間隔の検証
  if (partial.intervalMinutes !== undefined) {
    if (
      !(VALID_INTERVAL_MINUTES as readonly number[]).includes(
        partial.intervalMinutes,
      )
    ) {
      return err({
        type: "InvalidInterval",
        value: partial.intervalMinutes,
        allowed: [...VALID_INTERVAL_MINUTES],
      });
    }
  }

  // メンバー数の検証
  if (partial.members !== undefined) {
    if (partial.members.length < MIN_MEMBERS) {
      return err({ type: "BelowMinMembers", min: MIN_MEMBERS });
    }
    if (partial.members.length > MAX_MEMBERS) {
      return err({ type: "MemberLimitExceeded", limit: MAX_MEMBERS });
    }
    // 重複チェック
    const names = partial.members.map((m) => m.trim());
    const uniqueNames = new Set(names);
    if (uniqueNames.size !== names.length) {
      const dup = names.find((n, i) => names.indexOf(n) !== i) ?? "";
      return err({ type: "DuplicateName", name: dup });
    }
    // 空名チェック
    if (names.some((n) => n.length === 0)) {
      return err({ type: "EmptyName" });
    }
  }

  // 検証済みの部分設定のみをイベントに載せる（未指定フィールドは適用側で現状維持）。
  // language/difficulty を集約から捏造しない（集約は設定の真実源ではない）。
  const validatedPartial: Partial<SessionConfig> = {
    ...(partial.language !== undefined && { language: partial.language }),
    ...(partial.difficulty !== undefined && { difficulty: partial.difficulty }),
    ...(partial.members !== undefined && { members: partial.members.map((m) => m.trim()) }),
    ...(partial.intervalMinutes !== undefined && { intervalMinutes: partial.intervalMinutes }),
    ...(partial.navigatorEnabled !== undefined && { navigatorEnabled: partial.navigatorEnabled }),
    ...(partial.breakEveryRotations !== undefined && { breakEveryRotations: partial.breakEveryRotations }),
    ...(partial.assertiveSwitch !== undefined && { assertiveSwitch: partial.assertiveSwitch }),
  };

  return ok([{ type: "ConfigSet", config: validatedPartial, now }]);
}
