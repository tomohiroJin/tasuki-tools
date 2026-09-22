/**
 * `window.location` への薄いラッパ（#95 S5c）。
 *
 * 画面は同期クライアントを直接 import しない（`docs/adr/0015` MUST 2）のと同じ理由で、
 * **遷移**（`assign` / `replace`）はここに閉じる。テストは `vi.mock` で差し替える。
 *
 * **読み取りまでは閉じていない。** 同期フックは `buildSyncUrl(window.location)` と
 * `buildInviteUrl(window.location.origin, ...)` で `window.location` を直接読んでいる
 * （どちらも `@tasuki/sync-client` へ丸ごと渡す形で、URL の組み立てはあちらが持つ）。
 * 遷移と違って差し替える必要が無いので、ここへ写しを作っていない（#95 S5c・M-4）。
 */

/** 現在の URL のクエリ文字列（`location.search`）。 */
export function currentSearch(): string {
  return window.location.search;
}

/** 別の URL へ移動する（履歴に残る。戻るボタンで往復できる）。 */
export function navigateTo(to: string): void {
  window.location.assign(to);
}

/**
 * 別の URL へ**置き換えて**移動する（履歴に残らない。戻るで元の URL へ往復できない）。
 *
 * 行き場の無い URL を玄関へ送り直すのはこちら（#95 S5c・R9）。`navigateTo` で送ると、
 * 戻るボタンが行き場の無い URL へ戻り、そこからまた送り返される往復になる。
 * 退出が成立したときも同じ理由でこちらを使う —— **履歴には残らない**ので、戻るボタンで
 * 抜けた直前のルームへ往復することはない。ただし行き先の URL 自体は `?room=CODE&left=<reason>`
 * を保つ（#290・D3）。抜けた本人のアドレスバーに `?room=CODE` が載ることと、
 * 履歴に積まないことは別の話である（FR-127 / US2-2）。
 */
export function redirectTo(to: string): void {
  window.location.replace(to);
}

/**
 * いまの URL をそのまま開き直す（#292）。
 *
 * **`redirectTo(window.location.href)` で代用してはいけない。** `location.replace()` は
 * 「いまの文書とフラグメントだけが違う URL」への遷移を**同一文書内のスクロール**として
 * 扱うため、URL に `#` があると再読み込みが起きない。いま timer 側に `#` を作る経路は
 * 無いが、**行き止まりの画面（`ui/Loading.tsx`）の唯一の主操作がこの一行に乗っている**
 * ので、条件つきで効く書き方を残さず原語に寄せる。
 */
export function reloadPage(): void {
  window.location.reload();
}
