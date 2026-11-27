/**
 * ミニ表示（Document Picture-in-Picture）の窓の開閉を見る口（端末 I/O・#476・設計 §4 C1 の 5）。
 *
 * ミニ表示の窓が開いている間、利用者はいまの作業名と経過を見ながら離れているので、ページが非表示でも
 * 「離れていた」とは言えない。**ミニ表示そのものはこの PR で作らない**（別の PR）。ここは API の口を直接見るだけで、
 * ミニ表示のコードには依存しない。未対応のブラウザでは、一度も開いていない扱い（`pipWindowOpen` は false・`onPipOpened` は何もしない）。
 */
interface DocumentPictureInPictureLike extends EventTarget {
  readonly window?: unknown;
}

function apiOf(): DocumentPictureInPictureLike | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as { documentPictureInPicture?: DocumentPictureInPictureLike }).documentPictureInPicture;
}

/** いま、ミニ表示の窓が開いているか。 */
export function pipWindowOpen(): boolean {
  const api = apiOf();
  return api?.window !== undefined && api.window !== null;
}

/**
 * ミニ表示の窓が開いた（`enter`）ときに呼ぶ。外す関数を返す。
 * 窓は開いてすぐ閉じられることもあるので、「いま開いているか」だけでは見逃す。開いたこと自体を聞く。
 */
export function onPipOpened(listener: () => void): () => void {
  const api = apiOf();
  if (api === undefined || typeof api.addEventListener !== 'function') return () => undefined;
  api.addEventListener('enter', listener);
  return () => api.removeEventListener('enter', listener);
}
