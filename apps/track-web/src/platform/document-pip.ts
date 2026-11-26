/**
 * ミニ表示（Document Picture-in-Picture）の窓が開いているか（端末 I/O・#476・設計 §4 C1 の 5）。
 *
 * ミニ表示の窓が開いている間、利用者はいまの作業名と経過を見ながら離れているので、ページが非表示でも
 * 「離れていた」とは言えない。**ミニ表示そのものはこの PR で作らない**（別の PR）。ここは API の口を直接見るだけで、
 * ミニ表示のコードには依存しない。未対応のブラウザでは、いつも閉じている（false）。
 */
interface DocumentPictureInPictureLike {
  readonly window?: unknown;
}

export function pipWindowOpen(): boolean {
  if (typeof window === 'undefined') return false;
  const api = (window as { documentPictureInPicture?: DocumentPictureInPictureLike }).documentPictureInPicture;
  return api?.window !== undefined && api.window !== null;
}
