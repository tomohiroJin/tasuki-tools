/**
 * e2e パッケージがワークスペースに正しく登録されていることを固定する。
 *
 * このテストが `pnpm test`（＝ turbo run test）で実行されること自体が、
 * 登録が効いている証拠になる。glob の追加を忘れると、このファイルは
 * 存在するのに一度も実行されない（＝ 静かに効かなくなる典型）。
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

describe('e2e パッケージの登録', () => {
  it('Given ワークスペース定義 / When glob を読む / Then e2e が含まれる', () => {
    // Given: pnpm-workspace.yaml
    const yaml = readFileSync(path.join(REPO_ROOT, 'pnpm-workspace.yaml'), 'utf8');
    // When / Then: e2e が packages の glob に含まれる
    expect(yaml).toMatch(/^\s*-\s*["']?e2e["']?\s*$/m);
  });

  it('Given e2e の依存宣言 / When 読む / Then 3 つの web アプリを依存として持つ', () => {
    // Given: turbo の ^build は package.json の依存宣言を根拠にする。
    //        ここが抜けると `pnpm e2e` 単独実行で dist がビルドされない。
    const pkg: unknown = JSON.parse(
      readFileSync(path.join(REPO_ROOT, 'e2e', 'package.json'), 'utf8'),
    );
    // When: dependencies を取り出す
    const deps =
      typeof pkg === 'object' && pkg !== null && 'dependencies' in pkg
        ? (pkg as { dependencies: Record<string, string> }).dependencies
        : {};
    // Then: 3 つとも workspace 依存として宣言されている
    expect(deps['@tasuki/timer-web']).toBe('workspace:*');
    expect(deps['@tasuki/poker-web']).toBe('workspace:*');
    expect(deps['@tasuki/landing']).toBe('workspace:*');
  });
});
