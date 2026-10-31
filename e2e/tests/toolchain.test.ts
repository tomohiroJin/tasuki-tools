/**
 * 起動前に、開発環境の版を宣言と比べる（#487・docs/adr/0031）。
 *
 * 比べ方の正本は `scripts/check-toolchain.mjs`（Chromium の revision の検査も #487 でそちらへ移した。
 * 判定のテストは `scripts/lib/toolchain.test.mjs`）。ここが見るのは、ハーネスがそれを
 * **e2e の段で**呼び、合わなければ起動せずに落ちること。
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { REPO_ROOT, readCaddyVersion } from '../harness/paths';
import { assertToolchain, type ToolchainRunner } from '../harness/toolchain';

describe('assertToolchain', () => {
  it('Given 検査が通る / When 呼ぶ / Then scripts/check-toolchain.mjs を e2e の段で起動し、落とさない', () => {
    // Given
    const calls: (readonly string[])[] = [];
    const run: ToolchainRunner = (args) => {
      calls.push(args);
      return 0;
    };
    // When / Then
    expect(() => assertToolchain(run)).not.toThrow();
    expect(calls).toEqual([[path.join(REPO_ROOT, 'scripts/check-toolchain.mjs'), 'e2e']]);
  });

  it('Given 版が合わない（非ゼロで終わる） / When 呼ぶ / Then 起動せずに落とす', () => {
    // Given
    const run: ToolchainRunner = () => 1;
    // When / Then
    expect(() => assertToolchain(run)).toThrow(/開発環境の版が宣言と合いません/);
  });

  it('Given 起動そのものが失敗した（null） / When 呼ぶ / Then 通したことにしない', () => {
    expect(() => assertToolchain(() => null)).toThrow(/開発環境の版/);
  });
});

describe('readCaddyVersion', () => {
  it('Given リポジトリの toolchain.json / When 読む / Then x.y.z の版が返る', () => {
    expect(readCaddyVersion()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('Given caddy が無い宣言 / When 読む / Then 起動前に落とす', () => {
    // Given
    const dir = mkdtempSync(path.join(tmpdir(), 'tasuki-e2e-toolchain-'));
    const file = path.join(dir, 'toolchain.json');
    writeFileSync(file, JSON.stringify({ node: '22.22.2', bun: '1.4.3' }));
    // When / Then
    expect(() => readCaddyVersion(file)).toThrow(/caddy/);
  });

  it('Given 範囲で書いた版 / When 読む / Then 落とす（取得先の URL を組めない）', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'tasuki-e2e-toolchain-'));
    const file = path.join(dir, 'toolchain.json');
    writeFileSync(file, JSON.stringify({ caddy: '^2.11.7' }));
    expect(() => readCaddyVersion(file)).toThrow(/x\.y\.z/);
  });
});

describe('caddyMissingMessage', () => {
  it('Given Caddy を取れなかった / When 案内を組む / Then 何が無く（版と置き場）、どう入れるか（取得先と照合）を示す', async () => {
    // Given / When
    const { caddyMissingMessage } = await import('../harness/caddy');
    const { CADDY_CACHE_DIR, CADDY_VERSION } = await import('../harness/paths');
    const message = caddyMissingMessage();
    // Then
    expect(message).toContain(`Caddy ${CADDY_VERSION}`);
    expect(message).toContain(path.join(CADDY_CACHE_DIR, 'caddy'));
    expect(message).toContain(`caddy_${CADDY_VERSION}_checksums.txt`);
    expect(message).toContain('起動しません');
  });
});
