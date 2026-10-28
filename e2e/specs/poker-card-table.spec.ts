/**
 * poker の隠しモード・トランプのポーカー（#403・設計 §8）。
 *
 * **タグを付けない（`local` 専用）。** 2 つのブラウザ文脈を使う画面の確認で、本番の煙には要らない。
 * 隠しているぶん壊れても誰も気付かないので、CI が毎回この 1 本を通す（設計「見送らなかった理由」）。
 */
import { expect, test } from '../fixtures/test';
import type { Page } from '@playwright/test';
import { createRoom, joinRoom } from '../support/poker';

const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

const table = (page: Page) => page.getByRole('region', { name: 'トランプのポーカー' });
const yourHand = (page: Page) => table(page).getByRole('list', { name: 'あなたの手' }).getByRole('listitem');

test.describe('poker の隠しモード（#403）', () => {
  test('Given 2 人 / When 入口から入って引く・見せる / Then 互いの手は見せるまで届かず、見せると役が並ぶ', async ({
    page,
    openPeer,
  }) => {
    const roomUrl = await createRoom(page, 'ct-a');
    const peer = (await openPeer('ct-b')).page;
    await joinRoom(peer, roomUrl, 'ct-b');

    // 普段の画面にはテーブルが無い
    await expect(page.getByRole('heading', { name: '参加者（2人）' })).toBeVisible();
    await expect(table(page)).toHaveCount(0);

    // A はキーボード（コナミコマンド）、B はタッチ・マウス（見出しを 5 回）で入る
    for (const key of KONAMI) await page.keyboard.press(key);
    await expect(table(page)).toBeVisible();
    await expect(table(peer)).toHaveCount(0); // 席に着いていない人には出ない（T-2）
    const heading = peer.getByRole('heading', { name: '参加者（2人）' });
    for (let i = 0; i < 5; i++) await heading.click();
    await expect(table(peer)).toBeVisible();

    // 引く
    await table(page).getByRole('button', { name: 'カードを引く' }).click();
    await expect(yourHand(page)).toHaveCount(5);
    await expect(yourHand(peer)).toHaveCount(5);
    const handA = await yourHand(page).allTextContents();
    const handB = await yourHand(peer).allTextContents();
    expect(new Set([...handA, ...handB]).size).toBe(10);
    // 見せる前は、相手の札の文字が画面のどこにも無い（T-4）
    for (const card of handB) await expect(table(page).getByText(card, { exact: true })).toHaveCount(0);

    // 見せる
    await table(peer).getByRole('button', { name: '見せる' }).click();
    for (const p of [page, peer]) {
      const everyone = table(p).getByRole('list', { name: 'みんなの手' });
      await expect(everyone.getByRole('listitem', { name: 'ct-aの手' })).toBeVisible();
      await expect(everyone.getByRole('listitem', { name: 'ct-bの手' })).toBeVisible();
      await expect(table(p).getByText('いちばん強い手').first()).toBeVisible();
    }
    // 見積もりは動かない（T-12）
    await expect(page.getByRole('button', { name: '票を公開する' })).toBeVisible();

    // 閉じると自分の画面からだけ消える
    await table(page).getByRole('button', { name: '閉じる' }).click();
    await expect(table(page)).toHaveCount(0);
    await expect(table(peer)).toBeVisible();
  });
});
