/**
 * 主な画面の、隣り合うブロックの重なりと間（#557・#479 B・ADR 0035 決定 1・2）。
 *
 * **タグを付けない（`local` 専用）。** 本番のルーム枠を消費して確かめる種類のものではない。
 *
 * 7 アプリの主な画面を、5 つの幅（320・390・768・1280・1920）で開き、同じ親の子どうしが
 *   - 重ならない
 *   - 縦に積まれた組の間が `--space-2`（8px）以上ある
 * ことを測る。測り方と、偽陽性を除く規則（貼りつく帯・流れの外・変形・字を切る面・線・字の行どうし・表の行・文の中の箱）は
 * `support/block-gaps.ts`。要素の矩形だけを見る（スクリーンショットの比較は入れない。ADR 0035 決定 4）。
 *
 * 画面を足したら、ここに 1 つ足す（`docs/guides/definition-of-done.md` の「新しい画面・部品の作法」）。
 * 文字 200% は、画面ごとに 1 つずつ別の test で測る（下の「文字 200%」）。
 */
import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures/test';
import { expectBlocksSeparated as scanOnce, type BlockScanOptions } from '../support/block-gaps';
import { openAgendaTool } from '../support/agenda';
import { chooseMethod, handCard, joinCheckinTool, openCheckinTool } from '../support/checkin';
import { chooseCard, createRoom as createPokerRoom, joinRoom as joinPokerRoom } from '../support/poker';
import { addRouletteGuest, openRouletteTool } from '../support/roulette';
import { createRoom as createTimerRoom, joinAsDriver } from '../support/timer';
import { openTopicTool, setTopic } from '../support/topic';

/** 1 倍と文字 200% の両方で測る。文字を大きくすると折り返しが増え、ブロックの間と重なりが最初に崩れる（#555・#556 のレビューで多く出た）。 */
async function expectBlocksSeparated(page: Page, label: string, opts: BlockScanOptions = {}): Promise<void> {
  await scanOnce(page, label, opts);
  await scanOnce(page, label, { ...opts, fontScale: 200 });
}

/** 長い名前（全角 28 字）。席・行の折り返しを出す。 */
const LONG = 'ながいなまえのさんかしゃでございますよろしくおねがいします';

test.describe('主な画面は隣り合うブロックが重ならず、縦の間が空いている', () => {
  test('Given 玄関（名乗る前・ルームを作った後の道具選び） / When 5 つの幅で開く / Then 隣り合うブロックが重ならず、縦の間が 8px 以上', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'ルームを作る' })).toBeVisible();
    await expectBlocksSeparated(page, '玄関（名乗る前）', { minNodes: 8 });
    await page.getByLabel('あなたの名前').fill('block-hub');
    await page.getByRole('button', { name: 'ルームを作る' }).click();
    await expect(page.getByRole('list', { name: 'ツール' })).toBeVisible();
    await expectBlocksSeparated(page, '玄関（道具選び）');
  });

  test('Given 招待の URL で開いた玄関（参加を名乗る） / When 5 つの幅で開く / Then 隣り合うブロックが重ならず、縦の間が 8px 以上', async ({ page, openPeer }) => {
    await page.goto('/');
    await page.getByLabel('あなたの名前').fill('block-host');
    await page.getByRole('button', { name: 'ルームを作る' }).click();
    const url = await page.getByLabel('参加用 URL').inputValue();
    const guest = await openPeer('block-hub-guest');
    await guest.page.goto(url);
    await expect(guest.page.getByRole('button', { name: '参加する' })).toBeVisible();
    await expectBlocksSeparated(guest.page, '玄関（参加を名乗る）', { minNodes: 8 });
  });

  test('Given poker のルーム（投票中・公開後） / When 5 つの幅で開く / Then 隣り合うブロックが重ならず、縦の間が 8px 以上', async ({ page, openPeer }) => {
    test.setTimeout(120_000);
    const url = await createPokerRoom(page, 'block-poker');
    const guest = await openPeer('block-poker-1');
    await joinPokerRoom(guest.page, url, LONG);
    await expect(page.getByText('参加者（2人）')).toBeVisible();
    await expect(page.getByRole('button', { name: '票を公開する' })).toBeVisible();
    await expectBlocksSeparated(page, 'poker（投票中）');
    await chooseCard(guest.page, '5');
    await chooseCard(page, '8');
    await expect(page.getByRole('button', { name: '次のアイテムへ' })).toBeVisible();
    await expectBlocksSeparated(page, 'poker（公開後）');
  });

  test('Given poker の見積もりの記録（長い名前の束） / When 5 つの幅で開く / Then 隣り合うブロックが重ならず、縦の間が 8px 以上', async ({ page }) => {
    await createPokerRoom(page, 'block-poker-log');
    await page.getByRole('button', { name: '記録する' }).click();
    await page.locator('.estimate-item:not(.estimate-item--inline) .estimate-item-title').first().click();
    await page.locator('.estimate-item:not(.estimate-item--inline) .estimate-item-input').fill(LONG);
    await page.keyboard.press('Enter');
    await chooseCard(page, '5');
    await page.getByRole('button', { name: '次のアイテムへ' }).click();
    await expect(page.locator('.estimate-group:visible').first()).toBeVisible();
    await expectBlocksSeparated(page, 'poker（記録の束）');
  });

  test('Given timer のロビーとセッション（長い名前の人がいる） / When 5 つの幅で開く / Then 隣り合うブロックが重ならず、縦の間が 8px 以上', async ({ page, openPeer }) => {
    test.setTimeout(120_000);
    const code = await createTimerRoom(page, 'block-timer');
    for (const [i, name] of [LONG, 'さとう'].entries()) {
      const peer = await openPeer(`block-timer-${String(i)}`);
      await joinAsDriver(peer.page, code, name);
    }
    // 作った人も輪に入る（入っていなければ「ドライバーに加わる」が出る）
    await expect(page.locator('.lobby-participant').first()).toBeVisible();
    const join = page.getByRole('button', { name: 'ドライバーに加わる' });
    if (await join.isVisible()) await join.click();
    await expect(page.locator('.lobby-participant')).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'セッションを開始' })).toBeVisible();
    await expectBlocksSeparated(page, 'timer（ロビー）');
    await page.getByRole('button', { name: 'セッションを開始' }).click();
    await expect(page.getByRole('timer')).toBeVisible();
    await expectBlocksSeparated(page, 'timer（セッション）');
  });

  test('Given roulette のルーム（入る人が並ぶ・回した後） / When 5 つの幅で開く / Then 隣り合うブロックが重ならず、縦の間が 8px 以上', async ({ page }) => {
    await openRouletteTool(page, 'block-roulette');
    for (const name of [LONG, 'さとう', 'すずき']) await addRouletteGuest(page, name);
    await expectBlocksSeparated(page, 'roulette（回す前）');
    await page.getByRole('button', { name: 'ルーレットを回す' }).click();
    await expect(page.getByRole('button', { name: 'もう一度回す' })).toBeVisible({ timeout: 20_000 });
    await expectBlocksSeparated(page, 'roulette（回した後）');
  });

  test('Given agenda の組む画面（ステップあり）と進行中 / When 5 つの幅で開く / Then 隣り合うブロックが重ならず、縦の間が 8px 以上', async ({ page }) => {
    await openAgendaTool(page, 'block-agenda');
    await expect(page.getByRole('button', { name: 'サンプルから選ぶ', exact: true })).toBeVisible();
    await expectBlocksSeparated(page, 'agenda（組む画面・空）');
    await page.getByRole('button', { name: 'サンプルから選ぶ', exact: true }).click();
    await page.getByRole('button', { name: /サンプル：KPT のふりかえり/ }).click();
    await expect(page.getByRole('button', { name: 'ルームに読み込む', exact: true })).toBeVisible();
    await expectBlocksSeparated(page, 'agenda（組む画面・ステップあり）');
    await page.getByRole('button', { name: 'ルームに読み込む', exact: true }).click();
    await expect(page.getByRole('button', { name: '開始', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: '開始', exact: true }).click();
    await expect(page.getByRole('button', { name: '次へ', exact: true })).toBeVisible();
    await expectBlocksSeparated(page, 'agenda（進行中）');
  });

  test('Given topic のルーム（お題なし・長いお題あり） / When 5 つの幅で開く / Then 隣り合うブロックが重ならず、縦の間が 8px 以上', async ({ page }) => {
    await openTopicTool(page, 'block-topic');
    await expect(page.getByLabel('タイトル')).toBeVisible();
    await expectBlocksSeparated(page, 'topic（お題なし）');
    const body = Array.from({ length: 8 }, (_, i) => `段落 ${String(i + 1)}。お題の説明をここに書きます。折り返しても段落の間と行間が区別できることを確かめるための文です。`).join('\n\n');
    await setTopic(page, 'ふりかえりのお題', body);
    await expectBlocksSeparated(page, 'topic（お題あり）');
  });

  test('Given checkin のルーム（やり方を選ぶ・札を出す途中・開いた後） / When 5 つの幅で開く / Then 隣り合うブロックが重ならず、縦の間が 8px 以上', async ({ page, openPeer }) => {
    test.setTimeout(120_000);
    const url = await openCheckinTool(page, 'block-checkin');
    for (const [i, name] of [LONG, 'さとう', 'すずき'].entries()) {
      const peer = await openPeer(`block-checkin-${String(i)}`);
      await joinCheckinTool(peer.page, url, name);
    }
    await expect(page.getByRole('group', { name: 'やり方を選んでください' })).toBeVisible();
    await expectBlocksSeparated(page, 'checkin（やり方を選ぶ）');
    await chooseMethod(page, 'チェックイン', '今日の天気');
    await expect(handCard(page, '晴れ')).toBeVisible();
    await expectBlocksSeparated(page, 'checkin（札を出す前）');
    await handCard(page, '晴れ').click();
    await expectBlocksSeparated(page, 'checkin（札を出した後）');
    await page.getByRole('button', { name: '待たずに開く', exact: true }).click();
    await expect(page.getByRole('button', { name: 'もう一回', exact: true })).toBeVisible();
    await settleAfterReveal(page);
    await expectBlocksSeparated(page, 'checkin（開いた後）');
  });
});

/** 開いた直後の演出が終わるのを、席と帯の矩形が 2 回続けて同じになるまで待つ（時間では待たない）。 */
async function settleAfterReveal(page: Page): Promise<void> {
  let previous = '';
  await expect.poll(async () => {
    const now = await page.evaluate(() => ['.seat-row', '.round-dock'].map((s) => JSON.stringify(document.querySelector(s)?.getBoundingClientRect())).join('|'));
    const same = now === previous;
    previous = now;
    return same;
  }, { message: '開いた後の帯と席の矩形が落ち着かない' }).toBe(true);
}
