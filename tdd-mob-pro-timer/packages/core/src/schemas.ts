/**
 * Valibot スキーマ（Command / ServerMsg / Problem / SessionConfig）
 * FR-021, FR-023, NFRセキュリティ(S3)
 */

import * as v from "valibot";
import {
  VALID_INTERVAL_MINUTES,
  MAX_MEMBERS,
  MAX_PROBLEM_REQUIREMENTS,
  MAX_DISPLAY_NAME,
  MAX_ROOM_NAME,
  MAX_HANDOFF_NOTE,
  MAX_PROBLEM_TITLE,
  MAX_PROBLEM_TEXT,
  MAX_PROBLEM_HINT,
  MAX_PROBLEM_HINTS,
  MAX_PASSPHRASE,
  MAX_AI_UNLOCK_KEY,
} from "./aggregate.js";

// ─── 共通 ───────────────────────────────────────────────────────────────────

const nonEmptyString = v.pipe(v.string(), v.minLength(1));
const participantId = nonEmptyString;

// ユーザ入力文字列は信頼境界で最大長を課す（A04・巨大入力 DoS 対策）。
const displayNameStr = v.pipe(v.string(), v.minLength(1), v.maxLength(MAX_DISPLAY_NAME));
const problemTitleStr = v.pipe(v.string(), v.minLength(1), v.maxLength(MAX_PROBLEM_TITLE));
const problemTextStr = v.pipe(v.string(), v.minLength(1), v.maxLength(MAX_PROBLEM_TEXT));
const requirementStr = v.pipe(v.string(), v.minLength(1), v.maxLength(MAX_PROBLEM_TEXT));
const hintStr = v.pipe(v.string(), v.maxLength(MAX_PROBLEM_HINT));
// パスフレーズ（空文字=解除を許すため minLength なし。最大長のみ課す）。
const passphraseStr = v.pipe(v.string(), v.maxLength(MAX_PASSPHRASE));

// ─── SessionConfig スキーマ ─────────────────────────────────────────────────

export const SessionConfigSchema = v.object({
  language: nonEmptyString,
  difficulty: nonEmptyString,
  // 境界では 1 人以上を許可する（ルームは作成者 1 人で始まり、join で増える＝2層モデル）。
  // 「セッション中に 2 人未満へ削除しない」という不変条件は decide の guard 側で担保する。
  members: v.pipe(
    v.array(displayNameStr),
    v.minLength(1),
    v.maxLength(MAX_MEMBERS),
  ),
  intervalMinutes: v.picklist(VALID_INTERVAL_MINUTES),
  navigatorEnabled: v.optional(v.boolean()),
  // 0 は「休憩提案オフ」を表す（ロビーでトグルを外したときに送る）。1 以上で N 巡ごと。
  breakEveryRotations: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
  assertiveSwitch: v.optional(v.boolean()),
});

// ─── Problem スキーマ ────────────────────────────────────────────────────────

export const ProblemSchema = v.object({
  title: problemTitleStr,
  description: problemTextStr,
  requirements: v.pipe(v.array(requirementStr), v.maxLength(MAX_PROBLEM_REQUIREMENTS)),
  exampleTest: problemTextStr,
  hints: v.pipe(v.array(hintStr), v.maxLength(MAX_PROBLEM_HINTS)),
  // v2 追加フィールド（任意化で後方互換）
  source: v.optional(v.picklist(["ai", "fallback", "custom"])),
  edited: v.optional(v.boolean()),
});

// ─── Command スキーマ ────────────────────────────────────────────────────────

const RoomCreateCommand = v.object({
  command: v.literal("room.create"),
  displayName: displayNameStr,
  config: v.optional(SessionConfigSchema),
  // 任意のルーム名。コード生成のシードに使う（slug-接尾辞）。
  roomName: v.optional(v.pipe(v.string(), v.maxLength(MAX_ROOM_NAME))),
});

const RoomJoinCommand = v.object({
  command: v.literal("room.join"),
  code: nonEmptyString,
  displayName: displayNameStr,
  hasAiKey: v.boolean(),
  resumeToken: v.optional(v.string()),
  passphrase: v.optional(passphraseStr),
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

// 順列はサーバーが生成するため、wire コマンドにはフィールドを持たせない。
const MemberShuffleCommand = v.object({ command: v.literal("member.shuffle") });

const HandoffNoteSetCommand = v.object({
  command: v.literal("handoff.note.set"),
  text: v.pipe(v.string(), v.maxLength(MAX_HANDOFF_NOTE)),
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
  displayName: displayNameStr,
});

const ParticipantRenameCommand = v.object({
  command: v.literal("participant.rename"),
  participantId,
  displayName: displayNameStr,
});

const ParticipantRemoveCommand = v.object({
  command: v.literal("participant.remove"),
  participantId,
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
  title: problemTitleStr,
  description: problemTextStr,
  requirements: v.pipe(v.array(requirementStr), v.maxLength(MAX_PROBLEM_REQUIREMENTS)),
  exampleTest: problemTextStr,
  hints: v.pipe(v.array(hintStr), v.maxLength(MAX_PROBLEM_HINTS)),
}));

const ProblemEditCommand = v.object({
  command: v.literal("problem.edit"),
  patch: ProblemPatchSchema,
});

const ProblemModeSetCommand = v.object({
  command: v.literal("problem.mode.set"),
  mode: v.picklist(["ai", "fallback"]),
});

const RoomPassphraseSetCommand = v.object({
  command: v.literal("room.passphrase.set"),
  passphrase: passphraseStr,
});

const AiUnlockCommand = v.object({
  command: v.literal("ai.unlock"),
  key: v.pipe(v.string(), v.maxLength(MAX_AI_UNLOCK_KEY)),
});

const RoleSetCommand = v.object({
  command: v.literal("role.set"),
  participantId,
  role: v.picklist(["editor", "viewer"]),
});

const HostTransferCommand = v.object({
  command: v.literal("host.transfer"),
  participantId,
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
  MemberShuffleCommand,
  HandoffNoteSetCommand,
  BreakStartCommand,
  BreakEndCommand,
  ParticipantAddProxyCommand,
  ParticipantRenameCommand,
  ParticipantRemoveCommand,
  DriverSkipCommand,
  DriverResumeCommand,
  ProblemEditCommand,
  ProblemModeSetCommand,
  RoomPassphraseSetCommand,
  AiUnlockCommand,
  RoleSetCommand,
  HostTransferCommand,
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
  driverCounts: v.optional(v.array(v.pipe(v.number(), v.integer(), v.minValue(0)))),
  rounds: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
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
  passphraseProtected: v.optional(v.boolean()),
  aiUnlocked: v.optional(v.boolean()),
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
