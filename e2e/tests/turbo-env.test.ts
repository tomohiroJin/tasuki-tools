/**
 * turbo.json の `e2e` / `e2e:prod` が、実経路で要る環境変数を passThroughEnv に
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

describe('turbo.json の PLAYWRIGHT_BROWSERS_PATH passThroughEnv', () => {
  /**
   * 同じ壊れ方の 2 例目。devcontainer は導入済みのブラウザを
   * `/opt/playwright-browsers` から使うが、この変数が届かないと Playwright は
   * `~/.cache/ms-playwright` を探して「実行ファイルが無い」で落ちる。
   *
   * **しかも起動前の検査は素通りする。** `harness/browsers.ts` の
   * `assertChromiumInstalled` は変数が未設定なら何もしない設計（CI では Playwright が
   * 自分でブラウザを入れるため、そちらが正しい）。第 1 段はブラウザを 1 つも
   * 起動しなかったのでこの穴は見えず、第 2 段で `@core` を足して初めて落ちた。
   */
  const turbo = readTurboJson();

  for (const taskName of ['e2e', 'e2e:prod'] as const) {
    it(`Given turbo.json / When ${taskName} タスクを見る / Then PLAYWRIGHT_BROWSERS_PATH が passThroughEnv に含まれる`, () => {
      // Given / When
      const task = turbo.tasks[taskName];
      // Then
      expect(task?.passThroughEnv ?? []).toContain('PLAYWRIGHT_BROWSERS_PATH');
    });
  }
});

describe('turbo.json の WAYLAND_DISPLAY passThroughEnv', () => {
  /**
   * 同じ壊れ方の 3 例目（2026-08-08・第 3 段）。
   *
   * WSLg 上の devcontainer では、この変数が Chromium へ届かないと
   * `click` が「visible, enabled and stable」を待ち続け、**ブラウザを使う
   * 7 件が軒並み 60 秒の timeout で落ちる**。
   *
   * **見つけにくい形で現れる。** `playwright test` を直接叩くと通るのに
   * `pnpm e2e`（turbo 経由）だけが落ちるため、テストの書き方や並列度の問題に
   * 見える。実測では並列度は無関係で、**この 1 変数を足すか外すかだけで
   * 21 件緑と 7 件失敗が反転した**（両方向で確認）。
   *
   * CI にはこの変数が存在せず、そこでは元から緑なので、渡しても影響しない。
   */
  const turbo = readTurboJson();

  for (const taskName of ['e2e', 'e2e:prod'] as const) {
    it(`Given turbo.json / When ${taskName} タスクを見る / Then WAYLAND_DISPLAY が passThroughEnv に含まれる`, () => {
      // Given / When
      const task = turbo.tasks[taskName];
      // Then
      expect(task?.passThroughEnv ?? []).toContain('WAYLAND_DISPLAY');
    });
  }
});
