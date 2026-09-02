/**
 * Chromium の要求 revision が導入済みかを起動前に検査する。
 *
 * 検査しないと、Playwright が root 所有の /opt/playwright-browsers へ
 * 書こうとして、原因の分からないエラーになる。devcontainer のイメージが
 * 更新されたら、この検査が最初に教えてくれる。
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertChromiumInstalled, requiredChromiumRevision } from '../harness/browsers';

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

/**
 * `harness/browsers.ts` は `playwright-core` を直接 require する。**素の Node の
 * 解決規則だけで見つかること**をここで固定する。
 *
 * この検査が要る理由: `pnpm e2e` で通っていたのは、Playwright ランナーが
 * モジュール解決を補っていたからであって、依存が宣言されていたからではない。
 * VSCode の Playwright 拡張はランナーの外から config を読むためその補完が無く、
 * globalSetup が `Cannot find module 'playwright-core/package.json'` で止まり、
 * **テストが 1 件も走らないまま赤になる**（#162 で ▶ を押して実測）。
 *
 * **vitest の中で `require.resolve` を呼んでも再現しない。** vitest 自身の解決に
 * なるためで、それでは拡張と同じ条件を測ったことにならない。素の node を子プロセスで
 * 起動し、`harness/browsers.ts` を起点に解決させる。
 *
 * **子プロセスへ環境変数をそのまま継承させてもいけない。** vitest のワーカーは
 * `NODE_PATH` に仮想ストアの hoist 先（`.pnpm-virtual/node_modules`）を積んでおり、
 * 継承すると宣言が無くても解決できてしまう。実際にこの検査を最初そう書いて、
 * **依存を足す前から緑になった**（＝何も測っていなかった）。`PATH` だけを渡す。
 */
/** 解決の補完が一切効かない、素の Node の環境。 */
const BARE_ENV = { PATH: process.env['PATH'] ?? '' };

describe('playwright-core の解決', () => {
  it('Given ランナーの補完が無い素の Node / When harness を起点に解決する / Then playwright-core が見つかる', () => {
    // Given: 拡張が config を読むときと同じ、補完の無い解決
    const browsersUrl = pathToFileURL(path.join(REPO_ROOT, 'e2e/harness/browsers.ts')).href;
    const script =
      "import { createRequire } from 'node:module';" +
      `process.stdout.write(createRequire(${JSON.stringify(browsersUrl)}).resolve('playwright-core/package.json'));`;

    // When: 解決できなければ MODULE_NOT_FOUND で異常終了し、ここが投げる
    const resolved = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8',
      cwd: REPO_ROOT,
      env: BARE_ENV,
    });

    // Then
    expect(resolved).toMatch(/playwright-core[/\\]package\.json$/);
  });

  it('Given e2e の package.json / When 2 つの版を読む / Then playwright-core は @playwright/test と同じ版で固定されている', () => {
    // Given: browsers.json の revision は playwright-core の版に紐づく。
    //        版がずれると、検査は実際に使われるものとは別の revision を見る。
    const manifest: unknown = JSON.parse(
      readFileSync(path.join(REPO_ROOT, 'e2e/package.json'), 'utf8'),
    );
    const devDependencies = (manifest as { devDependencies: Record<string, string> })
      .devDependencies;

    // When / Then: 範囲指定を許さず完全一致で固定する
    expect(devDependencies['playwright-core']).toMatch(/^\d+\.\d+\.\d+$/);
    expect(devDependencies['playwright-core']).toBe(devDependencies['@playwright/test']);
  });
});
