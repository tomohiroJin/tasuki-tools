/**
 * Valibot スキーマ（Command / ServerMsg / Problem / SessionConfig）
 * FR-021, FR-023, NFRセキュリティ(S3)
 */

import * as v from "valibot";
import { VALID_INTERVAL_MINUTES, MIN_MEMBERS, MAX_MEMBERS, MAX_PROBLEM_REQUIREMENTS } from "./aggregate.js";

// ─── 共通 ───────────────────────────────────────────────────────────────────

const nonEmptyString = v.pipe(v.string(), v.minLength(1));
const participantId = nonEmptyString;

// ─── SessionConfig スキーマ ─────────────────────────────────────────────────

export const SessionConfigSchema = v.object({
  language: nonEmptyString,
  difficulty: nonEmptyString,
  members: v.pipe(
    v.array(nonEmptyString),
    v.minLength(MIN_MEMBERS),
    v.maxLength(MAX_MEMBERS),
  ),
  intervalMinutes: v.picklist(VALID_INTERVAL_MINUTES),
  navigatorEnabled: v.optional(v.boolean()),
  breakEveryRotations: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
  assertiveSwitch: v.optional(v.boolean()),
});

// ─── Problem スキーマ ────────────────────────────────────────────────────────

export const ProblemSchema = v.object({
  title: nonEmptyString,
  description: nonEmptyString,
  requirements: v.pipe(v.array(nonEmptyString), v.maxLength(MAX_PROBLEM_REQUIREMENTS)),
  exampleTest: nonEmptyString,
  hints: v.array(v.string()),
  // v2 追加フィールド（任意化で後方互換）
  source: v.optional(v.picklist(["ai", "fallback", "custom"])),
  edited: v.optional(v.boolean()),
});

// ─── Command スキーマ ────────────────────────────────────────────────────────

const RoomCreateCommand = v.object({
  command: v.literal("room.create"),
  displayName: nonEmptyString,
  config: v.optional(SessionConfigSchema),
});

const RoomJoinCommand = v.object({
  command: v.literal("room.join"),
  code: nonEmptyString,
  displayName: nonEmptyString,
  hasAiKey: v.boolean(),
  resumeToken: v.optional(v.string()),
});

const ConfigSetCommand = v.object({
  command: v.literal("config.set"),
  config: v.partial(SessionConfigSchema),
});

const PhaseSetCommand = v.object({
  command: v.literal("phase.set"),
  phase: v.picklist(["setup", "ready", "session", "celebration"]),
});

const ProblemRequestCommand = v.object({
  command: v.literal("problem.request"),
  requestId: nonEmptyString,
});

const ProblemSubmitCommand = v.object({
  command: v.literal("problem.submit"),
  requestId: nonEmptyString,
  problem: ProblemSchema,
  usedFallback: v.boolean(),
});

/** セッション操作アクション */
export const SessionActionValues = [
  "START",
  "SWITCH",
  "PAUSE",
  "RESUME",
  "COMPLETE",
  "RESET",
] as const;

const SessionActCommand = v.object({
  command: v.literal("session.act"),
  action: v.picklist(SessionActionValues),
});

const SessionCompleteCommand = v.object({
  command: v.literal("session.complete"),
});

const SessionResetCommand = v.object({
  command: v.literal("session.reset"),
});

const MemberAddCommand = v.object({
  command: v.literal("member.add"),
  name: nonEmptyString,
});

const MemberRemoveCommand = v.object({
  command: v.literal("member.remove"),
  index: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

const MemberMoveCommand = v.object({
  command: v.literal("member.move"),
  fromIndex: v.pipe(v.number(), v.integer(), v.minValue(0)),
  toIndex: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

const HandoffNoteSetCommand = v.object({
  command: v.literal("handoff.note.set"),
  text: v.string(),
});

const BreakStartCommand = v.object({
  command: v.literal("break.start"),
});

const BreakEndCommand = v.object({
  command: v.literal("break.end"),
});

// ─── v2 新コマンド ────────────────────────────────────────────────────────────

const SessionAbortCommand = v.object({
  command: v.literal("session.abort"),
});

const ParticipantAddProxyCommand = v.object({
  command: v.literal("participant.addProxy"),
  participantId,
  displayName: nonEmptyString,
});

const ParticipantRenameCommand = v.object({
  command: v.literal("participant.rename"),
  participantId,
  displayName: nonEmptyString,
});

const DriverSkipCommand = v.object({
  command: v.literal("driver.skip"),
  participantId,
});

const DriverResumeCommand = v.object({
  command: v.literal("driver.resume"),
  participantId,
});

const ProblemPatchSchema = v.partial(v.object({
  title: nonEmptyString,
  description: nonEmptyString,
  requirements: v.pipe(v.array(nonEmptyString), v.maxLength(MAX_PROBLEM_REQUIREMENTS)),
  exampleTest: nonEmptyString,
  hints: v.array(v.string()),
}));

const ProblemEditCommand = v.object({
  command: v.literal("problem.edit"),
  patch: ProblemPatchSchema,
});

const ProblemModeSetCommand = v.object({
  command: v.literal("problem.mode.set"),
  mode: v.picklist(["ai", "fallback"]),
});

const RoleSetCommand = v.object({
  command: v.literal("role.set"),
  participantId,
  role: v.picklist(["editor", "viewer"]),
});

const PresencePingCommand = v.object({
  command: v.literal("presence.ping"),
});

const TimePingCommand = v.object({
  command: v.literal("time.ping"),
  clientTime: v.number(),
});

/** クライアント→サーバー コマンドの合併スキーマ */
export const CommandSchema = v.variant("command", [
  RoomCreateCommand,
  RoomJoinCommand,
  ConfigSetCommand,
  PhaseSetCommand,
  ProblemRequestCommand,
  ProblemSubmitCommand,
  SessionActCommand,
  SessionCompleteCommand,
  SessionAbortCommand,
  SessionResetCommand,
  MemberAddCommand,
  MemberRemoveCommand,
  MemberMoveCommand,
  HandoffNoteSetCommand,
  BreakStartCommand,
  BreakEndCommand,
  ParticipantAddProxyCommand,
  ParticipantRenameCommand,
  DriverSkipCommand,
  DriverResumeCommand,
  ProblemEditCommand,
  ProblemModeSetCommand,
  RoleSetCommand,
  PresencePingCommand,
  TimePingCommand,
]);

export type Command = v.InferOutput<typeof CommandSchema>;

// ─── ServerMsg スキーマ ──────────────────────────────────────────────────────

// Room のスキーマ（Valibot で検証用）
export const ParticipantSchema = v.object({
  participantId,
  connId: v.nullable(v.string()),
  displayName: nonEmptyString,
  role: v.picklist(["host", "editor", "viewer"]),
  presence: v.picklist(["online", "idle", "offline"]),
  hasAiKey: v.boolean(),
  joinedAt: v.number(),
  // v2 追加フィールド（任意化で後方互換）
  isPlaceholder: v.optional(v.boolean()),
  driverEligible: v.optional(v.boolean()),
});

export const ServerClockSchema = v.object({
  running: v.boolean(),
  intervalSeconds: v.number(),
  anchorServerTime: v.number(),
  secondsLeftAtAnchor: v.number(),
  accumulatedElapsedMs: v.number(),
  runningSince: v.nullable(v.number()),
});

export const SessionStateSchema = v.object({
  rotation: v.array(v.string()),
  currentIndex: v.pipe(v.number(), v.integer(), v.minValue(0)),
  isPaused: v.boolean(),
  driverCounts: v.array(v.pipe(v.number(), v.integer(), v.minValue(0))),
  totalSwitches: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

export const CompletionRecordSchema = v.object({
  id: nonEmptyString,
  roomId: v.optional(v.string()),
  problemTitle: nonEmptyString,
  language: nonEmptyString,
  difficulty: nonEmptyString,
  elapsedSeconds: v.pipe(v.number(), v.minValue(0)),
  members: v.array(nonEmptyString),
  totalSwitches: v.pipe(v.number(), v.integer(), v.minValue(0)),
  completedAt: v.number(),
});

export const RoomSchema = v.object({
  code: nonEmptyString,
  createdAt: v.number(),
  hostParticipantId: participantId,
  config: SessionConfigSchema,
  problem: v.nullable(ProblemSchema),
  session: SessionStateSchema,
  clock: ServerClockSchema,
  phase: v.picklist(["setup", "ready", "session", "celebration"]),
  participants: v.array(ParticipantSchema),
  sessionRecords: v.array(CompletionRecordSchema),
  handoffNote: v.string(),
  onBreak: v.boolean(),
  // v2 追加フィールド（任意化で後方互換）
  problemMode: v.optional(v.picklist(["ai", "fallback"])),
});

const SnapshotMsg = v.object({
  type: v.literal("snapshot"),
  room: RoomSchema,
});

const ErrorMsg = v.object({
  type: v.literal("error"),
  code: nonEmptyString,
  message: v.string(),
});

const SignalSwitchMsg = v.object({
  type: v.literal("signal"),
  signal: v.literal("switch"),
  nextDriverName: v.string(),
});

const SignalCelebrationMsg = v.object({
  type: v.literal("signal"),
  signal: v.literal("celebration"),
});

const SignalNeedProblemMsg = v.object({
  type: v.literal("signal"),
  signal: v.literal("need-problem"),
  requestId: nonEmptyString,
  deadlineMs: v.number(),
});

const SignalSuggestBreakMsg = v.object({
  type: v.literal("signal"),
  signal: v.literal("suggest-break"),
  // 何巡したかの参考値（演出のみ・状態ではない・§5.2）
  rounds: v.number(),
});

const TimePongMsg = v.object({
  type: v.literal("time.pong"),
  serverTime: v.number(),
});

const RoomCreatedMsg = v.object({
  type: v.literal("room.created"),
  code: nonEmptyString,
  hostToken: nonEmptyString,
  resumeToken: nonEmptyString,
  participantId,
});

const RoomJoinedMsg = v.object({
  type: v.literal("room.joined"),
  resumeToken: nonEmptyString,
  participantId,
});

/** サーバー→クライアント メッセージの合併スキーマ */
export const ServerMsgSchema = v.variant("type", [
  SnapshotMsg,
  ErrorMsg,
  SignalSwitchMsg,
  SignalCelebrationMsg,
  SignalNeedProblemMsg,
  SignalSuggestBreakMsg,
  TimePongMsg,
  RoomCreatedMsg,
  RoomJoinedMsg,
]);

export type ServerMsg = v.InferOutput<typeof ServerMsgSchema>;
