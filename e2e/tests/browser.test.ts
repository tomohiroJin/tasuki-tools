/**
 * E2E を流すブラウザの選び方（#674・docs/adr/0031 の追記）。
 *
 * 既定は Chromium。WebKit（iPhone の端末）は `pnpm e2e:webkit` が `TASUKI_E2E_BROWSER=webkit` を付けて選ぶ。
 * 知らない値を Chromium に読み替えると、WebKit で流したつもりで Chromium の結果を見ることになるので落とす。
 */
import { describe, it, expect } from 'vitest';
import { resolveBrowser, toolchainStageOf } from '../harness/browser';

describe('resolveBrowser', () => {
  it('Given 指定が無い / When 解く / Then Chromium（pnpm e2e・pnpm e2e:prod はいままでどおり）', () => {
    expect(resolveBrowser({ TASUKI_E2E_TARGET: 'local' })).toBe('chromium');
    expect(resolveBrowser({ TASUKI_E2E_TARGET: 'production' })).toBe('chromium');
  });

  it('Given chromium・webkit / When 解く / Then そのまま返す', () => {
    expect(resolveBrowser({ TASUKI_E2E_TARGET: 'local', TASUKI_E2E_BROWSER: 'chromium' })).toBe('chromium');
    expect(resolveBrowser({ TASUKI_E2E_TARGET: 'local', TASUKI_E2E_BROWSER: 'webkit' })).toBe('webkit');
  });

  it('Given 知らない値（綴りの誤り・空文字） / When 解く / Then Chromium に読み替えずに落とす', () => {
    for (const value of ['WebKit', 'safari', 'firefox', '']) {
      expect(() => resolveBrowser({ TASUKI_E2E_TARGET: 'local', TASUKI_E2E_BROWSER: value }), value).toThrow(
        /TASUKI_E2E_BROWSER/,
      );
    }
  });

  it('Given 本番の E2E で webkit / When 解く / Then 落とす（本番を WebKit で流すかは決めていない。#674 のスコープ外）', () => {
    expect(() => resolveBrowser({ TASUKI_E2E_TARGET: 'production', TASUKI_E2E_BROWSER: 'webkit' })).toThrow(
      /本番/,
    );
  });
});

describe('toolchainStageOf', () => {
  it('Given ブラウザ / When 版の確認の段を引く / Then Chromium は e2e・WebKit は e2e-webkit', () => {
    expect(toolchainStageOf('chromium')).toBe('e2e');
    expect(toolchainStageOf('webkit')).toBe('e2e-webkit');
  });
});
