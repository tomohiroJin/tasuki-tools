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

/**
 * 渡された参加用 URL を玄関で開いて名乗り、お題ツールを開く（#91 PR 3）。
 *
 * **呼び出し側は必ず別の `BrowserContext` の page を渡すこと**（同じ文脈だと 1 人目として復帰する）。
 * timer・poker の画面を測る前に、同じルームでお題を掲げるために使う。
 */
export async function joinTopicTool(page: Page, url: string, name: string): Promise<void> {
  await page.goto(url);
  await page.getByLabel('あなたの名前').fill(name);
  await page.getByRole('button', { name: '参加する' }).click();
  await toolCard(page, 'Topic Board').click();
  await expect(page.getByRole('heading', { level: 1, name: 'お題', exact: true })).toBeVisible();
}

/** お題ツールの読む面の領域（名前は「お題」。タブ「場のお題」「下書き」のどちらでも同じ・#316）。 */
export function currentTopic(page: Page): Locator {
  return page.getByRole('region', { name: 'お題', exact: true });
}

/** 手で書いてお題にし、**自分の画面に出るまで待つ**。 */
export async function setTopic(page: Page, title: string, body: string): Promise<void> {
  await page.getByLabel('タイトル').fill(title);
  await page.getByLabel('説明（なくてもよい）').fill(body);
  await page.getByRole('button', { name: '場に出す' }).click();
  await expect(currentTopic(page).getByRole('heading', { name: title })).toBeVisible();
}

/** 64rem 未満で切られる本文の先（4 段落目）に置くリンク。Tab が止まるかどうかを見る（#316 PR 4）。 */
export const AFTER_LINK_HREF = 'https://example.com/after';
export const AFTER_LINK_NAME = '先のリンク';
/** 段落を 6 つ置き、4 段落目にリンクを入れる本文（3 行で切れば、リンクは切った先に来る）。 */
export const LINKED_BODY = [
  '1 段落目です。',
  '2 段落目です。',
  '3 段落目です。',
  `4 段落目です。[${AFTER_LINK_NAME}](${AFTER_LINK_HREF})`,
  '5 段落目です。',
  '6 段落目です。',
].join('\n\n');

/**
 * 狭い幅（64rem 未満）の読む面: 切った本文の中のリンクに Tab が止まらず、「続きを読む」には止まり、
 * シートの中のリンクには止まる。`card` は読む面の領域（名前は「お題」）。見出しをクリックして Tab の起点にする。
 * 空振りを避けるため、(1) リンクが写しの中に在ること (2) 「続きを読む」に着くこと (3) 着くまでに最大 40 回 を見る。
 */
export async function expectNarrowTabSkipsPreviewLink(page: Page, card: Locator): Promise<void> {
  await expect(card.locator(`.ui-reader-preview a[href="${AFTER_LINK_HREF}"]`), '写しの中にリンクが無い（判定が空振りする）').toHaveCount(1);
  // 見出しを Tab の起点にする（クリックは別の要素に遮られる画面がある）。見出しの次の要素から Tab を押し始める
  await card.getByRole('heading', { level: 2 }).evaluate((el) => {
    el.setAttribute('tabindex', '-1');
    el.focus();
  });
  let reachedMore = false;
  for (let i = 0; i < 40 && !reachedMore; i += 1) {
    await page.keyboard.press('Tab');
    const now = await page.evaluate(() => {
      const el = document.activeElement;
      return { href: el?.getAttribute('href') ?? null, text: el?.textContent?.trim() ?? '' };
    });
    expect(now.href, `切った本文の中のリンクに Tab が止まった（${i + 1} 回目）`).not.toBe(AFTER_LINK_HREF);
    reachedMore = now.text === '続きを読む';
  }
  expect(reachedMore, '40 回 Tab を押しても「続きを読む」に着かない').toBe(true);
  // シートを開くと、中のリンクには Tab で着く
  await page.keyboard.press('Enter');
  const sheet = page.locator('dialog.ui-drawer[open]');
  await expect(sheet).toBeVisible();
  const link = sheet.getByRole('link', { name: AFTER_LINK_NAME });
  let reachedLink = false;
  for (let i = 0; i < 10 && !reachedLink; i += 1) {
    await page.keyboard.press('Tab');
    reachedLink = await link.evaluate((el) => el === document.activeElement);
  }
  expect(reachedLink, 'シートの中のリンクに Tab で着かない').toBe(true);
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
}

/** 広い幅（64rem 以上）: 本文の領域から Tab で、本文の中のリンクに着く。`body` は本文の領域（`.ui-reader-body`）。 */
export async function expectWideTabReachesBodyLink(body: Locator): Promise<void> {
  await body.focus();
  await body.page().keyboard.press('Tab');
  await expect(body.locator(`a[href="${AFTER_LINK_HREF}"]`)).toBeFocused();
}
