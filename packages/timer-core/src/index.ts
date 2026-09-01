/**
 * @tasuki/timer-core パッケージのエントリポイント
 *
 * **公開記号は明示列挙する。`export *` は使わない**（ADR-0016 決定 2 項目 2）。
 *
 * ## 何を載せるか（ADR-0016 追記 2026-09-01・#182 / #220）
 *
 * - **値**（関数・定数）は、このパッケージの外の製品コードが取り込むものだけを載せる。
 *   代わりの入口があるなら載せない。落としてもパッケージ内部の相対 import は
 *   変わらないので、振る舞いは変わらない。将来外から使いたくなったら 1 行足せばよい。
 * - **型**は、載せた値の**署名から到達できる**なら載せる。取り込まれていなくても
 *   契約の一部である —— `decide(…): Result<DomainEvent[], DomainError>` は型推論が
 *   効くので誰も `DomainError` を書かないが、注釈を書きたい利用者は名前を要求する。
 *   **下の型はすべてこの理由で残している。**
 *
 * 値の側は `scripts/audit-structure.mjs` の SC-039④ が見張る（型は数えない）。
 *
 * ## サブパス入口があるものは、ここに載せない（#220）
 *
 * このパッケージには `index.ts` のほかに**モジュール単位のサブパス入口**がある
 * （`@tasuki/timer-core/aggregate` など。配線は `apps/timer-web` の
 * `vite.config.ts` / `vitest.config.ts` の alias と、各 app の `tsconfig.json` の
 * `paths`）。上限値の定数（`MAX_DISPLAY_NAME` など）と `elapsedMs`
 * `VALID_INTERVAL_MINUTES` は `apps/timer-web` が**このサブパスから**取り込んでおり、
 * index を通らない。**index の列挙が使われた根拠にならない**ので、2026-09-02 に
 * ここから落とした（利用側は無変更。SC-039④ の判定も同じ理由でサブパスを数えない）。
 *
 * 同じ理由で、テストだけが取り込む値も載せない（FR-090。テストからの参照は
 * 公開の根拠にしない）。`SYNC_ERROR_CODES` と `DEFAULT_ERROR_MESSAGE` は
 * `apps/timer-sync/test/error-code-coverage.test.ts` がサブパスから取り込む。
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
export { secondsLeft, initialAggregate, transferHost } from "./aggregate.js";
export { nameSkeleton, conflictsWithExisting } from "./display-name.js";
export { ERROR_MESSAGES, displayMessageFor, errorMessageFor } from "./error-messages.js";
// イベント
export type {
  DomainEvent,
} from "./events.js";
// エラー
export type {
  EmptyName,
  DuplicateName,
  MemberLimitExceeded,
  BelowMinMembers,
  InvalidInterval,
  DomainError,
  ErrorCode,
} from "./errors.js";
// decide / evolve
export { decide } from "./decide.js";
export { evolve, advanceDriver } from "./evolve.js";
// スキーマ
export type { ServerMsg, Command } from "./schemas.js";
export { CommandSchema, ServerMsgSchema } from "./schemas.js";
// お題
export type { ProblemWithSource, FallbackProblemEntry } from "./problem.js";
export { validateProblem, pickFallback, buildProblemPrompt } from "./problem.js";
// 記録
export { buildCompletionRecord } from "./records.js";
// 権限判定・不変条件（Issue #22）
export type { Role, PermissionInput } from "./permissions.js";
export { checkPermission, isAllowed } from "./permissions.js";
export { canDemote, canRemoveParticipant } from "./participants.js";
export type { RemovalNotification } from "./participants.js";
export { removalNotificationFor } from "./participants.js";
