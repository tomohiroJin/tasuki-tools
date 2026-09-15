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
 * 退出が成立したときも同じ理由でこちらを使う —— 抜けた本人の履歴に、
 * 直前のルームを指す URL を残さない（FR-127 / US2-2）。
 */
export function redirectTo(to: string): void {
  window.location.replace(to);
}
