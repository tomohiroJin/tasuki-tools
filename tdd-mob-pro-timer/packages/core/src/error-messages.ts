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
};

/** テーブルに該当コードが無い場合の既定文言（元の `friendlyError` の既定値と同一）。 */
export const DEFAULT_ERROR_MESSAGE = "操作を完了できませんでした。";

/**
 * コードから文言を引く（無ければ既定文言）。`ERROR_MESSAGES[code]` の直接参照は
 * `Record<string, string>` の索引アクセスが `string | undefined` になる
 * （`noUncheckedIndexedAccess`）ため、必ずここを経由させて `string` を保証する。
 */
export function errorMessageFor(code: string): string {
  return ERROR_MESSAGES[code] ?? DEFAULT_ERROR_MESSAGE;
}
