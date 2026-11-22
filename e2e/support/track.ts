/**
 * うちわけの共通手順と選択子（#476）。`support/agenda.ts` と同じ作り。
 *
 * **入口は玄関の札だけである**（`docs/adr/0018`）。ここが通らなくなったら、手順が古いのではなく
 * 入口が壊れている。
 */
import { expect, type Locator, type Page } from '@playwright/test';

/** 選択画面のツールの札（agenda などと同じ引き方）。 */
function toolCard(page: Page, name: string): Locator {
  return page.getByRole('list', { name: 'ツール' }).getByRole('link', { name: new RegExp(name) });
}

/** うちわけの画面が開いていること（公開パスと見出し。画面の見出しは日本語で、玄関の札の名前は Uchiwake）。 */
async function expectTrackOpen(page: Page): Promise<void> {
  await expect.poll(() => new URL(page.url()).pathname, { message: 'うちわけの公開パス' }).toBe('/track/');
  await expect(page.getByRole('heading', { level: 1, name: 'うちわけ', exact: true })).toBeVisible();
}

/** 玄関でルームを作ってうちわけを開き、**招待パネルが出している参加用 URL** を返す。 */
export async function openTrackTool(page: Page, name: string): Promise<string> {
  await page.goto('/');
  await page.getByLabel('あなたの名前').fill(name);
  await page.getByRole('button', { name: 'ルームを作る' }).click();
  const inviteUrl = await page.getByLabel('参加用 URL').inputValue();
  await toolCard(page, 'Uchiwake').click();
  await expectTrackOpen(page);
  return inviteUrl;
}

/**
 * 渡された参加用 URL を玄関で開いて名乗り、うちわけを開く。
 *
 * **呼び出し側は必ず別の `BrowserContext` の page を渡すこと**（同じ文脈だと 1 人目として復帰する）。
 */
export async function joinTrackTool(page: Page, url: string, name: string): Promise<void> {
  await page.goto(url);
  await page.getByLabel('あなたの名前').fill(name);
  await page.getByRole('button', { name: '参加する' }).click();
  await toolCard(page, 'Uchiwake').click();
  await expectTrackOpen(page);
}

/** 「いまやっていること」の区画。 */
export function nowPanel(page: Page): Locator {
  return page.getByRole('region', { name: 'いまやっていること' });
}

/** 「切り替える」の区画。 */
export function switchPanel(page: Page): Locator {
  return page.getByRole('region', { name: '切り替える' });
}

/** 「ここまでのうちわけ」の表の行（作業名で引く）。 */
export function totalsRow(page: Page, name: string): Locator {
  return page.getByRole('region', { name: 'ここまでのうちわけ' }).getByRole('row').filter({ hasText: name });
}

/** 「時系列」の区切りの行（並びの順）。 */
export function segments(page: Page): Locator {
  return page.getByRole('region', { name: '時系列' }).locator('.track-segment');
}

/** 作業名を入れて、開始または切り替える（入力欄の Enter ではなくボタンで送る）。 */
export async function startWork(page: Page, label: string): Promise<void> {
  const panel = switchPanel(page);
  // 完全一致で引く（候補の定番のボタンの読み上げ名は作業名を含むので、部分一致だとそちらにも当たりうる）
  await panel.getByLabel('作業名', { exact: true }).fill(label);
  await panel.getByRole('button', { name: /^(開始|切り替える)$/ }).click();
}

/** 候補のボタン（番号つき。作業名で引く）。 */
export function candidate(page: Page, label: string): Locator {
  return page.getByRole('list', { name: '候補' }).locator('.track-candidate-pick').filter({ hasText: label });
}
