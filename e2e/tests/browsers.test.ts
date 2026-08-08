/**
 * Chromium の要求 revision が導入済みかを起動前に検査する。
 *
 * 検査しないと、Playwright が root 所有の /opt/playwright-browsers へ
 * 書こうとして、原因の分からないエラーになる。devcontainer のイメージが
 * 更新されたら、この検査が最初に教えてくれる。
 */
import { describe, it, expect } from 'vitest';
import { assertChromiumInstalled, requiredChromiumRevision } from '../harness/browsers';

describe('requiredChromiumRevision', () => {
  it('Given 導入済みの playwright-core / When 要求 revision を読む / Then 数字の文字列が返る', () => {
    // Given / When
    const revision = requiredChromiumRevision();
    // Then: browsers.json から読めている
    expect(revision).toMatch(/^\d+$/);
  });
});

describe('assertChromiumInstalled', () => {
  it('Given PLAYWRIGHT_BROWSERS_PATH が未設定 / When 検査する / Then 何もしない（Playwright に任せる）', () => {
    // Given: CI では Playwright が自分で ~/.cache へ入れる
    // When / Then: 落ちない
    expect(() => assertChromiumInstalled({})).not.toThrow();
  });

  it('Given 存在しないディレクトリを指す / When 検査する / Then 要求 revision を示して落ちる', () => {
    // Given: ずれた環境
    const env = { PLAYWRIGHT_BROWSERS_PATH: '/nonexistent-browsers-path' };
    // When / Then
    expect(() => assertChromiumInstalled(env)).toThrow(new RegExp(requiredChromiumRevision()));
  });

  it('Given この環境の PLAYWRIGHT_BROWSERS_PATH / When 検査する / Then 通る', () => {
    // Given: devcontainer には chromium-1234 が導入済み
    const configured = process.env['PLAYWRIGHT_BROWSERS_PATH'];
    if (configured === undefined) return; // CI では未設定なので検査しない
    // When / Then
    expect(() => assertChromiumInstalled({ PLAYWRIGHT_BROWSERS_PATH: configured })).not.toThrow();
  });
});
