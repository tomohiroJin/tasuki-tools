/**
 * VSCode の Playwright 拡張向けの設定が、リポジトリで共有されていることを固定する。
 *
 * この設定を配る前提は #162 で塞いだ穴である。配っただけで穴が残っていると、
 * 全員のテストエクスプローラに ▶ が現れ、古い成果物に対して静かに走る。
 * 逆に穴を塞いだのに配らないと、各自が同じ設定を手で置くことになる。
 *
 * ## 「追跡されている」だけでは足りない
 *
 * `.gitignore` は `.vscode/*` を無視するので、**否定パターンが 1 行消えると
 * 次に clone した人には届かなくなる**。ところが `git ls-files` は追跡済みの
 * パスに `.gitignore` を一切参照しないため、**否定行を消しても緑のまま**になる
 * （実測: 消して走らせても通った）。追跡状態とは別に、**`.gitignore` の効き目
 * そのもの**を `git check-ignore --no-index` で見る。
 */
import { describe, it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
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
  it('Given .vscode/* を無視する .gitignore / When 否定パターンの効き目を見る / Then settings.json は無視されない', () => {
    // Given: `--no-index` は追跡状態を無視して .gitignore の判定だけを行う。
    //        これを付けないと追跡済みという理由で常に「無視されない」が返り、
    //        否定パターンが消えても気づけない
    // When
    const { status } = spawnSync('git', ['check-ignore', '--no-index', '-q', SETTINGS_PATH], {
      cwd: REPO_ROOT,
    });

    // Then: 1 = 無視されない（0 なら無視されている＝共有が壊れている）
    expect(status).toBe(1);
  });

  it('Given 共有される設定 / When 追跡状況を見る / Then git の管理下にある', () => {
    // Given: 上の検査は .gitignore の効き目だけを見るので、
    //        実際に add されているかは別に確かめる
    // When
    const tracked = execFileSync('git', ['ls-files', SETTINGS_PATH], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }).trim();

    // Then
    expect(tracked).toBe(SETTINGS_PATH);
  });

  it('Given 共有される設定 / When 中身を読む / Then ローカル向けのターゲットを渡している', () => {
    // Given: 拡張は e2e / e2e:prod スクリプトを経由しないので TASUKI_E2E_TARGET が届かない。
    //        production を渡すと、本番へ当たる config が既定で読まれることになる
    const source = readFileSync(path.join(REPO_ROOT, SETTINGS_PATH), 'utf8');

    // When / Then: JSONC なので構文ではなく綴りで固定する。**キーの並びには依存させない**
    //              （playwright.env へ 2 つ目の変数を足したら赤くなる、では困る）
    expect(source).toMatch(/"playwright\.env"/);
    expect(source).toMatch(/"TASUKI_E2E_TARGET"\s*:\s*"local"/);
  });
});
