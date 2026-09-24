/**
 * timer と poker の `vite.config.ts` が、玄関へのリダイレクト（`@tasuki/dev-hub-redirect`）を
 * **両方とも配線しているか**を固定する（#95 S5c 追補・#249）。
 *
 * プラグイン本体の振る舞いは `packages/dev-hub-redirect/tests/hub-redirect.test.ts` が見る。
 * ここが見るのは配線だけで、**片方だけ直す事故**（このリポジトリが繰り返し踏んできた型）を
 * 拾うために 2 つの config を同じ表明に通す。
 *
 * **config を import せず、文字列として読む。** パッケージの外を相対パスで取り込むと
 * `scripts/audit-dependency-direction.mjs`（ADR-0017 決定 4）が落ちるためで、
 * 同じ理由で `apps/landing` から `apps/timer-web` の実体を読むこともできない —— 読むのは
 * ファイルの中身だけであり、依存にはならない（`caddy-fragment-port.test.ts` と同じ形）。
 *
 * 綴りだけを見る判定なので、これ自体は防波堤ではない。**実際に dev サーバーで
 * リダイレクトが効くか**は手で確かめる（`curl -D - http://localhost:5173/` の `Location`）。
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * リポジトリルートを上方向に探す。
 * jsdom 環境では `import.meta.url` が file スキームにならず fileURLToPath が使えないため、
 * 実行時のカレントから遡って deploy と apps が揃う場所を見つける。
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

const REPO_ROOT = findRepoRoot(process.cwd());

/** 玄関へ送り返す必要があるのは、玄関以外の dev サーバー（＝ツール側）である。 */
const TOOL_APPS = ['timer-web', 'poker-web', 'topic-web'];

describe.each(TOOL_APPS)('%s の vite.config.ts', (app) => {
  const source = readFileSync(path.join(REPO_ROOT, 'apps', app, 'vite.config.ts'), 'utf8');

  it('Given ツールの dev 設定 / When 読む / Then @tasuki/dev-hub-redirect から取り込んでいる', () => {
    // Given / When / Then: 相対パスでの取り込みは依存方向の検査が落とすので、
    // パッケージ名で書かれていることまで見る
    expect(source).toMatch(/from\s+['"]@tasuki\/dev-hub-redirect['"]/);
  });

  it('Given ツールの dev 設定 / When 読む / Then hubRedirectPlugin を plugins に積んでいる', () => {
    // Given / When / Then: import しただけで plugins に積み忘れると、
    // 型検査も lint も通るのに無限リロードだけが戻る
    expect(source).toMatch(/plugins:\s*\[[^\]]*hubRedirectPlugin\(\)/s);
  });
});

describe('玄関の vite.config.ts', () => {
  const source = readFileSync(path.join(REPO_ROOT, 'apps', 'landing', 'vite.config.ts'), 'utf8');

  it('Given 玄関の dev 設定 / When 読む / Then ポートを HUB_PORT から取る', () => {
    // Given / When / Then: 送り先（ツール側）と待受（玄関）が同じ値を別々に持つと、
    // 玄関のポートを変えたときに片方だけ古い値のまま残る
    expect(source).toMatch(/from\s+['"]@tasuki\/dev-hub-redirect['"]/);
    expect(source).toMatch(/port:\s*HUB_PORT/);
  });
});
