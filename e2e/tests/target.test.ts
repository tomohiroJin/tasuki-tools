/**
 * ターゲットの取り違えを防ぐ。
 *
 * シェルに前回の TASUKI_E2E_BASE_URL が残ったまま `pnpm e2e` を叩くと、
 * ローカル向けのつもりで本番へ全シナリオを流す事故が起きる。
 * 逆に本番向けの実行で変数が空だと、本番を確認したつもりでローカルを見る。
 * **どちらの向きも起動前に落とす。**
 */
import { describe, it, expect } from 'vitest';
import { LOCAL_BASE_URL, resolveTarget } from '../harness/target';

describe('resolveTarget', () => {
  it('Given TASUKI_E2E_TARGET=local かつ BASE_URL 未設定 / When 解決する / Then ローカルの固定 URL になる', () => {
    // Given / When
    const target = resolveTarget({ TASUKI_E2E_TARGET: 'local' });
    // Then
    expect(target).toEqual({ kind: 'local', baseURL: LOCAL_BASE_URL });
    expect(LOCAL_BASE_URL).toBe('http://127.0.0.1:18080');
  });

  it('Given local なのに BASE_URL が残っている / When 解決する / Then 落ちる', () => {
    // Given: 前回の本番実行の変数が残った状態
    const env = { TASUKI_E2E_TARGET: 'local', TASUKI_E2E_BASE_URL: 'https://example.com' };
    // When / Then: 本番へ流す前に落とす
    expect(() => resolveTarget(env)).toThrow(/TASUKI_E2E_BASE_URL/);
  });

  it('Given production かつ https の公開 URL / When 解決する / Then その URL になる', () => {
    // Given / When
    const target = resolveTarget({
      TASUKI_E2E_TARGET: 'production',
      TASUKI_E2E_BASE_URL: 'https://tasuki.example.com',
    });
    // Then
    expect(target).toEqual({ kind: 'production', baseURL: 'https://tasuki.example.com' });
  });

  it('Given production かつ末尾スラッシュ付き / When 解決する / Then 末尾スラッシュを取り除く', () => {
    // Given: baseURL に末尾スラッシュがあると Playwright の相対パス解決がずれる
    const target = resolveTarget({
      TASUKI_E2E_TARGET: 'production',
      TASUKI_E2E_BASE_URL: 'https://tasuki.example.com/',
    });
    // Then
    expect(target.baseURL).toBe('https://tasuki.example.com');
  });

  it('Given production なのに BASE_URL が無い / When 解決する / Then 落ちる', () => {
    expect(() => resolveTarget({ TASUKI_E2E_TARGET: 'production' })).toThrow(/TASUKI_E2E_BASE_URL/);
  });

  it('Given production なのに http / When 解決する / Then 落ちる', () => {
    // Given: 本番は必ず TLS。http を許すと誤った対象を見て緑になる
    const env = { TASUKI_E2E_TARGET: 'production', TASUKI_E2E_BASE_URL: 'http://tasuki.example.com' };
    expect(() => resolveTarget(env)).toThrow(/https/);
  });

  it.each([
    'https://localhost',
    'https://127.0.0.1:18080',
    'https://10.1.2.3',
    'https://192.168.1.5',
    'https://172.16.0.1',
  ])('Given production なのにローカル宛の %s / When 解決する / Then 落ちる', (url) => {
    // Given: 本番のつもりでローカルを見る事故を塞ぐ
    const env = { TASUKI_E2E_TARGET: 'production', TASUKI_E2E_BASE_URL: url };
    expect(() => resolveTarget(env)).toThrow(/ローカル/);
  });

  it('Given TASUKI_E2E_TARGET が未設定 / When 解決する / Then 落ちる', () => {
    // Given: playwright.config.ts を直接叩かれた場合。既定値を持たせない
    expect(() => resolveTarget({})).toThrow(/TASUKI_E2E_TARGET/);
  });

  it('Given TASUKI_E2E_TARGET が想定外の値 / When 解決する / Then 落ちる', () => {
    expect(() => resolveTarget({ TASUKI_E2E_TARGET: 'staging' })).toThrow(/TASUKI_E2E_TARGET/);
  });
});
