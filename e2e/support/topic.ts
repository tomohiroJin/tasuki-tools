/**
 * お題ツールの共通手順と選択子（#91 PR 2）。
 *
 * **入口は玄関の札だけである**（`docs/adr/0018`）。ここが通らなくなったら、手順が古いのではなく
 * 入口が壊れている。
 */
import { expect, type Locator, type Page } from '@playwright/test';

/** 選択画面のツールの札（poker・timer の支援と同じ引き方）。 */
function toolCard(page: Page, name: string): Locator {
  return page.getByRole('list', { name: 'ツール' }).getByRole('link', { name: new RegExp(name) });
}

/** 玄関でルームを作ってお題ツールを開き、**招待パネルが出している参加用 URL** を返す。 */
export async function openTopicTool(page: Page, name: string): Promise<string> {
  await page.goto('/');
  await page.getByLabel('あなたの名前').fill(name);
  await page.getByRole('button', { name: 'ルームを作る' }).click();
  const inviteUrl = await page.getByLabel('参加用 URL').inputValue();
  await toolCard(page, 'Topic Board').click();
  await expect(page.getByRole('heading', { level: 1, name: 'お題', exact: true })).toBeVisible();
  return inviteUrl;
}

/** いまのお題の領域。 */
export function currentTopic(page: Page): Locator {
  return page.getByRole('region', { name: 'いまのお題' });
}

/** 手で書いてお題にし、**自分の画面に出るまで待つ**。 */
export async function setTopic(page: Page, title: string, body: string): Promise<void> {
  await page.getByLabel('タイトル').fill(title);
  await page.getByLabel('説明（なくてもよい）').fill(body);
  await page.getByRole('button', { name: 'このお題にする' }).click();
  await expect(currentTopic(page).getByRole('heading', { name: title })).toBeVisible();
}
