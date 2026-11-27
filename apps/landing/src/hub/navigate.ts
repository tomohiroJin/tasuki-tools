/**
 * 別の URL へ移動する（履歴に残る）。遷移はここに閉じる（テストは `vi.mock` で差し替える）。
 *
 * 呼んだ人が呼んだ道具へ移るとき（#677）に使う。**置き換え（`redirectTo`）にしない** —— 道具から戻る
 * （ブラウザの戻る）と、呼んだ玄関の画面へ帰れるようにする。
 */
export function navigateTo(to: string): void {
  window.location.assign(to);
}
