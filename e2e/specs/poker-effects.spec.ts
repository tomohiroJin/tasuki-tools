/**
 * poker の開票の演出（#639）。全員同じ・全員バラバラ・全員出そろい。
 *
 * **タグを付けない（`local` 専用）。** 2〜3 つのブラウザ文脈を使う画面の確認で、本番の煙には要らない。
 *
 * 見るもの:
 * - 3 つの演出が、居合わせた全員の画面で同じときに出る（帯は結果の節の `role="status"` 1 つ）
 * - 演出の最中でも再投票・次のアイテムの操作が通る。同じアイテムの再投票でも毎回出る
 * - 1 回の演出は 2 秒以内に終わる（動きが終わる）。帯は統計に重ならない（320・1280px）
 * - 動きを減らす設定では動かず、色と文言（終わりの姿）だけが出る
 * - ? が混ざれば「全員同じ」にならない
 *
 * 文言は書体の常用の層に収めたもの（「致」は無いので「全員同じ」）。
 */
import { expect, test } from '../fixtures/test';
import type { Locator, Page } from '@playwright/test';
import { chooseCard, createRoom, joinRoom, resultsSection } from '../support/poker';

const UNANIMOUS = '全員同じ';
const SCATTERED = '全員バラバラ';
const COMPLETE = '全員出そろいました';

/** 結果の節の演出の帯（読み上げの知らせ 1 つ）。 */
const band = (page: Page, text: string): Locator => resultsSection(page).getByRole('status').filter({ hasText: text });

/** 参加者を 1 人ずつ別の文脈で入れる。先頭は作成者。 */
async function openRoom(
  page: Page,
  openPeer: (label: string) => Promise<{ page: Page }>,
  tag: string,
  count: number,
): Promise<Page[]> {
  const pages = [page];
  const roomUrl = await createRoom(page, `${tag}-0`);
  for (let i = 1; i < count; i += 1) {
    const peer = (await openPeer(`${tag}-${i}`)).page;
    await joinRoom(peer, roomUrl, `${tag}-${i}`);
    pages.push(peer);
  }
  for (const p of pages) {
    await expect(p.getByRole('heading', { name: `参加者（${count}人）` })).toBeVisible();
  }
  return pages;
}

/** 全員が札を出す。出し終えると自動で開票される（FR-008）。 */
async function everyoneVotes(pages: readonly Page[], cards: readonly string[]): Promise<void> {
  for (const [i, p] of pages.entries()) await chooseCard(p, cards[i]!);
}

test.describe('poker の開票の演出（#639）', () => {
  test('Given 2 人 / When 同じ札を出す / Then 両方の画面に「全員同じ」の帯が出て、統計に重ならない', async ({ page, openPeer }) => {
    const pages = await openRoom(page, openPeer, 'fx-a', 2);
    await everyoneVotes(pages, ['5', '5']);
    for (const p of pages) {
      await expect(band(p, UNANIMOUS)).toBeVisible();
      await expect(band(p, SCATTERED)).toHaveCount(0);
    }
    // 帯は結果の節の中で、統計（平均・最頻値）の上に置かれる（重ならない）。320・1280px の両方で
    for (const width of [320, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const bandBox = await band(page, UNANIMOUS).boundingBox();
      const statsBox = await resultsSection(page).locator('.stats').boundingBox();
      expect(bandBox, `帯が描かれている（${width}px）`).not.toBeNull();
      expect(statsBox, `統計が描かれている（${width}px）`).not.toBeNull();
      expect(bandBox!.y + bandBox!.height, `帯は統計の上で終わる（${width}px）`).toBeLessThanOrEqual(statsBox!.y + 1);
      // 横にはみ出して画面を広げない
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `横スクロールが出ない（${width}px）`).toBeLessThanOrEqual(0);
    }
  });

  test('Given 3 人 / When 互いに違う札を出す / Then 全員の画面に「全員バラバラ」の帯が出る', async ({ page, openPeer }) => {
    const pages = await openRoom(page, openPeer, 'fx-b', 3);
    await everyoneVotes(pages, ['1', '5', '13']);
    for (const p of pages) {
      await expect(band(p, SCATTERED)).toBeVisible();
      await expect(band(p, UNANIMOUS)).toHaveCount(0);
    }
  });

  test('Given 2 人 / When 違う札（隣同士）を出して全員が出し終える / Then 全員の画面に「全員出そろいました」の帯が出る', async ({ page, openPeer }) => {
    const pages = await openRoom(page, openPeer, 'fx-c', 2);
    await everyoneVotes(pages, ['5', '8']);
    for (const p of pages) {
      await expect(band(p, COMPLETE)).toBeVisible();
      await expect(band(p, UNANIMOUS)).toHaveCount(0);
      await expect(band(p, SCATTERED)).toHaveCount(0);
    }
  });

  test('Given 3 人のうち 2 人が同じ数字・1 人が ? / When 開票 / Then 「全員同じ」にならない', async ({ page, openPeer }) => {
    const pages = await openRoom(page, openPeer, 'fx-d', 3);
    await everyoneVotes(pages, ['5', '5', '?']);
    for (const p of pages) {
      await expect(resultsSection(p)).toBeVisible();
      await expect(band(p, UNANIMOUS)).toHaveCount(0);
      await expect(band(p, SCATTERED)).toHaveCount(0);
    }
  });

  test('Given 演出の最中 / When 再投票・次のアイテムを押す / Then 操作は通り、同じ票でも次の開票で帯がまた出る', async ({ page, openPeer }) => {
    const pages = await openRoom(page, openPeer, 'fx-e', 2);
    const other = pages[1]!;
    await everyoneVotes(pages, ['3', '3']);
    // 演出の最中に押す: 開票の直後（帯の動きが終わる 1.75 秒より前）に、帯の出現を待たずに押す（帯は操作を奪わない）
    const clickedAt = Date.now();
    await page.getByRole('button', { name: '再投票' }).click();
    expect(Date.now() - clickedAt, '押せるまでが動きの終わりより前').toBeLessThan(1750);
    for (const p of pages) await expect(p.getByRole('heading', { name: 'あなたのカード' })).toBeVisible();
    await expect(band(page, UNANIMOUS)).toHaveCount(0);
    // 同じアイテム・同じ票でも毎回出る
    await everyoneVotes(pages, ['3', '3']);
    for (const p of pages) await expect(band(p, UNANIMOUS)).toBeVisible();
    // 次のアイテムへ（演出の最中。もう一方の画面から）
    await other.getByRole('button', { name: '次のアイテムへ' }).click();
    for (const p of pages) await expect(p.getByRole('heading', { name: 'あなたのカード' })).toBeVisible();
    await expect(band(other, UNANIMOUS)).toHaveCount(0);
  });

  test('Given 演出 / When 2 秒ほど待つ / Then 動きは終わり、帯の文言は残る（レイアウトが跳ねない）', async ({ page, openPeer }) => {
    const pages = await openRoom(page, openPeer, 'fx-f', 2);
    await everyoneVotes(pages, ['8', '8']);
    const el = band(page, UNANIMOUS);
    await expect(el).toBeVisible();
    // 帯の動き（遅れ 0.25s + 1.5s）は 2 秒以内に終わる
    await expect
      .poll(() => el.evaluate((node) => node.getAnimations().every((a) => a.playState === 'finished')), { timeout: 2500 })
      .toBe(true);
    await expect(el).toBeVisible();
    await expect(el).toHaveCSS('opacity', '1');
  });

  test('Given 動きを減らす設定 / When 全員が同じ札を出す / Then 帯は動かず、文言と色だけで同じことを伝える', async ({ page, openPeer }) => {
    const pages = await openRoom(page, openPeer, 'fx-g', 2);
    for (const p of pages) await p.emulateMedia({ reducedMotion: 'reduce' });
    await everyoneVotes(pages, ['2', '2']);
    for (const p of pages) {
      const el = band(p, UNANIMOUS);
      await expect(el).toBeVisible();
      await expect(el).toHaveCSS('opacity', '1');
      // 動きは長さ 0（要素層の一括の手当て）。終わりの姿（枠の色・字の色）が出ている
      await expect(el).toHaveCSS('animation-duration', '0.01ms');
      expect(await el.evaluate((node) => node.getAnimations().every((a) => a.playState === 'finished'))).toBe(true);
      expect(await el.evaluate((node) => getComputedStyle(node).borderTopColor)).not.toBe('rgba(0, 0, 0, 0)');
    }
  });
});
