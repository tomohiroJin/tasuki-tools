/**
 * VSCode の Playwright 拡張向けの設定が、リポジトリで共有されていることを固定する。
 *
 * この設定を配る前提は #162 で塞いだ 2 つの穴である。配っただけで穴が残っていると、
 * 全員のテストエクスプローラに ▶ が現れ、**古い成果物に対して静かに走る**。
 * 逆に穴を塞いだのに配らないと、各自が同じ設定を手で置くことになる。
 *
 * `.gitignore` は `.vscode/*` を無視するので、**否定パターンが 1 行消えるだけで
 * 静かに共有されなくなる**（次に clone した人だけが赤くなり、置いた本人は気づかない）。
 * ここでは追跡されていること自体を見る。
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

function findRepoRoot(from: string): string {
  let dir = from;
  for (;;) {
    if (existsSync(path.join(dir, 'deploy')) && existsSync(path.join(dir, 'apps'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`リポジトリルートが見つからない（${from} から探索）`);
    dir = parent;
  }
}

const REPO_ROOT = findRepoRoot(process.cwd());
const SETTINGS_PATH = '.vscode/settings.json';

describe('.vscode/settings.json の共有', () => {
  it('Given .gitignore が .vscode/* を無視する / When 追跡状況を見る / Then settings.json は追跡されている', () => {
    // Given: .gitignore が .vscode/* を無視しているリポジトリ
    // When: git 自身に聞く。ファイルの存在ではなく**追跡されているか**を見る
    const tracked = execFileSync('git', ['ls-files', SETTINGS_PATH], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }).trim();

    // Then
    expect(tracked).toBe(SETTINGS_PATH);
  });

  it('Given 共有される設定 / When 中身を読む / Then ローカル向けのターゲットを渡している', () => {
    // Given: 拡張は e2e / e2e:prod スクリプトを経由しないので TASUKI_E2E_TARGET が届かない。
    //        production を渡すと、本番へ当たる config が既定で読まれることになる。
    const source = readFileSync(path.join(REPO_ROOT, SETTINGS_PATH), 'utf8');

    // When / Then: JSONC なので構文ではなく綴りで固定する
    expect(source).toMatch(
      /"playwright\.env"\s*:\s*\{\s*"TASUKI_E2E_TARGET"\s*:\s*"local"\s*\}/,
    );
  });
});
