/**
 * ドメインエラー定義
 * FR-010, FR-017
 */

/** メンバー名が空 */
export interface EmptyName {
  type: "EmptyName";
}

/** メンバー名が重複 */
export interface DuplicateName {
  type: "DuplicateName";
  name: string;
}

/** メンバー上限超過 */
export interface MemberLimitExceeded {
  type: "MemberLimitExceeded";
  limit: number;
}

/** 最小人数割れ */
export interface BelowMinMembers {
  type: "BelowMinMembers";
  min: number;
}

/** 権限不足 */
interface Unauthorized {
  type: "Unauthorized";
  command: string;
  requiredRole: string;
}

/** フェーズ競合 */
interface PhaseConflict {
  type: "PhaseConflict";
  currentPhase: string;
  requiredPhase: string;
}

/** 無効な交代間隔 */
export interface InvalidInterval {
  type: "InvalidInterval";
  value: number;
  allowed: number[];
}

/** 無効なインデックス */
interface InvalidIndex {
  type: "InvalidIndex";
  index: number;
  max: number;
}

/** 入力サイズが上限超過（メンバー数とは別。お題の要件数などの配列長制限に使う） */
interface InputLimitExceeded {
  type: "InputLimitExceeded";
  /** どの入力か（例: "requirements"） */
  field: string;
  limit: number;
}

/** ドメインエラーの合併型 */
export type DomainError =
  | EmptyName
  | DuplicateName
  | MemberLimitExceeded
  | BelowMinMembers
  | Unauthorized
  | PhaseConflict
  | InvalidInterval
  | InvalidIndex
  | InputLimitExceeded;

/**
 * **同期サーバー層（`apps/sync`）が固有に発行する失敗の種類**（FR-101）。
 *
 * ⚠ **値は wire に載る文字列そのものである。**変更・削除はクライアントの
 * `friendlyError(code)`（`ERROR_MESSAGES`）の引き当てを変えるため、挙動の変更にあたる。
 *
 * この一覧は `apps/sync/test/error-code-coverage.test.ts` が `apps/sync/src` を
 * 走査して集める 19 件を出発点にしている。走査は
 * `code: "..."` / `err("...")` という**リテラル**だけを拾うため、
 * 次の 4 件は走査に載らないが実際にはクライアントへ送られている
 * （`handlers.ts` が変数を経由して送るため正規表現に掛からない）。
 * 同テストの `EMITTED_VIA_VARIABLE` に明示的な集合として持たせ、走査結果へ合流させて
 * 検査対象に含めている:
 *
 * - `PASSPHRASE_REQUIRED` / `PASSPHRASE_MISMATCH`
 *   （変数 `code` へ代入してから送るため）
 * - `LEFT_ROOM` / `REMOVED_FROM_ROOM`
 *   （`removalNotificationFor()` が返す変数 `removalCode` を経由して送るため）
 *
 * `decide()` が返した `DomainError` の `type` も、そのまま `code` として送られる。
 * そちらは `ErrorCode` 側で合併している。
 *
 * 列挙を**値としても**持つのは、`apps/sync/test/error-code-coverage.test.ts` が
 * 「ソースに実在するコード」と「列挙」を突き合わせられるようにするためである
 * （型だけでは実行時に照合できず、列挙とソースの乖離を検出できない）。
 */
export const SYNC_ERROR_CODES = [
  // ─── 接続・プロトコル層（apps/sync/src/adapters/ws-adapter.ts）───
  "INTERNAL_ERROR",
  "INVALID_COMMAND",
  "INVALID_JSON",
  "MESSAGE_TOO_LARGE",
  // ─── ルームの入退室 ───
  "ROOM_LIMIT_EXCEEDED",
  "ROOM_NOT_FOUND",
  "NOT_IN_ROOM",
  "REMOVED_FROM_ROOM",
  "LEFT_ROOM",
  "PASSPHRASE_REQUIRED",
  "PASSPHRASE_MISMATCH",
  "RATE_LIMITED",
  // ─── 参加者・権限 ───
  "UNAUTHORIZED",
  "PARTICIPANT_NOT_FOUND",
  // ⚠ PARTICIPANT_OFFLINE / CANNOT_CHANGE_HOST / LAST_MANAGER は
  // Issue #29（H2/H3）で全ての拒否箇所を操作ごとの新コードへ差し替え済みのため、
  // ここから削除した（もうどこからも返らない）。文言は error-messages.ts の
  // ERROR_MESSAGES に残してある（配備前から開かれた画面が旧サーバーの応答を
  // 受け取り得るため。FR-137・SC-047・詳細は同ファイルの該当コメント参照）。
  // ─── 指名（driver.assign） ───
  "DRIVER_ASSIGN_OFFLINE",
  "NOT_IN_ROTATION",
  // ─── ホストの移譲・役割の変更 ───
  "HOST_TRANSFER_OFFLINE",
  "CANNOT_CHANGE_HOST_ROLE",
  "ALREADY_HOST",
  // ─── 退出・降格の不変条件 ───
  "LAST_MANAGER_LEAVE",
  "LAST_MANAGER_DEMOTE",
  // ─── お題の委譲 ───
  "DELEGATION_UNAVAILABLE",
  "STALE_SUBMISSION",
  // ─── AI 解錠 ───
  "AI_UNLOCK_FAILED",
  // ─── ルームへの参加 ───
  "JOIN_RATE_LIMITED",
  // ─── コマンドの解釈 ───
  "UNKNOWN_COMMAND",
  "INVALID",
] as const;

/**
 * 製品コードは `ErrorCode` だけを使うため、この別名は export しない
 * （`export` が不要な公開記号を増やさない・SC-039③）。
 */
type SyncErrorCode = (typeof SYNC_ERROR_CODES)[number];

/**
 * **クライアントへ送られ得る失敗の種類の列挙**（FR-101）。
 *
 * サーバー層固有のコード（`SyncErrorCode`）と、`decide()` が返した
 * `DomainError` の `type`（そのまま `code` として送られる）の合併である。
 *
 * ⚠ `ServerMsgSchema` の `code` は `nonEmptyString` のままにしてある。
 * スキーマを列挙へ狭めると**受信側の検証が変わり**、未知コードを弾くようになる
 * （＝挙動の変更）。ここは送信側を型で縛るための列挙であって、wire の制約ではない。
 */
export type ErrorCode = SyncErrorCode | DomainError["type"];
