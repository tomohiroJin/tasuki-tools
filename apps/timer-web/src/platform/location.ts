/**
 * `window.location` への薄いラッパ（#95 S5c）。
 *
 * 画面は同期クライアントを直接 import しない（`docs/adr/0015` MUST 2）のと同じ理由で、
 * `window.location` も画面から直接触らずここへ閉じる。テストは `vi.mock` で差し替える。
 */

/** 現在の URL のクエリ文字列（`location.search`）。 */
export function currentSearch(): string {
  return window.location.search;
}

/** 別の URL へ移動する（履歴に残る。戻るボタンで往復できる）。 */
export function navigateTo(to: string): void {
  window.location.assign(to);
}
