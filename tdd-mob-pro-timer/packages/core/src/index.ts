/**
 * @tdd-mob/core パッケージのエントリポイント
 *
 * T055: `export *` を、現在公開されている記号の明示列挙に置換したもの（FR-110）。
 * 型定義出力（`dist/*.d.ts`）から公開記号を機械的に抽出して列挙した。
 * 公開の必要性の見直しは T057 が行う（本ファイルは挙動不変）。
 */

// 集約・型
export type {
  ServerClock,
  Aggregate,
  SessionConfig,
  ProblemSource,
  Problem,
  Participant,
  ProblemMode,
  RoomPhase,
  Room,
  CompletionRecord,
  IntervalMinutes,
} from "./aggregate.js";
export {
  secondsLeft,
  elapsedMs,
  initialAggregate,
  nextEligibleIndex,
  transferHost,
  VALID_INTERVAL_MINUTES,
  MIN_MEMBERS,
  MAX_MEMBERS,
  MAX_PROBLEM_REQUIREMENTS,
  MAX_DISPLAY_NAME,
  MAX_NFKC_EXPANSION,
  MAX_ROOM_NAME,
  MAX_HANDOFF_NOTE,
  MAX_PROBLEM_TITLE,
  MAX_PROBLEM_TEXT,
  MAX_PROBLEM_HINT,
  MAX_PROBLEM_HINTS,
  MAX_CONFIG_LANGUAGE,
  MAX_CONFIG_DIFFICULTY,
  MAX_PASSPHRASE,
  MAX_AI_UNLOCK_KEY,
} from "./aggregate.js";
export { normalizeDisplayName, nameSkeleton, conflictsWithExisting } from "./display-name.js";
export {
  ERROR_MESSAGES,
  DEFAULT_ERROR_MESSAGE,
  displayMessageFor,
  errorMessageFor,
} from "./error-messages.js";
// イベント
export type {
  SessionStarted,
  DriverSwitched,
  SessionPaused,
  SessionResumed,
  SessionReset,
  DriverTimerReset,
  PhaseSet,
  ConfigSet,
  MemberAdded,
  MemberRemoved,
  MemberMoved,
  MembersShuffled,
  ProblemSet,
  HandoffNoteSet,
  BreakStarted,
  BreakEnded,
  SessionCompleted,
  SessionAborted,
  ProxyMemberAdded,
  ParticipantRenamed,
  DriverSkipped,
  DriverResumed,
  ProblemEdited,
  ProblemModeSet,
  DomainEvent,
} from "./events.js";
// エラー
export type {
  EmptyName,
  DuplicateName,
  MemberLimitExceeded,
  BelowMinMembers,
  Unauthorized,
  PhaseConflict,
  InvalidInterval,
  InvalidIndex,
  InputLimitExceeded,
  DomainError,
  ErrorCode,
} from "./errors.js";
export { SYNC_ERROR_CODES } from "./errors.js";
// decide / evolve
export { decide } from "./decide.js";
export { evolve, advanceDriver } from "./evolve.js";
// スキーマ
export type { ServerMsg } from "./schemas.js";
export {
  SessionConfigSchema,
  ProblemSchema,
  CommandSchema,
  RoomSchema,
  ServerMsgSchema,
} from "./schemas.js";
// お題
export type { ProblemWithSource, FallbackProblemEntry } from "./problem.js";
export {
  FALLBACK_PROBLEMS,
  validateProblem,
  pickFallback,
  buildProblemPrompt,
} from "./problem.js";
// 記録
export { buildCompletionRecord } from "./records.js";
// 権限判定・不変条件（Issue #22）
export type { Role, PermissionInput } from "./permissions.js";
export { checkPermission, isAllowed } from "./permissions.js";
export { countManagers, canDemote, canRemoveParticipant } from "./participants.js";
