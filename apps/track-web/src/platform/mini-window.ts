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

/** 絶対にしなくてよい url（絶対 URL・data・blob・フラグメント） */
const KEEP_URL = /^(?:[a-z][a-z0-9+.-]*:|#)/i;

/**
 * CSS の中の相対の `url(...)` を、`baseUrl`（そのシートの場所）からの絶対 URL にする。
 * 窓の文書の基準 URL は元のページと違うので、相対のまま写すと書体や画像が読めない。
 */
export function absolutizeCssUrls(cssText: string, baseUrl: string): string {
  return cssText.replace(/url\(\s*(['"]?)([^'")]*?)\1\s*\)/g, (whole, _quote: string, raw: string) => {
    if (raw === '' || KEEP_URL.test(raw)) return whole;
    try {
      return `url("${new URL(raw, baseUrl).href}")`;
    } catch {
      return whole;
    }
  });
}

/** 元の `<html>` の属性（`lang`・`data-theme` ほか）を窓の `<html>` へ写す（元に無い属性は窓からも外す）。 */
export function copyRootAttributes(source: Document, target: Document): void {
  const from = source.documentElement;
  const to = target.documentElement;
  for (const attr of Array.from(to.attributes)) {
    if (!from.hasAttribute(attr.name)) to.removeAttribute(attr.name);
  }
  for (const attr of Array.from(from.attributes)) {
    if (to.getAttribute(attr.name) !== attr.value) to.setAttribute(attr.name, attr.value);
  }
}

/** 元の `<html>` の属性が変わったら窓へ写し直す（色の切り替えに追従する）。返す関数で見張りを止める。 */
export function watchRootAttributes(source: Document, target: Document): () => void {
  const observer = new MutationObserver(() => copyRootAttributes(source, target));
  observer.observe(source.documentElement, { attributes: true });
  return () => observer.disconnect();
}

/**
 * 元のページの見た目を、開いた窓の文書へ写す。
 * 規則が読めるシートは、規則の `url(...)` をシートの場所で絶対にして `<style>` へ写し、
 * 読めないシート（別の出所）は絶対 URL の `<link>` で引く。`<html>` の属性も写す。
 */
export function copyStylesInto(source: Document, target: Document): void {
  copyRootAttributes(source, target);
  for (const sheet of Array.from(source.styleSheets)) {
    try {
      const style = target.createElement('style');
      const base = sheet.href ?? source.baseURI;
      style.textContent = Array.from(sheet.cssRules)
        .map((rule) => absolutizeCssUrls(rule.cssText, base))
        .join('\n');
      target.head.appendChild(style);
    } catch {
      if (sheet.href === null) continue;
      const link = target.createElement('link');
      link.rel = 'stylesheet';
      link.href = new URL(sheet.href, source.baseURI).href;
      target.head.appendChild(link);
    }
  }
}
