/**
 * ミニ表示の窓（Document Picture-in-Picture・端末 I/O。#476 第 2 段・設計 §5 D3）。
 *
 * ブラウザの API（`window.documentPictureInPicture`）に触れるのはここだけ。
 * **対応の有無を見るのもここ。非対応のブラウザへ代わりの道（`window.open` ほか）は作らない**（`docs/adr/0038` 追記の決定 3）。
 * 画面は `isMiniWindowSupported()` が偽なら「ミニ表示で出す」を出さない。
 */

/** ミニ表示の窓の大きさ（CSS px。ブラウザが収まる範囲へ寄せる） */
export const MINI_WINDOW_SIZE = { width: 320, height: 200 } as const;

/** この画面が使う範囲の Document Picture-in-Picture の型（lib.dom にまだ無い） */
interface DocumentPictureInPicture {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
}

const apiOf = (): DocumentPictureInPicture | null => {
  const api = (window as unknown as { documentPictureInPicture?: DocumentPictureInPicture }).documentPictureInPicture;
  return api === undefined || typeof api.requestWindow !== 'function' ? null : api;
};

/** ミニ表示の窓を出せるブラウザか。 */
export function isMiniWindowSupported(): boolean {
  return apiOf() !== null;
}

/** ミニ表示の窓を開く。非対応・利用者が許さなかった・開けなかったときは null（理由は問わない・ログも書かない）。 */
export async function requestMiniWindow(): Promise<Window | null> {
  const api = apiOf();
  if (api === null) return null;
  try {
    return await api.requestWindow({ ...MINI_WINDOW_SIZE });
  } catch {
    return null;
  }
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
 *
 * 窓の文書の基準 URL は元のページと違うので、窓の `<head>` に**開いたページの URL を指す `<base href>`** を置く
 * （`<style>` に写した規則の相対 `url(...)` は、これで元のページと同じ場所から読まれる）。
 * **規則の文字列は書き換えない**（`data:` の値の中の入れ子の `url(%23n)` まで壊すため）。
 * 場所を持つシート（`href` あり）は、規則が読めても絶対 URL の `<link>` で引く（相対の `url(...)` はそのシートの場所で読まれる）。
 * 場所を持たない `<style>` は、規則をそのまま `<style>` へ写す。`<html>` の属性も写す。
 *
 * **本番では `<base>` は効かない**（`deploy/caddy/tasuki.conf` の CSP が `base-uri 'none'`。窓は開いた側の CSP を受け継ぐ）。
 * 本番のビルドでは CSS はすべて場所を持つシート（`<link>`）なので、`<link>` で引き直すだけで足りる。
 * `<base>` が効くのは、開発時に Vite が差し込む場所を持たない `<style>` だけである。
 * 本番で場所を持たない `<style>` を差し込む形を持ち込むと、窓の中で相対の `url(...)` が解決されなくなる。
 */
export function copyStylesInto(source: Document, target: Document): void {
  copyRootAttributes(source, target);
  const base = target.createElement('base');
  base.href = source.baseURI;
  target.head.appendChild(base);
  for (const sheet of Array.from(source.styleSheets)) {
    if (sheet.href !== null) {
      const link = target.createElement('link');
      link.rel = 'stylesheet';
      link.href = new URL(sheet.href, source.baseURI).href;
      target.head.appendChild(link);
      continue;
    }
    try {
      const style = target.createElement('style');
      style.textContent = Array.from(sheet.cssRules)
        .map((rule) => rule.cssText)
        .join('\n');
      target.head.appendChild(style);
    } catch {
      // 場所も規則も無いシートは写せない
    }
  }
}
