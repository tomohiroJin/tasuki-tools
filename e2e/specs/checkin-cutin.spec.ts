/**
 * Check-in Cards の札が開いたときのカットイン（#670・設計 `docs/superpowers/specs/2026-11-27-cutin-design.md` §4）。
 *
 * **タグを付けない（`local` 専用）。** 2 つのブラウザ文脈を使う画面の確認で、本番の煙には要らない。
 *
 * 見るもの:
 * - 2 人が同じ札を出して開くと、全員の画面に「全員同じ」のカットインが出る（札が裏返った後・時間の後に消える）
 * - 割れて開くと、チェックインの側は「チェックイン」・チェックアウトの側は「おつかれさまでした」
 * - 出ている最中も「もう一回」などの操作が押せる（ポインタもフォーカスも奪わない）
 * - 出ている間、320px と 1280px で横のスクロールが出ない
 * - 動きを減らす設定では描かない（読み上げの文は出る）
 * - 再読み込み（最初から開いた状態）では出ない
 *
 * 文言は書体の常用の層に収めたもの。
 */
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../fixtures/test';
import { chooseMethod, handCard, joinCheckinTool, openCheckinTool } from '../support/checkin';

const NAME_A = 'cutin-a';
const NAME_B = 'cutin-b';

/** 画面全体のカットインの層（body 直下）。題の字で絞る */
const cutIn = (page: Page, title: string): Locator => page.locator('body > .ui-cutin').filter({ has: page.locator('.ui-cutin-title', { hasText: title }) });
const anyCutIn = (page: Page): Locator => page.locator('body > .ui-cutin');
/** 2 枚の山の裏返りが終わるまで（(2 − 1) × 90 ＋ 350 ＋ 500）＋ 余裕。層の長さは 1800ms（`CUTIN_DURATION_MS`） */
const SHOWN_WITHIN_MS = 940 + 3000;

/** 2 人が同じルームに入り、チェックインの「今日の天気」を選んだ状態にする */
async function openRoom(
  page: Page,
  openPeer: (label: string) => Promise<{ page: Page }>,
  tag: string,
): Promise<{ a: Page; b: Page }> {
  const inviteUrl = await openCheckinTool(page, `${NAME_A}-${tag}`);
  const peer = await openPeer(`checkin-cutin-${tag}`);
  await joinCheckinTool(peer.page, inviteUrl, `${NAME_B}-${tag}`);
  await chooseMethod(page, 'チェックイン', '今日の天気');
  await expect(handCard(peer.page, '晴れ')).toBeVisible();
  return { a: page, b: peer.page };
}

const overflowOf = (page: Page): Promise<number> =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe('札が開いたときのカットイン', () => {
  test('Given 2 人 / When 同じ札を出して開く / Then 全員の画面に「全員同じ」が出て、時間の後に消える。最中に「もう一回」が押せる', async ({
    page,
    openPeer,
  }) => {
    const { a, b } = await openRoom(page, openPeer, 'same');
    await handCard(a, '晴れ').click();
    await handCard(b, '晴れ').click();
    for (const p of [a, b]) {
      await expect(cutIn(p, '全員同じ')).toBeVisible({ timeout: SHOWN_WITHIN_MS });
      await expect(cutIn(p, '全員同じ').locator('.ui-cutin-sub')).toHaveText('晴れ');
    }
    // 出ている最中でも操作が通る（層はポインタを受けない）
    await a.getByRole('button', { name: 'もう一回', exact: true }).click();
    await expect(handCard(b, '晴れ')).toBeVisible();
    // 時間の後（または次の回が始まって）消える
    for (const p of [a, b]) await expect(anyCutIn(p)).toHaveCount(0, { timeout: 4000 });
  });

  test('Given 2 人 / When 違う札を出して開く / Then チェックインの側は「チェックイン」が出る', async ({ page, openPeer }) => {
    const { a, b } = await openRoom(page, openPeer, 'split');
    await handCard(a, '晴れ').click();
    await handCard(b, '雨').click();
    for (const p of [a, b]) await expect(cutIn(p, 'チェックイン')).toBeVisible({ timeout: SHOWN_WITHIN_MS });
    await expect(anyCutIn(a).filter({ hasText: '全員同じ' })).toHaveCount(0);
  });

  test('Given チェックアウトの側 / When 割れて開く / Then 「おつかれさまでした」が出る', async ({ page, openPeer }) => {
    const { a, b } = await openRoom(page, openPeer, 'out');
    await a.getByRole('button', { name: '別のやり方', exact: true }).click();
    await chooseMethod(a, 'チェックアウト', 'ROTI（時間に見合ったか）');
    await handCard(a, '2').click();
    await handCard(b, '4').click();
    for (const p of [a, b]) await expect(cutIn(p, 'おつかれさまでした')).toBeVisible({ timeout: SHOWN_WITHIN_MS });
  });

  test('Given 出ている間 / When 320px と 1280px で見る / Then 横のスクロールが出ない', async ({ page, openPeer }) => {
    const { a, b } = await openRoom(page, openPeer, 'wide');
    const original = a.viewportSize() ?? { width: 1280, height: 800 };
    await handCard(a, '晴れ').click();
    await handCard(b, '晴れ').click();
    await expect(cutIn(a, '全員同じ')).toBeVisible({ timeout: SHOWN_WITHIN_MS });
    expect(await overflowOf(a), `${original.width}px で出ている間`).toBeLessThanOrEqual(0);
    await expect(anyCutIn(a)).toHaveCount(0, { timeout: 4000 });
    await a.setViewportSize({ width: 320, height: original.height });
    await a.getByRole('button', { name: 'もう一回', exact: true }).click();
    await handCard(a, '雨').click();
    await handCard(b, '雨').click();
    await expect(cutIn(a, '全員同じ')).toBeVisible({ timeout: SHOWN_WITHIN_MS });
    expect(await overflowOf(a), '320px で出ている間').toBeLessThanOrEqual(0);
    await a.setViewportSize(original);
  });

  test('Given 動きを減らす設定 / When 開く / Then カットインは描かず、読み上げの文は出る', async ({ page, openPeer }) => {
    const { a, b } = await openRoom(page, openPeer, 'reduced');
    await a.emulateMedia({ reducedMotion: 'reduce' });
    await handCard(a, '晴れ').click();
    await handCard(b, '晴れ').click();
    await expect(a.locator('.checkin-live')).toHaveText('晴れが 2 人');
    // 層が出うる時間の中ほどまで待っても、描かれない（時間を置いてから見ると恒真になるので、出る時刻の後に見る）
    await a.waitForTimeout(940 + 900);
    await expect(anyCutIn(a)).toHaveCount(0);
  });

  test('Given 開いた後 / When 再読み込みする / Then 最初から開いた状態なのでカットインは出ない', async ({ page, openPeer }) => {
    const { a, b } = await openRoom(page, openPeer, 'reload');
    await handCard(a, '晴れ').click();
    await handCard(b, '晴れ').click();
    await expect(cutIn(a, '全員同じ')).toBeVisible({ timeout: SHOWN_WITHIN_MS });
    await expect(anyCutIn(a)).toHaveCount(0, { timeout: 4000 });
    await a.reload();
    await expect(a.getByRole('list', { name: '開いた札' })).toBeVisible();
    await a.waitForTimeout(940 + 900);
    await expect(anyCutIn(a)).toHaveCount(0);
  });
});
