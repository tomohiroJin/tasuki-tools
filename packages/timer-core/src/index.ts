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
 *   **下の型はすべてこの理由で残している**（到達しなくなった `FallbackProblemEntry` は
 *   2026-09-02 に落とした。参照していた唯一の値 `FALLBACK_PROBLEMS` を落としたため）。
 *
 * **値を落とすと、その値を型の位置で使う署名が書けなくなることがある。**
 * `validateProblem` の失敗型は `v.ValiError<typeof ProblemSchema>` だったので、
 * `ProblemSchema`（値）を落とすと外から名前で書けなくなった。`ProblemValidationError`
 * という型別名を与えて解いてある。**値を落とす前に、その値が型の位置に現れないか見ること。**
 *
 * 値の側は `scripts/audit-structure.mjs` の SC-039④ が見張る（型は数えない）。
 *
 * ## サブパス入口があるものは、ここに載せない（#220）
 *
 * このパッケージには `index.ts` のほかに**モジュール単位のサブパス入口**がある
 * （`@tasuki/timer-core/aggregate` など）。上限値の定数（`MAX_DISPLAY_NAME` など）と
 * `elapsedMs` `VALID_INTERVAL_MINUTES` は `apps/timer-web` が**このサブパスから**取り込んでおり、
 * index を通らない。**index の列挙が使われた根拠にならない**ので、2026-09-02 に
 * ここから落とした（利用側は無変更。SC-039④ の判定も同じ理由でサブパスを数えない）。
 *
 * ⚠ **サブパスの配線は app ごとに違い、モジュールごとに揃ってもいない。**
 * `apps/timer-web` は `vite.config.ts` / `vitest.config.ts` の alias で解決するが、
 * **並んでいるのは 8 モジュールだけ**（aggregate / events / errors / decide / evolve /
 * schemas / problem / records）。一方 `tsconfig.json` の `paths` は
 * `@tasuki/timer-core/*` のワイルドカードなので、**alias の無いモジュールを
 * timer-web から取り込むと typecheck は緑のまま build と vitest だけが落ちる。**
 * 新しいサブパスを timer-web で使うときは、alias を 2 つの設定へ足すこと。
 * `apps/timer-sync` は tsconfig の `paths` で解決する（下の注意書きも読むこと）。
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
export type { ProblemWithSource, ProblemValidationError } from "./problem.js";
export { validateProblem, pickFallback, buildProblemPrompt } from "./problem.js";
// 記録
export { buildCompletionRecord } from "./records.js";
// 権限判定・不変条件（Issue #22）
export type { Role, PermissionInput } from "./permissions.js";
export { checkPermission, isAllowed } from "./permissions.js";
export { canDemote, canRemoveParticipant } from "./participants.js";
export type { RemovalNotification } from "./participants.js";
export { removalNotificationFor } from "./participants.js";
