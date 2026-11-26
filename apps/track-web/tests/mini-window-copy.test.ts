import { afterEach, describe, expect, it } from 'vitest';
import { absolutizeCssUrls, copyRootAttributes, copyStylesInto, watchRootAttributes } from '../src/platform/mini-window';

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
});

/**
 * @requirements #476 設計 §5 D3（窓へ写した見た目の書体・属性）
 */
describe('url() の絶対化', () => {
  it('Given 相対の url（引用符あり・なし） / When 基準の URL で絶対にする / Then シートの場所からの絶対 URL になる', () => {
    const css = '@font-face { src: url("../f/a.woff2") format("woff2"), url(b.woff2); }';
    expect(absolutizeCssUrls(css, 'https://x.example/assets/s.css')).toBe(
      '@font-face { src: url("https://x.example/f/a.woff2") format("woff2"), url("https://x.example/assets/b.woff2"); }',
    );
  });

  it('Given 絶対・data・フラグメントの url / When 絶対にする / Then そのまま', () => {
    const css = 'a { background: url(https://y.example/i.png), url(data:image/png;base64,AAA), url(#frag); }';
    expect(absolutizeCssUrls(css, 'https://x.example/s.css')).toBe(css);
  });
});

describe('写し方', () => {
  it('Given 読める style（href なし） / When 写す / Then 開いたページの URL を基準に url() を絶対にして写す', () => {
    const source = document.implementation.createHTMLDocument('src');
    // jsdom の別文書は baseURI が about:blank なので、本物の文書を元にする
    const style = document.createElement('style');
    style.textContent = '.x { background-image: url(/img/x.png); }';
    document.head.appendChild(style);
    const target = source;
    copyStylesInto(document, target);
    style.remove();
    const written = Array.from(target.head.querySelectorAll('style')).map((s) => s.textContent).join('\n');
    expect(written).toContain(`url("${new URL('/img/x.png', document.baseURI).href}")`);
  });

  it('Given 読めない外部シートの相対 href / When 写す / Then link の href を絶対 URL にする', () => {
    const sheet = {
      href: '/assets/app.css',
      get cssRules(): never {
        throw new DOMException('blocked', 'SecurityError');
      },
    };
    const sourceLike = { documentElement: { attributes: [] }, styleSheets: [sheet], baseURI: 'https://t.example/track/' } as unknown as Document;
    const target = document.implementation.createHTMLDocument('dst');
    copyStylesInto(sourceLike, target);
    expect(target.head.querySelector('link')?.getAttribute('href')).toBe('https://t.example/assets/app.css');
  });
});

describe('html の属性の写し直し', () => {
  it('Given 元の html の属性が後から変わる / When 見張る / Then 窓の html へ写し直し、止めると写さない', async () => {
    const target = document.implementation.createHTMLDocument('dst');
    copyRootAttributes(document, target);
    const stop = watchRootAttributes(document, target);
    document.documentElement.setAttribute('data-theme', 'dark');
    await Promise.resolve();
    expect(target.documentElement.getAttribute('data-theme')).toBe('dark');
    stop();
    document.documentElement.setAttribute('data-theme', 'light');
    await Promise.resolve();
    expect(target.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('Given 元から属性が消えた / When 写し直す / Then 窓の html からも消える', () => {
    const target = document.implementation.createHTMLDocument('dst');
    target.documentElement.setAttribute('data-theme', 'dark');
    copyRootAttributes(document, target);
    expect(target.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});
