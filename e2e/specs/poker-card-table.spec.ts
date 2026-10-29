/**
 * poker の隠しモード・トランプのポーカー（#403・設計 §8）。
 *
 * **タグを付けない（`local` 専用）。** 2 つのブラウザ文脈を使う画面の確認で、本番の煙には要らない。
 * 隠しているぶん壊れても誰も気付かないので、CI が毎回ここを通す。
 */
import { expect, test } from '../fixtures/test';
import type { Page } from '@playwright/test';
import { chooseCard, createRoom, joinRoom } from '../support/poker';

const table = (page: Page) => page.getByRole('region', { name: 'トランプのポーカー' });
const pickable = (page: Page) => table(page).getByRole('group', { name: 'あなたの手' }).getByRole('button');

/** 全員が ☕ を出し、開くのを待つ */
async function allCoffee(pages: Page[]): Promise<void> {
  for (const p of pages) await chooseCard(p, '☕');
}

/** ☕ → 開く → 再投票 → ☕ → 開く（入口・設計 E-2） */
async function enter(pages: Page[]): Promise<void> {
  await allCoffee(pages);
  for (const p of pages) await expect(p.getByRole('button', { name: '再投票' })).toBeVisible();
  for (const p of pages) await expect(table(p)).toHaveCount(0); // 1 回目では始まらない（E-1）
  await pages[0]!.getByRole('button', { name: '再投票' }).click();
  for (const p of pages) await expect(p.getByRole('button', { name: '票を公開する' })).toBeVisible();
  await allCoffee(pages);
  for (const p of pages) await expect(table(p)).toBeVisible();
}

test.describe('poker の隠しモード（#403）', () => {
  test('Given 2 人 / When ☕ を 2 回・チェンジ・開く / Then 相手の手は開くまで見えず、開くと全員の役が並び、見積もりに戻れる', async ({
    page,
    openPeer,
  }) => {
    const roomUrl = await createRoom(page, 'ct-a');
    const peer = (await openPeer('ct-b')).page;
    await joinRoom(peer, roomUrl, 'ct-b');
    await expect(page.getByRole('heading', { name: '参加者（2人）' })).toBeVisible();

    await enter([page, peer]);

    // 配られた: 自分の 5 枚は表、相手の 5 枚は伏せたまま（G-3）
    await expect(pickable(page)).toHaveCount(5);
    await expect(pickable(peer)).toHaveCount(5);
    const handB = await pickable(peer).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
    const seatB = table(page).getByRole('listitem', { name: 'ct-bの手' });
    await expect(seatB.getByRole('img', { name: 'ふせたカード' })).toHaveCount(5);
    for (const name of handB) await expect(table(page).getByRole('img', { name: name! })).toHaveCount(0);

    // A は 2 枚チェンジ、B はこのまま
    await pickable(page).nth(0).click();
    await pickable(page).nth(3).click();
    await table(page).getByRole('button', { name: 'チェンジする（2）' }).click();
    await expect(table(page).getByText('ほかの人のチェンジを待っています')).toBeVisible();
    await expect(table(peer).getByRole('listitem', { name: 'ct-aの手' }).getByText('チェンジ済み')).toBeVisible();
    await table(peer).getByRole('button', { name: 'このまま' }).click();

    // 開く（G-7）: 全員の表の札と役。勝ち負けは無い
    for (const p of [page, peer]) {
      await expect(table(p).getByText('全員の手が開きました')).toBeVisible();
      await expect(table(p).locator('.ct-category')).toHaveCount(2);
    }
    for (const name of handB) await expect(seatB.getByRole('img', { name: name! })).toBeVisible();

    // 見積もりに戻る（G-10）
    await table(peer).getByRole('button', { name: '見積もりに戻る' }).click();
    for (const p of [page, peer]) {
      await expect(table(p)).toHaveCount(0);
      await expect(p.getByRole('button', { name: '票を公開する' })).toBeVisible();
    }
  });

  test('Given 1 人のルーム / When 同じ手順 / Then 同じく始まる（E-4）', async ({ page }) => {
    await createRoom(page, 'ct-solo');
    await enter([page]);
    await expect(pickable(page)).toHaveCount(5);
    await table(page).getByRole('button', { name: 'このまま' }).click();
    await expect(table(page).getByText('全員の手が開きました')).toBeVisible();
  });
});
