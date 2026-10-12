/**
 * 進行役ルーレットの共通手順と選択子（#94 PR 2）。
 *
 * **入口は玄関の札だけである**（`docs/adr/0018`）。ここが通らなくなったら、手順が古いのではなく
 * 入口が壊れている。
 */
import { expect, type Locator, type Page } from '@playwright/test';

/** 選択画面のツールの札（poker・timer・お題の支援と同じ引き方）。 */
function toolCard(page: Page, name: string): Locator {
  return page.getByRole('list', { name: 'ツール' }).getByRole('link', { name: new RegExp(name) });
}

/** ルーレットの画面が開いていること（公開パスと見出し）。 */
async function expectRouletteOpen(page: Page): Promise<void> {
  await expect.poll(() => new URL(page.url()).pathname, { message: 'ルーレットの公開パス' }).toBe('/roulette/');
  await expect(page.getByRole('heading', { level: 1, name: '進行役ルーレット', exact: true })).toBeVisible();
}

/** 玄関でルームを作ってルーレットを開き、**招待パネルが出している参加用 URL** を返す。 */
export async function openRouletteTool(page: Page, name: string): Promise<string> {
  await page.goto('/');
  await page.getByLabel('あなたの名前').fill(name);
  await page.getByRole('button', { name: 'ルームを作る' }).click();
  const inviteUrl = await page.getByLabel('参加用 URL').inputValue();
  await toolCard(page, 'Facilitator Roulette').click();
  await expectRouletteOpen(page);
  return inviteUrl;
}

/**
 * 渡された参加用 URL を玄関で開いて名乗り、ルーレットを開く。
 *
 * **呼び出し側は必ず別の `BrowserContext` の page を渡すこと**（同じ文脈だと 1 人目として復帰する）。
 */
export async function joinRouletteTool(page: Page, url: string, name: string): Promise<void> {
  await page.goto(url);
  await page.getByLabel('あなたの名前').fill(name);
  await page.getByRole('button', { name: '参加する' }).click();
  await toolCard(page, 'Facilitator Roulette').click();
  await expectRouletteOpen(page);
}

/** 結果の一言（`role="status"`）。この画面に 1 つだけ。 */
export function roulettePhrase(page: Page): Locator {
  return page.getByRole('status');
}

/** 主ボタン（回す前・回しているとき・回し終えたあとで文言が変わる）。 */
export function spinButton(page: Page): Locator {
  return page.getByRole('button', { name: /^(ルーレットを回す|回しています…|もう一度回す)$/ });
}
