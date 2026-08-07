/**
 * turbo.json の `e2e` / `e2e:prod` が TASUKI_E2E_BASE_URL を passThroughEnv に
 * 宣言していることを固定する。
 *
 * このテストが要る理由: `e2e/harness/target.ts` の resolveTarget には
 * 「ローカル実行なのに TASUKI_E2E_BASE_URL が残っていたら落とす」検査があり、
 * その単体テスト（tests/target.test.ts）は緑である。だが turbo 2.x の既定 env
 * モードは strict で、passThroughEnv を書かない限りこの変数はタスクへ届かない。
 * 関数の単体テストが緑でも、実経路（`pnpm e2e`）で入力そのものが届かなければ
 * 検査は発火せず、取り違え防止は死ぬ。実際にこれが起きた
 * （`TASUKI_E2E_BASE_URL=https://production.example.com corepack pnpm e2e` が
 * 13 件緑で通ってしまった）。turbo.json の宣言をここで固定し、同じ壊れ方の
 * 再発を防ぐ。
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * リポジトリルートを上方向に探す。
 * jsdom 環境では `import.meta.url` が file スキームにならず fileURLToPath が
 * 使えないため、実行時のカレントから遡って deploy と apps が揃う場所を見つける。
 */
function findRepoRoot(from: string): string {
  let dir = from;
  for (;;) {
    if (existsSync(path.join(dir, 'deploy')) && existsSync(path.join(dir, 'apps'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`リポジトリルートが見つからない（${from} から探索）`);
    dir = parent;
  }
}

interface TurboTask {
  readonly passThroughEnv?: readonly string[];
}

interface TurboJson {
  readonly tasks: Record<string, TurboTask>;
}

function readTurboJson(): TurboJson {
  const turboJsonPath = path.join(findRepoRoot(process.cwd()), 'turbo.json');
  return JSON.parse(readFileSync(turboJsonPath, 'utf8')) as TurboJson;
}

describe('turbo.json の TASUKI_E2E_BASE_URL passThroughEnv', () => {
  const turbo = readTurboJson();

  it('Given turbo.json / When e2e タスクを見る / Then TASUKI_E2E_BASE_URL が passThroughEnv に含まれる', () => {
    // Given: turbo.json の tasks.e2e
    const task = turbo.tasks['e2e'];
    // When / Then: passThroughEnv に含まれていないと、turbo strict モードで
    //              変数がタスクへ届かず、target.ts の取り違え検査が発火しない
    expect(task?.passThroughEnv ?? []).toContain('TASUKI_E2E_BASE_URL');
  });

  it('Given turbo.json / When e2e:prod タスクを見る / Then TASUKI_E2E_BASE_URL が passThroughEnv に含まれる', () => {
    // Given: turbo.json の tasks["e2e:prod"]
    const task = turbo.tasks['e2e:prod'];
    // When / Then: 無いと `pnpm e2e:prod` は必ず「本番実行には TASUKI_E2E_BASE_URL
    //              が必要です」で落ちる（変数そのものが届かないため）
    expect(task?.passThroughEnv ?? []).toContain('TASUKI_E2E_BASE_URL');
  });
});
