/**
 * timer の CSS のビルドの切り替え（`TASUKI_TIMER_UNLAYERED` / `TASUKI_TIMER_CSS_UNMINIFIED`・#321 の比較の仕組み）の
 * 取り残しを止める検査の自己テスト。
 *
 * 2 変数がシェルに残ると、通常の比較・`pnpm e2e`・配布前のビルドにも届く（turbo は宣言した変数をビルドへ渡す）。
 * 囲い無しの CSS や最小化しない CSS を、通常の比較で緑にする・本番へ配る、を止める。
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { leftoverParityBuildSwitches, setParityBuildSwitch } from '../harness/parity-build-switches';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('leftoverParityBuildSwitches', () => {
  it('Given どちらも立っていない / Then 空', () => {
    expect(leftoverParityBuildSwitches({})).toEqual([]);
  });
  it('Given シェルに 2 つとも残っている / Then 2 つとも返す', () => {
    expect(leftoverParityBuildSwitches({ TASUKI_TIMER_UNLAYERED: '1', TASUKI_TIMER_CSS_UNMINIFIED: '1' })).toEqual([
      'TASUKI_TIMER_UNLAYERED',
      'TASUKI_TIMER_CSS_UNMINIFIED',
    ]);
  });
  it('Given 値が 1 以外（0 など） / Then それでも取り残しとして返す（ビルドが読まない値でも、意図の分からない残りは止める）', () => {
    expect(leftoverParityBuildSwitches({ TASUKI_TIMER_CSS_UNMINIFIED: '0' })).toEqual(['TASUKI_TIMER_CSS_UNMINIFIED']);
  });
  it('Given 設定ファイルが自分で立てた / Then 取り残しにしない（Playwright の worker が設定を読み直しても止まらない）', () => {
    const env: NodeJS.ProcessEnv = {};
    setParityBuildSwitch(env, 'TASUKI_TIMER_CSS_UNMINIFIED');
    expect(env['TASUKI_TIMER_CSS_UNMINIFIED']).toBe('1');
    expect(leftoverParityBuildSwitches(env)).toEqual([]);
  });
  it('Given 設定ファイルが片方を立て、もう片方がシェルに残っている / Then 残っている方だけを返す', () => {
    const env: NodeJS.ProcessEnv = { TASUKI_TIMER_UNLAYERED: '1' };
    setParityBuildSwitch(env, 'TASUKI_TIMER_CSS_UNMINIFIED');
    expect(leftoverParityBuildSwitches(env)).toEqual(['TASUKI_TIMER_UNLAYERED']);
  });
});

describe('deploy.sh: 切り替えが立っていたらビルドの前に止める', () => {
  const deploy = (extra: Record<string, string>) =>
    spawnSync('bash', [path.join(REPO_ROOT, 'deploy/deploy.sh'), 'timer'], {
      encoding: 'utf8',
      env: { PATH: process.env['PATH'] ?? '', HOME: process.env['HOME'] ?? '', DRY_RUN: '1', TASUKI_SSH_HOST: 'stub-host', ...extra },
    });
  it('対照: 変数なしの DRY_RUN は通る', () => {
    const r = deploy({});
    expect(r.status, r.stderr).toBe(0);
  });
  it.each(['TASUKI_TIMER_UNLAYERED', 'TASUKI_TIMER_CSS_UNMINIFIED'])('Given %s=1 / Then ビルドの前に止まる', (name) => {
    const r = deploy({ [name]: '1' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain(name);
    expect(r.stdout).not.toContain('web をビルド');
  });
});
