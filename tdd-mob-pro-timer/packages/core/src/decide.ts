/**
 * decide 関数 — コマンドから DomainEvent[] を生成する純粋関数
 * T011: FR-002, FR-003, FR-004, FR-005, FR-009, FR-010
 */

import { ok, err, type Result } from "neverthrow";
import type { Aggregate, SessionConfig, ProblemMode } from "./aggregate.js";
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
  | { command: "session.act"; action: "START" | "SWITCH" | "PAUSE" | "RESUME" | "RESTART" }
  | { command: "session.complete" }
  | { command: "session.abort" }
  | { command: "session.reset"; config?: SessionConfig }
  | { command: "member.add"; participantId: string }
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
  | { command: "participant.rename"; participantId: string; displayName: string }
  | { command: "driver.skip"; participantId: string }
  | { command: "driver.resume"; participantId: string }
  | { command: "driver.assign"; index: number }
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
      return decideMemberAdd(cmd.participantId, agg, now);

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
      return decideRename(cmd.participantId, cmd.displayName, now);

    case "driver.skip":
      return ok([{ type: "DriverSkipped", participantId: cmd.participantId, now }]);

    case "driver.resume":
      return ok([{ type: "DriverResumed", participantId: cmd.participantId, now }]);

    case "driver.assign":
      return decideDriverAssign(cmd.index, agg, now);

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
  now: number,
): Result<DomainEvent[], DomainError> {
  const trimmed = displayName.trim();
  if (trimmed.length === 0) {
    return err({ type: "EmptyName" });
  }
  // 表示名の一意性は participants に対して検査する（サーバー側の責務・D6b/T052）。
  // rotation は参加者IDの配列になったので、ここから名前の重複は判定できない。
  // decide は集約（session/clock）しか見ないため、participants を持つ層へ移した。
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
  action: "START" | "SWITCH" | "PAUSE" | "RESUME" | "RESTART",
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

    case "RESTART":
      // 現ドライバーのまま持ち時間をやり直す（Issue #14）。走行中・一時停止中・停止中の
      // いずれでも「満タンで走り出す」は一貫して意味を持つためガードを置かない
      // （一時停止中の実行で走行再開する＝受け入れ基準。RESUME も未開始状態を受理する）。
      return ok([{ type: "DriverTimerReset", now }]);
  }
}

/**
 * 任意メンバーへドライバーを強制指名する（Issue #13）。
 * 既存 DriverSwitched を任意 index で発行し、evolve の担当回数加算・満タン再アンカーを流用する。
 * 稼働中のみ・rotation 範囲内のみ許可し、現ドライバー自身の指名は no-op（空イベント）とする。
 */
function decideDriverAssign(
  index: number,
  agg: Aggregate,
  now: number,
): Result<DomainEvent[], DomainError> {
  const { clock, session } = agg;

  // 稼働中でなければ指名しない（SWITCH と同じガード）。
  if (!clock.running) {
    return err({
      type: "PhaseConflict",
      currentPhase: "stopped",
      requiredPhase: "session",
    });
  }
  // rotation 範囲外は不正。
  if (index < 0 || index >= session.rotation.length) {
    return err({ type: "InvalidIndex", index, max: session.rotation.length - 1 });
  }
  // 現ドライバー自身の指名は no-op（イベント無し）。
  if (index === session.currentIndex) {
    return ok([]);
  }
  return ok([{ type: "DriverSwitched", nextIndex: index, now }]);
}

// ─── メンバー管理 ────────────────────────────────────────────────────────────

function decideMemberAdd(
  participantId: string,
  agg: Aggregate,
  now: number,
): Result<DomainEvent[], DomainError> {
  const trimmed = participantId.trim();

  if (trimmed.length === 0) {
    return err({ type: "EmptyName" });
  }

  // 既にローテーションに並んでいる人は二重に並べない（連打・再送の吸収）。
  if (agg.session.rotation.includes(trimmed)) {
    return err({ type: "DuplicateName", name: trimmed });
  }

  if (agg.session.rotation.length >= MAX_MEMBERS) {
    return err({ type: "MemberLimitExceeded", limit: MAX_MEMBERS });
  }

  return ok([{ type: "MemberAdded", participantId: trimmed, now }]);
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
    ...(partial.problemEnabled !== undefined && { problemEnabled: partial.problemEnabled }),
  };

  return ok([{ type: "ConfigSet", config: validatedPartial, now }]);
}
