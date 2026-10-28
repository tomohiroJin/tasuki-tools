/**
 * Check-in Cards の共通手順と選択子（#406 Task 4.3）。`support/agenda.ts` と同じ作り。
 *
 * **入口は玄関の札だけである**（`docs/adr/0018`）。ここが通らなくなったら、手順が古いのではなく
 * 入口が壊れている。
 */
import { expect, type Locator, type Page } from '@playwright/test';

/** 選択画面のツールの札（agenda などと同じ引き方）。 */
function toolCard(page: Page, name: string): Locator {
  return page.getByRole('list', { name: 'ツール' }).getByRole('link', { name: new RegExp(name) });
}

/** Check-in Cards の画面が開いていること（公開パスと見出し）。 */
async function expectCheckinOpen(page: Page): Promise<void> {
  await expect.poll(() => new URL(page.url()).pathname, { message: 'Check-in Cards の公開パス' }).toBe('/checkin/');
  await expect(page.getByRole('heading', { level: 1, name: 'Check-in Cards', exact: true })).toBeVisible();
}

/** 玄関でルームを作って Check-in Cards を開き、**招待パネルが出している参加用 URL** を返す。 */
export async function openCheckinTool(page: Page, name: string): Promise<string> {
  await page.goto('/');
  await page.getByLabel('あなたの名前').fill(name);
  await page.getByRole('button', { name: 'ルームを作る' }).click();
  const inviteUrl = await page.getByLabel('参加用 URL').inputValue();
  await toolCard(page, 'Check-in Cards').click();
  await expectCheckinOpen(page);
  return inviteUrl;
}

/**
 * 渡された参加用 URL を玄関で開いて名乗り、Check-in Cards を開く。
 *
 * **呼び出し側は必ず別の `BrowserContext` の page を渡すこと**（同じ文脈だと 1 人目として復帰する）。
 */
export async function joinCheckinTool(page: Page, url: string, name: string): Promise<void> {
  await page.goto(url);
  await page.getByLabel('あなたの名前').fill(name);
  await page.getByRole('button', { name: '参加する' }).click();
  await toolCard(page, 'Check-in Cards').click();
  await expectCheckinOpen(page);
}

/** 選択画面（玄関の道具選び）から Check-in Cards の札を開く。**同じルームのまま**別のツールから移るときに使う。 */
export async function openCheckinFromHub(page: Page): Promise<void> {
  await toolCard(page, 'Check-in Cards').click();
  await expectCheckinOpen(page);
}

/** やり方の選択（側の切り替え → やり方の名前）。選択画面が出ているときに使う。 */
export async function chooseMethod(page: Page, side: 'チェックイン' | 'チェックアウト', title: string): Promise<void> {
  await page.getByRole('group', { name: 'やり方を選んでください' }).getByRole('button', { name: side, exact: true }).click();
  await page.getByRole('button', { name: title, exact: true }).click();
}

/** 手札の札（読み上げ名は札の名前）。 */
export function handCard(page: Page, name: string): Locator {
  return page.getByRole('group', { name: 'あなたの札' }).getByRole('button', { name, exact: true });
}

/** 開いた後の山のうち、札の名前が `name` のもの。 */
export function pile(page: Page, name: string): Locator {
  return page.locator('.pile').filter({ has: page.locator('.pile-name', { hasText: new RegExp(`^${name}$`) }) });
}

/** 公開の仕方の切り替えのボタン。 */
export function visibilityButton(page: Page, label: '名前つき' | '匿名'): Locator {
  return page.getByRole('group', { name: '公開の仕方' }).getByRole('button', { name: label, exact: true });
}
