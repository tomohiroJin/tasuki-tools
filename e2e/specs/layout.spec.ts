/**
 * 器の幅と段組み（#316 PR 1・設計正本 D1〜D3・E3・E4）。
 *
 * **タグを付けない（`local` 専用）。** 本番のルーム枠を消費して確かめる種類のものではない。
 *
 * 区画の位置は**区画どうしの相対位置**で見る（px の直値で見ると器の余白を変えるたびに壊れる）。
 * 押せる大きさ（44px）は PR 1 では合否にせず、件数を注釈に出すだけにする（設計正本 D9）。
 */
import type { Page, TestInfo } from '@playwright/test';
import { expect, test } from '../fixtures/test';
import { createRoom as createPokerRoom } from '../support/poker';
import { createRoom as createTimerRoom } from '../support/timer';
import { joinTopicTool, openTopicTool, setTopic } from '../support/topic';

const REM = 16;
const MAIN_MIN = 32 * REM;

interface Box { x: number; y: number; width: number; height: number }

async function boxOf(page: Page, selector: string): Promise<Box> {
  const box = await page.locator(selector).first().boundingBox();
  if (box === null) throw new Error(`${selector} が描かれていない（判定が空振りする）`);
  return box;
}

/** 器の外寸と、余白を除いた内側の幅・右端。 */
async function pageBox(page: Page): Promise<{ outer: number; inner: number; innerRight: number }> {
  return page.locator('main.ui-page').evaluate((el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      outer: r.width,
      inner: el.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight),
      innerRight: r.right - parseFloat(s.paddingRight),
    };
  });
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

/** 44px 未満の操作を注釈に出す（PR 1 では合否にしない）。 */
async function noteSmallTargets(page: Page, testInfo: TestInfo, label: string): Promise<void> {
  const small = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button, a[href], summary, [role="tab"]'))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44))
      .map(({ el, r }) => `${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)} ${Math.round(r.width)}x${Math.round(r.height)}`),
  );
  testInfo.annotations.push({ type: `44px 未満（${label}）`, description: `${small.length} 件: ${small.join(' / ')}` });
}

/** poker のルームにお題を掲げ、右脇（お題）まで描かれた状態にする。 */
async function openPokerWithTopic(page: Page, openPeer: (label: string) => Promise<{ page: Page }>): Promise<void> {
  const url = await createPokerRoom(page, 'layout-a');
  const topic = await openPeer('layout-topic');
  await joinTopicTool(topic.page, url, 'layout-t');
  await setTopic(topic.page, 'FizzBuzz', '3 のときは Fizz を出す');
  await expect(page.getByRole('region', { name: 'お題', exact: true })).toBeVisible();
}

test.describe('poker のルームは広い画面で 3 つの区画を並べる', () => {
  test('Given 幅 1920 / When ルームを開く / Then 器は 1536px で、左脇・主・右脇が横に並ぶ', async ({ page, openPeer }, testInfo) => {
    await page.setViewportSize({ width: 1920, height: 900 });
    await openPokerWithTopic(page, openPeer);
    expect((await pageBox(page)).outer).toBe(96 * REM);
    const rail = await boxOf(page, '.ui-workspace-rail');
    const main = await boxOf(page, '.ui-workspace-main');
    const aside = await boxOf(page, '.ui-workspace-aside');
    expect(rail.x + rail.width).toBeLessThanOrEqual(main.x);
    expect(main.x + main.width).toBeLessThanOrEqual(aside.x);
    expect(main.width).toBeGreaterThanOrEqual(MAIN_MIN);
    await noteSmallTargets(page, testInfo, 'poker 1920');
  });

  test('Given 幅 1280 / When ルームを開く / Then 器の内側は 1152px 以上で、左脇は右の列の上・右脇はその下', async ({ page, openPeer }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openPokerWithTopic(page, openPeer);
    expect((await pageBox(page)).inner).toBeGreaterThanOrEqual(72 * REM);
    const rail = await boxOf(page, '.ui-workspace-rail');
    const main = await boxOf(page, '.ui-workspace-main');
    const aside = await boxOf(page, '.ui-workspace-aside');
    expect(main.x + main.width).toBeLessThanOrEqual(rail.x);
    expect(rail.x).toBeCloseTo(aside.x, 0);
    expect(rail.y + rail.height).toBeLessThanOrEqual(aside.y);
    expect(main.width).toBeGreaterThanOrEqual(MAIN_MIN);
  });

  test('Given 幅 320 / When ルームを開く / Then 横に溢れず、左脇・主・右脇の順に縦へ積む', async ({ page, openPeer }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await openPokerWithTopic(page, openPeer);
    await expectNoHorizontalOverflow(page);
    const rail = await boxOf(page, '.ui-workspace-rail');
    const main = await boxOf(page, '.ui-workspace-main');
    const aside = await boxOf(page, '.ui-workspace-aside');
    expect(rail.y + rail.height).toBeLessThanOrEqual(main.y);
    expect(main.y + main.height).toBeLessThanOrEqual(aside.y);
    expect(main.x).toBeCloseTo(rail.x, 0);
    expect(aside.x).toBeCloseTo(rail.x, 0);
  });
});

test.describe('お題ツールの部屋は右脇を持たない', () => {
  test('Given 幅 1920 / When 部屋を開く / Then 左脇の右に主が並び、主の右端は器の内側の右端に揃う（空の列を残さない）', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1920, height: 900 });
    await openTopicTool(page, 'layout-topic-wide');
    const box = await pageBox(page);
    expect(box.outer).toBe(96 * REM);
    const rail = await boxOf(page, '.ui-workspace-rail');
    const main = await boxOf(page, '.ui-workspace-main');
    expect(rail.x + rail.width).toBeLessThanOrEqual(main.x);
    expect(main.x + main.width).toBeCloseTo(box.innerRight, 0);
    await noteSmallTargets(page, testInfo, 'お題ツール 1920');
  });

  test('Given 幅 1280 / When 部屋を開く / Then 主の右に左脇（いまのお題）が並ぶ', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openTopicTool(page, 'layout-topic-mid');
    const rail = await boxOf(page, '.ui-workspace-rail');
    const main = await boxOf(page, '.ui-workspace-main');
    expect(main.x + main.width).toBeLessThanOrEqual(rail.x);
    expect(main.width).toBeGreaterThanOrEqual(MAIN_MIN);
  });

  test('Given 幅 320 / When 部屋を開く / Then 横に溢れない', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await openTopicTool(page, 'layout-topic-narrow');
    await expectNoHorizontalOverflow(page);
  });
});

test.describe('玄関の器', () => {
  test('Given 幅 1280 / When 名乗る画面を開く / Then 器は 640px（読む・入力する）', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await expect(page.getByLabel('あなたの名前')).toBeVisible();
    expect((await pageBox(page)).outer).toBe(40 * REM);
    await noteSmallTargets(page, testInfo, '玄関 1280');
  });

  test('Given 幅 1280 / When ルームを作る / Then 道具選びの器は 1152px', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await page.getByLabel('あなたの名前').fill('layout-hub');
    await page.getByRole('button', { name: 'ルームを作る' }).click();
    await expect(page.getByRole('list', { name: 'ツール' })).toBeVisible();
    expect((await pageBox(page)).outer).toBe(72 * REM);
  });
});

test.describe('timer のセッションは右脇を持ち、左脇を持たない', () => {
  test('Given 幅 1280 / When セッションを始める / Then 右脇は主の右にあり、上端は主の上端に揃う（上に空きを作らない）', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await createTimerRoom(page, 'layout-timer');
    await page.getByRole('button', { name: 'セッションを開始' }).click();
    await expect(page.getByRole('timer')).toBeVisible();
    const main = await boxOf(page, '.ui-workspace-main');
    const aside = await boxOf(page, '.ui-workspace-aside');
    expect(main.x + main.width).toBeLessThanOrEqual(aside.x);
    expect(aside.y).toBeCloseTo(main.y, 0);
  });
});
