/**
 * ドメインエラーコード → 利用者向け文言の一元管理（T064・FR-105）。
 *
 * **正本はここ。** 元は `apps/web/src/App.tsx` にだけ定義されていた
 * `ERROR_MESSAGES`（クライアントが実際に画面へ表示している文言）を、
 * 1文字も変えずにそのまま移したもの。
 *
 * 調査で判明した事実（詳細は docs/plans/codebase-refactoring/plan.md 変更5）:
 * サーバー（apps/sync）が WebSocket で送る `message` は画面に一度も表示されていない。
 * `apps/web/src/sync/dispatch.ts` は `cb.onError?.(msg.code, msg.message)` と渡しているが、
 * `apps/web/src/App.tsx` の `onError: (code) => ...` は第2引数（message）を受け取らずに
 * 捨てている。画面表示は常にこの表を `code` だけで引く `friendlyError(code)` が行う。
 *
 * したがって、このテーブルこそが「利用者に見える文言」の唯一の正本である。
 * サーバー側で同じコードに複数の文言リテラルが独立に実装されていた箇所
 * （LAST_MANAGER / CANNOT_CHANGE_HOST / PARTICIPANT_NOT_FOUND / PARTICIPANT_OFFLINE /
 * RATE_LIMITED の5種）は、画面表示上は元々この表の1文言にしか見えていなかったため、
 * ここへ寄せる（T066）。
 */
export const ERROR_MESSAGES: Record<string, string> = {
  BelowMinMembers: "最後のドライバーは外れられません。",
  DuplicateName: "その名前はすでに使われています。",
  EmptyName: "名前を入力してください。",
  MemberLimitExceeded: "メンバーが上限に達しています。",
  InvalidInterval: "その交代間隔は選べません。",
  UNAUTHORIZED: "この操作の権限がありません。",
  RATE_LIMITED: "試行が多すぎます。しばらく待ってから再試行してください。",
  // ホスト移譲（R2-3）の失敗理由を利用者向けの日本語にする。
  PARTICIPANT_OFFLINE: "オフラインの相手にはホストを移譲できません。",
  CANNOT_CHANGE_HOST: "自分自身にはホストを移譲できません。",
  PARTICIPANT_NOT_FOUND: "対象の参加者が見つかりません。",
  // 任意ルームパスフレーズ（R4-2）の join 失敗理由。
  PASSPHRASE_REQUIRED: "このルームはパスフレーズが必要です。",
  PASSPHRASE_MISMATCH: "パスフレーズが一致しません。",
  // AI お題生成の解錠（合言葉不一致・未設定サーバ共通）。
  AI_UNLOCK_FAILED: "合言葉が違います。",
  // 「進行できる人が1名以上残る」不変条件（Issue #22・FR-072/073）。
  // 退出と降格の両方から返るため、どちらでも通じる文言にする。
  LAST_MANAGER: "進行できる人がいなくなるため実行できません。他の人が進行に加わってから操作してください。",
  // 自己退出（Issue #32）。遷移先の入口画面が既に「名前を入れてルームを作る」導線を
  // 示しているため、文言でそれを繰り返さず1文に留める。他者に外されたわけではないので
  // 「〜させられました」という表現は使わない。
  LEFT_ROOM: "ルームから抜けました。",
  // 他者に退出させられた（Issue #22・FR-075）。元は apps/web/src/App.tsx に直書きされていた
  // 文言を1文字も変えずにここへ移した（FR-105: 文言の定義箇所は1つ）。
  // REMOVED_FROM_ROOM と REMOVED_BY_HOST の2つのキーに同じ文言を持たせるのは、
  // REMOVED_BY_HOST が旧サーバー互換のためのコードだからである。web と sync は
  // 同時デプロイだが、デプロイ前から開いたままのタブが旧サーバーの応答
  // （REMOVED_BY_HOST）を受け取りうるため、両方を受理し続ける必要がある。
  REMOVED_FROM_ROOM: "ルームから退出しました。再参加するには名前を入力してください。",
  REMOVED_BY_HOST: "ルームから退出しました。再参加するには名前を入力してください。",
};

/** テーブルに該当コードが無い場合の既定文言（元の `friendlyError` の既定値と同一）。 */
export const DEFAULT_ERROR_MESSAGE = "操作を完了できませんでした。";

/**
 * **サーバー（`apps/sync`）が wire の `message` に載せるだけで、画面には表示されないコードの文言。**
 *
 * ⚠ **`ERROR_MESSAGES` と統合してはならない。**
 * `apps/web/src/App.tsx` の `friendlyError(code)` は `ERROR_MESSAGES[code] ?? DEFAULT_ERROR_MESSAGE`
 * であり、**表に載っているかどうかで画面の文言が変わる**。
 * これらのコードは元々クライアントの表に無く、画面には既定文言
 * （「操作を完了できませんでした。」）が出ていた。統合すると**表示が変わる**（FR-114 違反）。
 *
 * 実際に一度統合してしまい、`NOT_IN_ROOM` の表示が
 * 「操作を完了できませんでした。」→「ルームに参加していません」に変わる退行を作った。
 * **型検査もテストも通る**（テストはコードだけを見ており、文言を見ていない）ため、
 * 実機確認の直前まで気づけなかった。
 *
 * 分けたうえで `apps/sync` からの引き当てを 1 箇所にすれば、FR-105（文言は単一の箇所で定義する）は
 * 満たされる。**要件が求めるのは「定義箇所が 1 つ」であって「テーブルが 1 つ」ではない。**
 */
const SERVER_ONLY_ERROR_MESSAGES: Record<string, string> = {
  NOT_IN_ROOM: "ルームに参加していません",
  DELEGATION_UNAVAILABLE: "お題生成が利用できません",
};

/**
 * **画面に表示する文言を引く。** サーバー専用の文言は決して返さない。
 *
 * 元は `apps/web/src/App.tsx` の `friendlyError()` という**モジュール内の private 関数**だった。
 * そのためテストから触れず、「どのコードのとき利用者に何が見えるか」を検証する手段が無かった。
 * T066 で `NOT_IN_ROOM` の表示が変わる退行を作ったとき、
 * **型検査もテストも通ってしまった原因はここにある**（規則がテストの届かない場所にあった）。
 *
 * 規則をここへ出し、`App.tsx` は必ずこれを経由する（FR-107: 全ての箇所が共通の実装を経由する）。
 */
export function displayMessageFor(code: string): string {
  return ERROR_MESSAGES[code] ?? DEFAULT_ERROR_MESSAGE;
}

/**
 * **wire の `message` フィールドに載せる文言を引く。画面表示には使わない。**
 *
 * 画面表示は `displayMessageFor()` を使うこと。こちらはサーバー専用の文言も返すため、
 * 画面で使うと本来 既定文言が出ていたコードにサーバーの文言が出てしまう。
 *
 * `ERROR_MESSAGES[code]` の直接参照は `Record<string, string>` の索引アクセスが
 * `string | undefined` になる（`noUncheckedIndexedAccess`）ため、必ずここを経由させて
 * `string` を保証する。
 */
export function errorMessageFor(code: string): string {
  return ERROR_MESSAGES[code] ?? SERVER_ONLY_ERROR_MESSAGES[code] ?? DEFAULT_ERROR_MESSAGE;
}
