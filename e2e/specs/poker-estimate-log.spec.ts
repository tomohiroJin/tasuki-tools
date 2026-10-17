/**
 * poker の見積もりの記録（#93）。
 *
 * **タグを付けない（`local` 専用）。** 見るのは画面の積まれ方で、本番の煙には要らない。
 * 記録は 64rem 以上では脇（`.room-log--side`）に出る。2 つの画面はどちらも 1280 で開く。
 */
import { expect, test } from '../fixtures/test';
import type { Locator, Page } from '@playwright/test';
import { chooseCard, createRoom, joinRoom, resultsSection } from '../support/poker';

const HOST = 'log-a';
const GUEST = 'log-b';
const ITEM = 'PROJ-120';

/** 脇の記録（束の並びは新しい順）。 */
function sideLog(page: Page): Locator {
  return page.locator('.room-log--side');
}

function groups(page: Page): Locator {
  return sideLog(page).locator('.estimate-group');
}

/** 「いま見積もっているもの」を入れ直す（題名のボタン → 入力 → Enter）。 */
async function setItem(page: Page, item: string): Promise<void> {
  await page.locator('.estimate-item-title').click();
  const input = page.getByRole('textbox', { name: 'いま見積もっているもの' });
  await input.fill(item);
  await input.press('Enter');
  await expect(page.locator('.estimate-item-title')).toHaveText(item);
}

/** 2 人が同じ札を選び、結果が出るまで待つ。 */
async function bothVote(a: Page, b: Page, cardA: string, cardB: string): Promise<void> {
  await chooseCard(a, cardA);
  await chooseCard(b, cardB);
  await expect(resultsSection(a)).toBeVisible();
  await expect(resultsSection(b)).toBeVisible();
}

async function openTwo(
  page: Page,
  openPeer: (label: string) => Promise<{ page: Page }>,
  label: string,
): Promise<Page> {
  await page.setViewportSize({ width: 1280, height: 900 });
  const roomUrl = await createRoom(page, HOST);
  const guest = await openPeer(label);
  await guest.page.setViewportSize({ width: 1280, height: 900 });
  await joinRoom(guest.page, roomUrl, GUEST);
  await expect(page.getByRole('heading', { name: '参加者（2人）' })).toBeVisible();
  await expect(guest.page.getByRole('heading', { name: '参加者（2人）' })).toBeVisible();
  return guest.page;
}

test.describe('poker は見積もりを記録に残す', () => {
  test('Given 2 人のルーム / When アイテム名を入れ、割れて再投票し、そろって 5 で次のアイテムへ、名前なしでもう 1 件開票する / Then 両方の画面の記録に、新しい順で（名前なし）（見積もり中）と PROJ-120（5・2 回めと 1 回め）が出る', async ({ page, openPeer }) => {
    const guest = await openTwo(page, openPeer, 'log-guest-1');

    // 前: 記録はまだ空
    await expect(sideLog(page).getByText('開票すると、ここに残ります')).toBeVisible();

    // When: アイテム名（片方が入れると両方に出る）→ 割れる → 再投票 → そろう → 次のアイテムへ（点数 5）
    await setItem(page, ITEM);
    await expect(guest.locator('.estimate-item-title')).toHaveText(ITEM);
    await bothVote(page, guest, '5', '8');
    await guest.getByRole('button', { name: '再投票' }).click();
    await expect(resultsSection(page)).toHaveCount(0);
    await bothVote(page, guest, '5', '5');
    await guest.getByRole('combobox', { name: 'ポイント（任意）' }).selectOption('5');
    await guest.getByRole('button', { name: '次のアイテムへ' }).click();
    await expect(resultsSection(page)).toHaveCount(0);
    await expect(page.locator('.estimate-item-title')).toHaveText('（名前なし）');

    // When: 名前なしのままもう 1 件開票する（そろって 3）
    await bothVote(page, guest, '3', '3');

    // Then: どちらの画面も、新しい束が上で、同じ中身
    for (const [label, target] of [['作成者', page], ['参加者', guest]] as const) {
      const gs = groups(target);
      await expect(gs, `${label}の画面: 束は 2 つ`).toHaveCount(2);
      const newest = gs.nth(0);
      await expect(newest.locator('.estimate-group-item'), `${label}: 上は名前なし`).toHaveText('（名前なし）');
      await expect(newest.getByText('見積もり中', { exact: true }), `${label}: 上は見積もり中`).toBeVisible();
      await expect(newest.locator('.estimate-entry'), `${label}: 名前なしの束は 1 回`).toHaveCount(1);
      await expect(newest.locator('.estimate-entry').first()).toContainText('1 回め');
      await expect(newest.locator('.estimate-entry').first()).toContainText('3×2');

      const older = gs.nth(1);
      await expect(older.locator('.estimate-group-item'), `${label}: 下は ${ITEM}`).toHaveText(ITEM);
      await expect(older.getByRole('combobox', { name: 'ポイントを変える' }), `${label}: 点数は 5`).toHaveValue('5');
      const entries = older.locator('.estimate-entry');
      await expect(entries, `${label}: ${ITEM} は 2 回`).toHaveCount(2);
      await expect(entries.nth(0), `${label}: 新しい回が上`).toContainText('2 回め');
      await expect(entries.nth(0)).toContainText('5×2');
      await expect(entries.nth(1)).toContainText('1 回め');
      await expect(entries.nth(1)).toContainText('5×1');
      await expect(entries.nth(1)).toContainText('8×1');
    }
  });

  test('Given 閉じた束 / When 2 人目が記録の欄でポイントを 8 に変える / Then 1 人目の画面も 8 になる', async ({ page, openPeer }) => {
    const guest = await openTwo(page, openPeer, 'log-guest-2');
    await setItem(page, ITEM);
    await bothVote(page, guest, '5', '5');
    await page.getByRole('button', { name: '次のアイテムへ' }).click();
    await expect(resultsSection(guest)).toHaveCount(0);

    const hostSelect = groups(page).first().getByRole('combobox', { name: 'ポイントを変える' });
    const guestSelect = groups(guest).first().getByRole('combobox', { name: 'ポイントを変える' });
    await expect(hostSelect, '最初はポイントなし').toHaveValue('');

    await guestSelect.selectOption('8');
    await expect(hostSelect, '1 人目の画面にも 8 が届く').toHaveValue('8');
    await expect(guestSelect).toHaveValue('8');

    // 空へ戻すこともできる
    await guestSelect.selectOption('');
    await expect(hostSelect).toHaveValue('');
  });

  test('Given 記録が 1 件ある / When 3 人目が後から入る / Then 同じ記録が見える', async ({ page, openPeer }) => {
    const guest = await openTwo(page, openPeer, 'log-guest-3');
    await setItem(page, ITEM);
    await bothVote(page, guest, '5', '8');
    const roomUrl = await page.locator('.ui-invite-url').first().innerText();

    const late = await openPeer('log-late');
    await late.page.setViewportSize({ width: 1280, height: 900 });
    await joinRoom(late.page, roomUrl, 'log-c');
    const group = groups(late.page);
    await expect(group, '後から入っても束が見える').toHaveCount(1);
    await expect(group.first().locator('.estimate-group-item')).toHaveText(ITEM);
    await expect(group.first().getByText('見積もり中', { exact: true })).toBeVisible();
    await expect(group.first().locator('.estimate-entry').first()).toContainText('1 回め');
    await expect(group.first().locator('.estimate-entry').first()).toContainText('5×1');
    await expect(group.first().locator('.estimate-entry').first()).toContainText('8×1');
  });

  test('Given 幅 390 / When 1 件開票する / Then 記録は手札・結果より下の足に出る', async ({ page, openPeer }) => {
    const guest = await openTwo(page, openPeer, 'log-guest-4');
    await page.setViewportSize({ width: 390, height: 844 });
    await setItem(page, ITEM);
    await bothVote(page, guest, '5', '8');
    await expect(sideLog(page)).toBeHidden();
    const foot = page.locator('.room-log--foot');
    await expect(foot.locator('.estimate-group')).toHaveCount(1);
    const results = await resultsSection(page).boundingBox();
    const box = await foot.boundingBox();
    expect(results).not.toBeNull();
    expect(box).not.toBeNull();
    expect(box!.y, '足の記録が結果より下にある').toBeGreaterThanOrEqual(results!.y + results!.height - 1);
  });
});
