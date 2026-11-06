/**
 * axe の試し（#562 やること 2。**マージしない試しのブランチ専用**）。
 * 調査の記録 8.2 の測定に使った写し。使うときは使い捨てのブランチの e2e/specs/ へ置き、e2e-repeat.yml に axe-core を入れる段
 * （`npm install --prefix "$RUNNER_TEMP/axe" axe-core@4.10.2` と `AXE_CORE_PATH` を `$GITHUB_ENV` へ）と turbo.json の passThroughEnv を足す。
 *
 * 測るだけで、違反があっても落とさない。axe-core は依存に足さず、ワークフローが作業ツリーの外へ入れ、
 * そのパスを `AXE_CORE_PATH`（axe.min.js への絶対パス）で受ける。無ければ skip。
 * 結果は 1 画面 1 行の JSON を `AXE_TRIAL ` 付きで console.log に出す（ジョブのログから読む）。
 */
import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures/test';

const AXE_PATH = process.env['AXE_CORE_PATH'];
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

interface AxeViolation {
  id: string;
  impact: string | null;
  helpUrl: string;
  help: string;
  nodes: unknown[];
}
interface AxeResult {
  violations: AxeViolation[];
  passes: unknown[];
  incomplete: unknown[];
}

async function measure(page: Page, screen: string): Promise<void> {
  if (AXE_PATH === undefined) throw new Error('AXE_CORE_PATH が無い');
  await page.waitForLoadState('networkidle');
  await page.addScriptTag({ path: AXE_PATH });
  const out = await page.evaluate(async (tags) => {
    const axe = (window as unknown as { axe: { run: (c: Document, o: unknown) => Promise<AxeResult> } }).axe;
    const t0 = performance.now();
    const r = await axe.run(document, { runOnly: tags });
    return { ms: Math.round(performance.now() - t0), r };
  }, TAGS);
  const line = {
    screen,
    url: new URL(page.url()).pathname,
    ms: out.ms,
    violationRules: out.r.violations.length,
    violationNodes: out.r.violations.reduce((n, v) => n + v.nodes.length, 0),
    incomplete: out.r.incomplete.length,
    passes: out.r.passes.length,
    violations: out.r.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.length,
      help: v.help,
      helpUrl: v.helpUrl,
    })),
  };
  console.log(`AXE_TRIAL ${JSON.stringify(line)}`);
}

test.describe('axe の試し（測るだけ・違反で落とさない）', () => {
  // 理由: AXE_CORE_PATH は試しのワークフロー（axe-core を入れる段を足したもの）だけが渡す。ほかの実行では測れない
  test.skip(AXE_PATH === undefined, 'AXE_CORE_PATH が無い');
  // アプリの CSP（script-src 'self'）が addScriptTag の inline を止めるので、この試しの文脈だけ外す。
  // 測る対象は DOM とスタイルで、CSP は axe の WCAG 規則の判定に入らない。
  test.use({ bypassCSP: true });

  test('玄関・選択画面・各ツールのルームに axe をかける', async ({ page }) => {
    test.setTimeout(180_000);

    await page.goto('/');
    await expect(page.getByRole('button', { name: 'ルームを作る' })).toBeVisible();
    await measure(page, 'landing-hub-before-room');

    await page.getByLabel('ルーム名').fill('axe の試し');
    await page.getByLabel('あなたの名前').fill('あや');
    await page.getByRole('button', { name: 'ルームを作る' }).click();
    const invite = page.getByLabel('参加用 URL');
    await expect(invite).toBeVisible();
    const inviteUrl = await invite.inputValue();
    await measure(page, 'landing-tool-select');

    const tools = [
      { screen: 'timer', card: 'TDD Mob Pro Timer', landmark: 'セッションを開始' },
      { screen: 'poker', card: 'Planning Poker', landmark: '票を公開する' },
      { screen: 'topic', card: 'Topic Board', landmark: '場に出す' },
      { screen: 'roulette', card: 'Facilitator Roulette', landmark: /^(ルーレットを回す|回しています…|もう一度回す)$/ },
      { screen: 'agenda', card: 'Agenda Timer', landmark: /サンプルから選ぶ/ },
      { screen: 'checkin', card: 'Check-in Cards', landmark: 'ランダム' },
    ] as const;

    for (const tool of tools) {
      await page.goto(inviteUrl);
      await page
        .getByRole('list', { name: 'ツール' })
        .getByRole('link', { name: new RegExp(tool.card) })
        .click();
      await expect(page.getByRole('button', { name: tool.landmark })).toBeVisible();
      await measure(page, tool.screen);
    }
  });
});
