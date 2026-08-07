/**
 * `e2e/harness/paths.ts` の FRAGMENT_SOURCES（手書きの配列）が、ディスク上の
 * `deploy/<app>/caddy/*.conf` の実際の一覧と一致することを固定する。
 *
 * `caddy.ts` の installCaddyConfig は「設置した本数」を FRAGMENT_SOURCES.length
 * と突き合わせているだけで、これは自分がコピーした結果を数える自己参照でしかない。
 * FRAGMENT_SOURCES 自体がディスクの実際の断片と食い違っていても（例: 新しい断片が
 * 追加されたのに配列へ足し忘れた、既存の断片が壊れた内容に変わった）検出できない
 * （実測: deploy/poker/caddy/25-probe.conf に不正な断片を追加しても E2E は 13 件
 * 緑のまま通った）。ここでディスクの一覧と機械的に突き合わせる。
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { FRAGMENT_SOURCES, REPO_ROOT } from '../harness/paths';

const DEPLOY_ROOT = path.join(REPO_ROOT, 'deploy');

/**
 * `deploy/<app>/caddy/*.conf` を実際にディスクから列挙する。
 * `apps/landing/tests/caddy-fragment-port.test.ts` の走査と同じ形。
 */
function fragmentsOnDisk(): string[] {
  const found: string[] = [];
  const appDirs = readdirSync(DEPLOY_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  for (const app of appDirs) {
    const caddyDir = path.join(DEPLOY_ROOT, app, 'caddy');
    if (!existsSync(caddyDir)) continue;
    for (const name of readdirSync(caddyDir)) {
      if (!name.endsWith('.conf')) continue;
      found.push(path.join(caddyDir, name));
    }
  }
  return found;
}

describe('FRAGMENT_SOURCES とディスク上の断片の一致', () => {
  const onDisk = fragmentsOnDisk();
  const declared = [...FRAGMENT_SOURCES];

  it('Given deploy 配下 / When *.conf を走査する / Then 5 本ある（0 件で素通りしないことの固定）', () => {
    // Given / When: fragmentsOnDisk() が deploy/<app>/caddy を正しく辿れている
    // Then: 0 件だと以降の比較が常に成立してしまう（実際にこの穴を踏んだ）
    expect(onDisk).toHaveLength(5);
  });

  it('Given FRAGMENT_SOURCES / When 本数を見る / Then 5 本ある', () => {
    // Given / When
    // Then: 手書きの配列自体が空・欠落していないこと
    expect(declared).toHaveLength(5);
  });

  it('Given FRAGMENT_SOURCES とディスクの一覧 / When 集合として比べる / Then 完全一致する', () => {
    // Given: 手書きの配列とディスクの実際の一覧
    // When: 順序に依存しない集合として突き合わせる
    const declaredSet = new Set(declared);
    const onDiskSet = new Set(onDisk);

    const missingFromDeclared = onDisk.filter((f) => !declaredSet.has(f));
    const missingFromDisk = declared.filter((f) => !onDiskSet.has(f));

    // Then: ディスクにあるのに FRAGMENT_SOURCES に無い断片（追加を足し忘れ）
    expect(missingFromDeclared, 'ディスクにあるが FRAGMENT_SOURCES に無い断片').toEqual([]);
    // Then: FRAGMENT_SOURCES にあるのにディスクに無い断片（削除・改名を反映し忘れ）
    expect(missingFromDisk, 'FRAGMENT_SOURCES にあるがディスクに無い断片').toEqual([]);
  });

  it('Given FRAGMENT_SOURCES の各エントリ / When 実在を確認する / Then すべて読める', () => {
    // Given / When: 各パスが実在し、内容を持つこと
    for (const source of declared) {
      // Then
      expect(existsSync(source), `${source} が存在しない`).toBe(true);
      expect(readFileSync(source, 'utf8').length, `${source} が空`).toBeGreaterThan(0);
    }
  });
});
