/**
 * poker の見学と、接続の無い人（幽霊）の片付け（#419）。
 *
 * **タグを付けない（`local` 専用）。** 3 つのブラウザ文脈を使う画面の確認で、本番の煙には要らない。
 * `TASUKI_SPECTATOR_SHOTS=1` を付けると、実画面を `.superpowers/sdd/2026-10-18-poker-spectator/shots/` に撮る
 * （統括が目で見るため。付けなければ何も撮らない）。
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '../fixtures/test';
import type { Page } from '@playwright/test';
import { chooseCard, createRoom, joinRoom, participantRow, resultsSection, seatCard } from '../support/poker';

const SHOTS = process.env.TASUKI_SPECTATOR_SHOTS === '1';
const SHOT_DIR = path.resolve(import.meta.dirname, '../../.superpowers/sdd/2026-10-18-poker-spectator/shots');

/** 実画面を 320 と 1280 で撮る（環境変数が無ければ何もしない）。撮ったあとは 1280 へ戻す。 */
async function shoot(page: Page, name: string): Promise<void> {
  if (!SHOTS) return;
  mkdirSync(SHOT_DIR, { recursive: true });
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOT_DIR, `${name}-${width}.png`), fullPage: true });
  }
}

/** 見学者のスイッチを押す。 */
async function startSpectating(page: Page): Promise<void> {
  await page.getByRole('button', { name: '見学する' }).click();
  await expect(page.getByRole('button', { name: '投票に加わる' })).toBeVisible();
  await expect(page.getByText('見学中です。投票には加わりません。')).toBeVisible();
}

/** 3 人（作成者・投票者・見学者）を揃える。見学者は入ってすぐ見学にする。 */
async function openThree(
  page: Page,
  openPeer: (label: string) => Promise<{ page: Page }>,
  tag: string,
  names: { host: string; voter: string; spectator: string },
): Promise<{ voter: Page; spectator: Page }> {
  await page.setViewportSize({ width: 1280, height: 900 });
  const roomUrl = await createRoom(page, names.host);
  const voter = (await openPeer(`${tag}-voter`)).page;
  await voter.setViewportSize({ width: 1280, height: 900 });
  await joinRoom(voter, roomUrl, names.voter);
  const spectator = (await openPeer(`${tag}-spectator`)).page;
  await spectator.setViewportSize({ width: 1280, height: 900 });
  await joinRoom(spectator, roomUrl, names.spectator);
  await startSpectating(spectator);
  for (const p of [page, voter, spectator]) {
    await expect(p.getByRole('heading', { name: '参加者（3人・見学1人）' })).toBeVisible();
  }
  return { voter, spectator };
}

test.describe('poker は見学者を数えず、票を待たない', () => {
  test('Given 見学者 1 人と投票者 2 人 / When 2 人が出す / Then 見学者の画面に手札は無く、2 人で開く', async ({ page, openPeer }) => {
    const { voter, spectator } = await openThree(page, openPeer, 'sp1', { host: 'sp-a', voter: 'sp-b', spectator: 'sp-s' });

    // 見学者: 手札が無い（札のボタンが 0）・説明が出る。投票者: 手札がある
    await expect(spectator.getByRole('button', { name: '5', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '5', exact: true })).toBeVisible();
    await expect(participantRow(page, 'sp-s').getByText('見学', { exact: true })).toBeVisible();
    await shoot(page, '1-voting-with-spectator');

    await chooseCard(page, '5');
    await chooseCard(voter, '8');
    for (const p of [page, voter, spectator]) {
      await expect(resultsSection(p)).toBeVisible();
    }
    // 見学者の席には札が無く、投票者の札は表を向く
    await expect(seatCard(page, 'sp-s')).toHaveCount(0);
    await expect(seatCard(page, 'sp-a')).toHaveAccessibleName('5');
    await expect(seatCard(page, 'sp-b')).toHaveAccessibleName('8');
    await expect(page.getByRole('heading', { name: '参加者（3人・見学1人）' })).toBeVisible();
  });

  test('Given 見学者 / When 投票に加わる / Then 手札が出て、その人が出すまで開かない', async ({ page, openPeer }) => {
    const { voter, spectator } = await openThree(page, openPeer, 'sp2', { host: 'sp-a', voter: 'sp-b', spectator: 'sp-s' });

    await spectator.getByRole('button', { name: '投票に加わる' }).click();
    await expect(spectator.getByRole('button', { name: '見学する' })).toBeVisible();
    await expect(spectator.getByRole('button', { name: '5', exact: true })).toBeVisible();
    for (const p of [page, voter, spectator]) {
      await expect(p.getByRole('heading', { name: '参加者（3人）' })).toBeVisible();
    }

    await chooseCard(page, '5');
    await chooseCard(voter, '5');
    // 2 人出しても開かない（positive: 2 人の投票済みが見えている状態で、結果がまだ無い）
    await expect(participantRow(page, 'sp-b').getByText('投票済み')).toBeVisible();
    await expect(resultsSection(page)).toHaveCount(0);
    await expect(resultsSection(spectator)).toHaveCount(0);

    await chooseCard(spectator, '5');
    for (const p of [page, voter, spectator]) {
      await expect(resultsSection(p)).toBeVisible();
    }
    await expect(seatCard(page, 'sp-s')).toHaveAccessibleName('5');
  });

  test('Given 開票後 / When 票を出した人が見学に切り替える / Then 票は集計に残り、札を隠さない', async ({ page, openPeer }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const roomUrl = await createRoom(page, 'sp-a');
    const voter = (await openPeer('sp3-voter')).page;
    await joinRoom(voter, roomUrl, 'sp-b');
    await chooseCard(page, '3');
    await chooseCard(voter, '8');
    await expect(resultsSection(page)).toBeVisible();
    await expect(resultsSection(voter)).toBeVisible();

    await voter.getByRole('button', { name: '見学する' }).click();
    await expect(voter.getByRole('button', { name: '投票に加わる' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '参加者（2人・見学1人）' })).toBeVisible();
    await expect(participantRow(page, 'sp-b').getByText('見学', { exact: true })).toBeVisible();
    // 開票の結果の票は残っている
    await expect(resultsSection(page)).toBeVisible();
    await expect(seatCard(page, 'sp-b')).toHaveAccessibleName('8');
    await shoot(page, '2-revealed-spectator-holds-vote');
  });
});

test.describe('poker は接続の無い人を一覧から外せる', () => {
  test('Given 同名 2 人と接続の切れた 1 人 / When 切れた人を退出させる / Then 確認のあとで行が消える', async ({ page, openPeer }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const roomUrl = await createRoom(page, 'sp-a');
    const twin = (await openPeer('sp4-twin')).page;
    await joinRoom(twin, roomUrl, 'sp-a');
    const ghostPeer = await openPeer('sp4-ghost');
    await joinRoom(ghostPeer.page, roomUrl, 'sp-g');
    await expect(page.getByRole('heading', { name: '参加者（3人）' })).toBeVisible();
    // 同名は ID の末尾で呼び分ける（自分と相手の 2 行）
    await expect(page.locator('.participants .name').filter({ hasText: /^sp-a（ID: [\w-]{4}）/ })).toHaveCount(2);

    // When: 3 人目の文脈を閉じる → 切断中
    await ghostPeer.page.context().close();
    const ghostRow = participantRow(page, 'sp-g');
    await expect(ghostRow.getByText('切断中')).toBeVisible();
    // 接続している人の行には外すボタンが無い
    await expect(participantRow(page, 'sp-a').getByRole('button', { name: '退出させる' })).toHaveCount(0);
    await shoot(page, '3-same-name-and-ghost');

    await ghostRow.getByRole('button', { name: '退出させる' }).click();
    const dialog = page.getByRole('dialog', { name: 'sp-g さんを退出させますか？' });
    await expect(dialog).toBeVisible();
    await shoot(page, '4-removal-confirm');

    // キャンセルでは消えない
    await dialog.getByRole('button', { name: 'キャンセル' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(ghostRow.getByText('切断中')).toBeVisible();

    // 確定で消え、見出しが 2 人になる
    await ghostRow.getByRole('button', { name: '退出させる' }).click();
    await page.getByRole('dialog', { name: 'sp-g さんを退出させますか？' }).getByRole('button', { name: '退出させる' }).click();
    await expect(page.getByRole('heading', { name: '参加者（2人）' })).toBeVisible();
    await expect(participantRow(page, 'sp-g')).toHaveCount(0);
    await expect(twin.getByRole('heading', { name: '参加者（2人）' })).toBeVisible();
  });
});
