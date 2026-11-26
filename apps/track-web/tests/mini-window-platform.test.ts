import { afterEach, describe, expect, it, vi } from 'vitest';
import { MINI_WINDOW_SIZE, copyStylesInto, isMiniWindowSupported, requestMiniWindow } from '../src/platform/mini-window';

afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as unknown as { documentPictureInPicture?: unknown }).documentPictureInPicture;
});

const stubApi = (requestWindow: unknown): void => {
  (window as unknown as { documentPictureInPicture?: unknown }).documentPictureInPicture = { requestWindow };
};

/**
 * @requirements #476 設計 §5 D3（ミニ表示は対応ブラウザでだけ・代わりの道を作らない）
 */
describe('小さな窓の対応', () => {
  it('Given API が無い / When 対応を見る / Then 非対応で、窓を開こうとしても null', async () => {
    expect(isMiniWindowSupported()).toBe(false);
    expect(await requestMiniWindow()).toBeNull();
  });

  it('Given API がある / When 対応を見る / Then 対応', () => {
    stubApi(vi.fn());
    expect(isMiniWindowSupported()).toBe(true);
  });

  it('Given API の形が違う（requestWindow が関数でない） / When 対応を見る / Then 非対応', () => {
    stubApi('x');
    expect(isMiniWindowSupported()).toBe(false);
  });

  it('Given 対応 / When 開く / Then 決めた大きさで頼み、開いた窓を返す', async () => {
    const win = {} as Window;
    const requestWindow = vi.fn().mockResolvedValue(win);
    stubApi(requestWindow);
    expect(await requestMiniWindow()).toBe(win);
    expect(requestWindow).toHaveBeenCalledWith({ width: MINI_WINDOW_SIZE.width, height: MINI_WINDOW_SIZE.height });
  });

  it('Given 開く要求が拒まれた / When 開く / Then null（例外を出さない）', async () => {
    stubApi(vi.fn().mockRejectedValue(new Error('NotAllowedError')));
    expect(await requestMiniWindow()).toBeNull();
  });

  it('Given window.open だけある非対応ブラウザ / When 開く / Then window.open を使わない', async () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);
    expect(await requestMiniWindow()).toBeNull();
    expect(open).not.toHaveBeenCalled();
  });
});

describe('見た目の写し', () => {
  it('Given 規則の読めるシートと html の属性 / When 写す / Then 規則を style に、属性を html に写す', () => {
    // 操作のない文書の styleSheets は jsdom が組まないので、本物の文書を元にする
    const source = document;
    source.documentElement.setAttribute('data-theme', 'dark');
    const style = source.createElement('style');
    style.textContent = '.a { color: red; }';
    source.head.appendChild(style);
    const target = document.implementation.createHTMLDocument('dst');
    copyStylesInto(source, target);
    expect(target.documentElement.getAttribute('data-theme')).toBe('dark');
    const copied = target.head.querySelectorAll('style');
    expect(copied).toHaveLength(1);
    expect(copied[0]!.textContent).toContain('.a');
    style.remove();
    source.documentElement.removeAttribute('data-theme');
  });

  it('Given 規則を読めないシート（別の出所） / When 写す / Then link で引く', () => {
    const sheet = {
      href: 'https://cdn.example/x.css',
      get cssRules(): never {
        throw new DOMException('blocked', 'SecurityError');
      },
    };
    const source = { documentElement: { attributes: [] }, styleSheets: [sheet] } as unknown as Document;
    const target = document.implementation.createHTMLDocument('dst');
    copyStylesInto(source, target);
    const link = target.head.querySelector('link[rel="stylesheet"]');
    expect(link?.getAttribute('href')).toBe('https://cdn.example/x.css');
    expect(target.head.querySelectorAll('style')).toHaveLength(0);
  });

  it('Given 読めず href も無いシート / When 写す / Then 何も足さない', () => {
    const sheet = {
      href: null,
      get cssRules(): never {
        throw new DOMException('blocked', 'SecurityError');
      },
    };
    const source = { documentElement: { attributes: [] }, styleSheets: [sheet] } as unknown as Document;
    const target = document.implementation.createHTMLDocument('dst');
    copyStylesInto(source, target);
    expect(target.head.querySelectorAll('style, link')).toHaveLength(0);
  });
});
