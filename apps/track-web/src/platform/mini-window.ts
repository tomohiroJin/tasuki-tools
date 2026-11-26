/**
 * ミニ表示の小さな窓（Document Picture-in-Picture・端末 I/O。#476 第 2 段・設計 §5 D3）。
 *
 * ブラウザの API（`window.documentPictureInPicture`）に触れるのはここだけ。
 * **対応の有無を見るのもここ。非対応のブラウザへ代わりの道（`window.open` ほか）は作らない**（`docs/adr/0038` 追記の決定 3）。
 * 画面は `isMiniWindowSupported()` が偽なら「小さな窓で出す」を出さない。
 */

/** 小さな窓の大きさ（CSS px。ブラウザが収まる範囲へ寄せる） */
export const MINI_WINDOW_SIZE = { width: 320, height: 200 } as const;

/** この画面が使う範囲の Document Picture-in-Picture の型（lib.dom にまだ無い） */
interface DocumentPictureInPicture {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
}

const apiOf = (): DocumentPictureInPicture | null => {
  const api = (window as unknown as { documentPictureInPicture?: DocumentPictureInPicture }).documentPictureInPicture;
  return api === undefined || typeof api.requestWindow !== 'function' ? null : api;
};

/** 小さな窓を出せるブラウザか。 */
export function isMiniWindowSupported(): boolean {
  return apiOf() !== null;
}

/** 小さな窓を開く。非対応・利用者が許さなかった・開けなかったときは null（理由は問わない・ログも書かない）。 */
export async function requestMiniWindow(): Promise<Window | null> {
  const api = apiOf();
  if (api === null) return null;
  try {
    return await api.requestWindow({ ...MINI_WINDOW_SIZE });
  } catch {
    return null;
  }
}

/**
 * 元のページの見た目を、開いた窓の文書へ写す。
 * 規則が読めるシートは規則を `<style>` へ写し、読めないシート（別の出所）は `<link>` で引く。
 * `<html>` の属性（`lang`・`data-theme`）も写す（色の切り替えが `:root` の属性に付くため）。
 */
export function copyStylesInto(source: Document, target: Document): void {
  for (const attr of Array.from(source.documentElement.attributes)) {
    target.documentElement.setAttribute(attr.name, attr.value);
  }
  for (const sheet of Array.from(source.styleSheets)) {
    try {
      const style = target.createElement('style');
      style.textContent = Array.from(sheet.cssRules)
        .map((rule) => rule.cssText)
        .join('\n');
      target.head.appendChild(style);
    } catch {
      if (sheet.href === null) continue;
      const link = target.createElement('link');
      link.rel = 'stylesheet';
      link.href = sheet.href;
      target.head.appendChild(link);
    }
  }
}
