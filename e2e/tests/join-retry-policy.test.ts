/**
 * 2 つの web の入室再試行方針が食い違っていないことを固定する（#147）。
 *
 * `apps/timer-web/src/sync/join-retry.ts` と `apps/poker-web/src/join-retry.ts` は
 * 同じ方針を持つが、**2 つの web の間に TypeScript を共有するパッケージが無い**ため
 * 写しで持っている（`@tasuki/ui` は CSS とトークンだけの入れ物で、TS を持たない）。
 *
 * 写しは片側だけが直る。ここでは**コメントを除いたコード**を突き合わせ、
 * 一方だけが変わったら落とす。方針を変えるときは両方を同じに直す。
 */
import { describe, it, expect } from 'vitest';
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

const COPIES = [
  'apps/timer-web/src/sync/join-retry.ts',
  'apps/poker-web/src/join-retry.ts',
];

/** コメントと空行を落として、コードだけを取り出す。 */
function codeOf(rel: string): string {
  const source = readFileSync(path.join(REPO_ROOT, rel), 'utf8');
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, '').trimEnd())
    .filter((line) => line.trim().length > 0)
    .join('\n');
}

describe('入室の再試行方針', () => {
  it('Given 2 つの web の写し / When コードだけを取り出す / Then 完全に一致する', () => {
    // Given: 写しが 2 つとも実在する（片方を消して緑になっては困る）
    for (const rel of COPIES) {
      expect(existsSync(path.join(REPO_ROOT, rel)), `${rel} が実在しません`).toBe(true);
    }
    // When
    const [timer, poker] = COPIES.map(codeOf);
    // Then: 方針を変えるときは両方を同じに直す
    expect(poker).toBe(timer);
  });

  it('Given 取り出したコード / When 中身を見る / Then 方針の骨格が残っている', () => {
    // Given: コメントだけのファイルになっていたら、上の一致は無意味になる
    // When
    const timer = codeOf(COPIES[0]!);
    // Then
    expect(timer).toContain('JOIN_RETRY_MAX_ATTEMPTS');
    expect(timer).toContain('joinRetryDelayMs');
    expect(timer.split('\n').length).toBeGreaterThan(5);
  });
});
