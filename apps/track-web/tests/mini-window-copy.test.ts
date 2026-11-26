import { afterEach, describe, expect, it } from 'vitest';
import { copyRootAttributes, copyStylesInto, watchRootAttributes } from '../src/platform/mini-window';

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
});

/** reset.css の `body::after` と同じ形（data の中に入れ子の `url(%23n)` を持つ）。Chrome の `cssText` は url を二重引用符で囲んで返す */
const DATA_URL_RULE = `body::after { mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E"); }`;

/**
 * @requirements #476 設計 §5 D3（窓へ写した見た目の書体・属性）
 */
describe('写し方', () => {
  it('Given 読める style（href なし） / When 写す / Then 窓の head に開いたページの URL を指す base を置き、規則は書き換えずに写す', () => {
    const source = document.implementation.createHTMLDocument('src');
    // jsdom の別文書は baseURI が about:blank なので、本物の文書を元にする
    const style = document.createElement('style');
    style.textContent = '.x { background-image: url(/img/x.png); }';
    document.head.appendChild(style);
    const target = source;
    copyStylesInto(document, target);
    style.remove();
    expect(target.head.querySelector('base')?.getAttribute('href')).toBe(document.baseURI);
    const written = Array.from(target.head.querySelectorAll('style')).map((s) => s.textContent).join('\n');
    // 絶対にされず、相対のまま写る（cssText は引用符を付けて返す）
    expect(written).toMatch(/url\("?\/img\/x\.png"?\)/);
  });

  it('Given data の url（入れ子の url(%23n) を含む）の規則 / When 写す / Then 値が 1 文字も変わらない', () => {
    const sheet = { href: null, cssRules: [{ cssText: DATA_URL_RULE }] };
    const sourceLike = { documentElement: { attributes: [] }, styleSheets: [sheet], baseURI: 'https://t.example/track/' } as unknown as Document;
    const target = document.implementation.createHTMLDocument('dst');
    copyStylesInto(sourceLike, target);
    expect(target.head.querySelector('style')?.textContent).toBe(DATA_URL_RULE);
  });

  it('Given 読めるが href を持つシート（別ファイル） / When 写す / Then 規則は写さず、絶対 URL の link で引く（相対 url はそのシートの場所で読まれる）', () => {
    const sheet = { href: '/assets/app.css', cssRules: [{ cssText: '.x { background: url(../i.png); }' }] };
    const sourceLike = { documentElement: { attributes: [] }, styleSheets: [sheet], baseURI: 'https://t.example/track/' } as unknown as Document;
    const target = document.implementation.createHTMLDocument('dst');
    copyStylesInto(sourceLike, target);
    expect(target.head.querySelector('link')?.getAttribute('href')).toBe('https://t.example/assets/app.css');
    expect(target.head.querySelectorAll('style')).toHaveLength(0);
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
