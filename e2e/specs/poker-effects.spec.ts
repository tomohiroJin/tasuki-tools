/**
 * poker の開票の演出（#639・#670）。静かな帯 1 行と、画面全体のカットイン。
 * 場面は 6 つ: 全員休憩・全員同じ・大きく割れた・ほぼ同じ・全員バラバラ・全員出そろいました
 * （「全員バラバラ」は「大きく割れた」より先に見る。全員が違う札なら必ず離れているので、逆にするとバラバラが出なくなる）。
 *
 * **タグを付けない（`local` 専用）。** 2〜3 つのブラウザ文脈を使う画面の確認で、本番の煙には要らない。
 *
 * 見るもの:
 * - 場面が、居合わせた全員の画面で同じときに出る（カットイン `.ui-cutin` は題の字で見分ける。帯は結果の節の `role="status"` 1 つ）
 * - カットインの最中でも再投票・次のアイテムの操作が通る。同じアイテムの再投票でも毎回出る。1 回は決まった長さの後に消える
 * - 出ている間に横のスクロールが出ない（320・1280px）。帯は統計に重ならない
 * - 動きを減らす設定ではカットインを描かず、静かな帯と読み上げ（終わりの姿）だけが出る
 * - ? が混ざれば「全員同じ」にならない。記録する間だけ「N 回続けて」が添わる
 *
 * 文言は書体の常用の層に収めたもの（「致」は無いので「全員同じ」）。
 */
import { expect, test } from '../fixtures/test';
import type { Locator, Page } from '@playwright/test';
import { chooseCard, createRoom, joinRoom, resultsSection, turnRecordingOn } from '../support/poker';

const BREAK = '全員休憩';
const UNANIMOUS = '全員同じ';
const SPLIT = '大きく割れた';
const NEAR = 'ほぼ同じ';
const SCATTERED = '全員バラバラ';
const COMPLETE = '全員出そろいました';
/** カットインを出している長さ（ms）。正本は `@tasuki/web-kit/room` の `CUTIN_DURATION_MS`（e2e はアプリのコードを読まないので写す。ずれたら下の消える待ちが先に気づく） */
const CUTIN_MS = 1800;
/** 2 席の卓で、カットインが出始める待ち（ms）。札のめくりの後（(2 − 1) × 90 + 450） */
const CUTIN_DELAY_2_SEATS_MS = (2 - 1) * 90 + 450;
/** 2 席の卓で帯の動きが終わる時刻（ms）。遅れは札のめくりの待ち・動きは 1500（`apps/poker-web/src/index.css`） */
const MOTION_END_2_SEATS_MS = CUTIN_DELAY_2_SEATS_MS + 1500;

/** 結果の節の演出の帯（見える帯。読み上げからは隠してある）。 */
const band = (page: Page, text: string): Locator => resultsSection(page).locator('.results-effect').filter({ hasText: text });

/** 読み上げの知らせ（空で挿入され、札がめくれた後に文言が入る）。 */
const announced = (page: Page, text: string): Locator => resultsSection(page).getByRole('status').filter({ hasText: text });

/** 画面全体のカットイン（題の字で見分ける。層は body 直下に重なり、読み上げからは隠してある）。 */
const cutIn = (page: Page, title: string): Locator => page.locator('.ui-cutin').filter({ has: page.locator('.ui-cutin-title', { hasText: title }) });

/** 横のスクロールが出ていないか（画面の幅を、中身が広げていない）。 */
const hasNoHorizontalScroll = (page: Page): Promise<boolean> =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

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

test.describe('poker の開票の演出（#639・#670）', () => {
  test('Given 2 人 / When 同じ札を出す / Then 両方の画面にカットインと「全員同じ」の帯が出て、帯は統計に重ならない', async ({ page, openPeer }) => {
    const pages = await openRoom(page, openPeer, 'fx-a', 2);
    await everyoneVotes(pages, ['5', '5']);
    for (const p of pages) {
      await expect(cutIn(p, UNANIMOUS)).toBeVisible();
      await expect(cutIn(p, UNANIMOUS).locator('.ui-cutin-kicker')).toHaveText('PLANNING POKER');
      await expect(cutIn(p, UNANIMOUS)).toHaveAttribute('aria-hidden', 'true');
      await expect(band(p, UNANIMOUS)).toBeVisible();
      await expect(band(p, SPLIT)).toHaveCount(0);
      // 読み上げは 1 つだけで、同じ文言が入る（見える帯もカットインも読み上げから隠してあり、二重に読まれない）
      await expect(announced(p, UNANIMOUS)).toHaveCount(1);
      await expect(resultsSection(p).getByRole('status')).toHaveCount(1);
    }
    // 帯は結果の節の中で、統計（平均・最頻値）の上に置かれる（重ならない）。320・1280px の両方で
    for (const width of [320, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const bandBox = await band(page, UNANIMOUS).boundingBox();
      const statsBox = await resultsSection(page).locator('.stats').boundingBox();
      expect(bandBox, `帯が描かれている（${width}px）`).not.toBeNull();
      expect(statsBox, `統計が描かれている（${width}px）`).not.toBeNull();
      expect(bandBox!.y + bandBox!.height, `帯は統計の上で終わる（${width}px）`).toBeLessThanOrEqual(statsBox!.y + 1);
      expect(await hasNoHorizontalScroll(page), `横スクロールが出ない（${width}px）`).toBe(true);
    }
  });

  for (const width of [320, 1280]) {
    test(`Given 画面の幅 ${width}px / When カットインが出ている / Then 横のスクロールが出ず、題が画面の中に収まる`, async ({ page, openPeer }) => {
      const pages = await openRoom(page, openPeer, `fx-w${width}`, 2);
      for (const p of pages) await p.setViewportSize({ width, height: 800 });
      await everyoneVotes(pages, ['5', '5']);
      const title = cutIn(page, UNANIMOUS).locator('.ui-cutin-title');
      await expect(title).toBeVisible();
      // 出ている間（動きの途中）に測る。層は画面の全体に重なるが、文書の幅を広げない
      expect(await hasNoHorizontalScroll(page), '横スクロールが出ない').toBe(true);
      // 題の外枠は、動きの時刻で変わる（右から滑り込む途中は画面の外に居る）。いつ測るかで結果が揺れないよう、
      // 全部の動きを帯が止まった時刻（全体の 50%）で止めてから測る（#670 のレビュー）
      const box = await page.evaluate(() => {
        const root = document.querySelector('body > .ui-cutin');
        if (root === null) return null;
        for (const anim of root.getAnimations({ subtree: true })) {
          const total = Number(anim.effect?.getComputedTiming().endTime ?? 0);
          anim.pause();
          anim.currentTime = total / 2;
        }
        const r = root.querySelector('.ui-cutin-title')?.getBoundingClientRect();
        return r === undefined ? null : { left: r.left, right: r.right };
      });
      expect(box, '題が描かれている').not.toBeNull();
      expect(box!.left, '題の左端が画面の中').toBeGreaterThanOrEqual(0);
      expect(box!.right, '題の右端が画面の中').toBeLessThanOrEqual(width);
    });
  }

  test('Given カットインの最中 / When 再投票を押す / Then 押せて、前のカットインは消え、同じ票の次の開票でまた出る', async ({ page, openPeer }) => {
    const pages = await openRoom(page, openPeer, 'fx-b', 2);
    await everyoneVotes(pages, ['3', '3']);
    await expect(cutIn(page, UNANIMOUS)).toBeVisible();
    // 出ている最中に押す（層は操作を奪わない）。押せるまでが、動きの終わりより前
    const clickedAt = Date.now();
    await page.getByRole('button', { name: '再投票' }).click();
    expect(Date.now() - clickedAt, '押せるまでが動きの終わりより前').toBeLessThan(CUTIN_DELAY_2_SEATS_MS + CUTIN_MS);
    for (const p of pages) await expect(p.getByRole('heading', { name: 'あなたのカード' })).toBeVisible();
    await expect(cutIn(page, UNANIMOUS)).toHaveCount(0);
    await expect(band(page, UNANIMOUS)).toHaveCount(0);
    // 同じアイテム・同じ票でも毎回出る: 2 回目の開票の後に、両方の画面でカットインと帯が見える
    await everyoneVotes(pages, ['3', '3']);
    await Promise.all(pages.map((p) => expect(cutIn(p, UNANIMOUS)).toBeVisible()));
    await Promise.all(pages.map((p) => expect(band(p, UNANIMOUS)).toBeVisible()));
  });

  test('Given カットインの最中 / When 次のアイテムを押す / Then 押せて、次の投票へ進む', async ({ page, openPeer }) => {
    const pages = await openRoom(page, openPeer, 'fx-c', 2);
    const other = pages[1]!;
    await everyoneVotes(pages, ['3', '3']);
    await expect(cutIn(other, UNANIMOUS)).toBeVisible();
    const clickedAt = Date.now();
    await other.getByRole('button', { name: '次のアイテムへ' }).click();
    expect(Date.now() - clickedAt, '押せるまでが動きの終わりより前').toBeLessThan(MOTION_END_2_SEATS_MS);
    for (const p of pages) await expect(p.getByRole('heading', { name: 'あなたのカード' })).toBeVisible();
    await expect(band(other, UNANIMOUS)).toHaveCount(0);
  });

  test('Given カットイン / When 決まった長さ待つ / Then 1 回で消え、出し直さない。静かな帯の文言は残る', async ({ page, openPeer }) => {
    const pages = await openRoom(page, openPeer, 'fx-d', 2);
    await everyoneVotes(pages, ['8', '8']);
    const layer = cutIn(page, UNANIMOUS);
    await expect(layer).toBeVisible();
    // 出てから CUTIN_MS の後に DOM から外れる（余裕を持って待つ。壁時計の判定は CI の揺れで偽の赤になるので、消えるまで待つ形にする）
    await expect(layer).toHaveCount(0, { timeout: CUTIN_MS + 5000 });
    // 出し直さない（同じ回の状態の描き直しで再び出ない）
    await page.waitForTimeout(600);
    await expect(layer).toHaveCount(0);
    await expect(band(page, UNANIMOUS)).toBeVisible();
  });

  test('Given 2 人 / When 全員が ☕ を出す / Then 「全員休憩」のカットインと帯が出る', async ({ page, openPeer }) => {
    const pages = await openRoom(page, openPeer, 'fx-e', 2);
    await everyoneVotes(pages, ['☕', '☕']);
    for (const p of pages) {
      await expect(cutIn(p, BREAK)).toBeVisible();
      await expect(cutIn(p, BREAK).locator('.ui-cutin-sub')).toHaveText('ひと休みしよう');
      await expect(band(p, BREAK)).toBeVisible();
      await expect(band(p, UNANIMOUS)).toHaveCount(0);
    }
  });

  test('Given 2 人 / When 3 段以上離れた札を出す / Then 「大きく割れた」のカットインと帯が出る', async ({ page, openPeer }) => {
    const pages = await openRoom(page, openPeer, 'fx-f', 2);
    await everyoneVotes(pages, ['1', '13']);
    for (const p of pages) {
      await expect(cutIn(p, SPLIT)).toBeVisible();
      await expect(cutIn(p, SPLIT).locator('.ui-cutin-sub')).toHaveText('上と下の見方を話そう');
      await expect(band(p, SPLIT)).toBeVisible();
    }
  });

  test('Given 3 人 / When 全員が違う札を出す / Then 「大きく割れた」でなく「全員バラバラ」のカットインと帯が出る', async ({ page, openPeer }) => {
    const pages = await openRoom(page, openPeer, 'fx-s', 3);
    await everyoneVotes(pages, ['1', '5', '13']);
    for (const p of pages) {
      await expect(cutIn(p, SCATTERED)).toBeVisible();
      await expect(band(p, SCATTERED)).toBeVisible();
      await expect(band(p, SPLIT)).toHaveCount(0);
    }
  });

  test('Given 3 人 / When 2 人がそろい 1 人だけ隣の札を出す / Then 「ほぼ同じ」のカットインと帯が出る（誰が違うかは言わない）', async ({ page, openPeer }) => {
    const pages = await openRoom(page, openPeer, 'fx-g', 3);
    await everyoneVotes(pages, ['5', '5', '8']);
    for (const p of pages) {
      await expect(cutIn(p, NEAR)).toBeVisible();
      await expect(cutIn(p, NEAR).locator('.ui-cutin-sub')).toHaveCount(0);
      await expect(band(p, NEAR)).toBeVisible();
      await expect(band(p, UNANIMOUS)).toHaveCount(0);
    }
  });

  test('Given 2 人 / When 違う札（隣同士）を出して全員が出し終える / Then 「全員出そろいました」が出る', async ({ page, openPeer }) => {
    const pages = await openRoom(page, openPeer, 'fx-h', 2);
    await everyoneVotes(pages, ['5', '8']);
    for (const p of pages) {
      await expect(cutIn(p, COMPLETE)).toBeVisible();
      await expect(band(p, COMPLETE)).toBeVisible();
      await expect(band(p, UNANIMOUS)).toHaveCount(0);
      await expect(band(p, SPLIT)).toHaveCount(0);
    }
  });

  test('Given 3 人のうち 2 人が同じ数字・1 人が ? / When 開票 / Then 「全員同じ」にならない', async ({ page, openPeer }) => {
    const pages = await openRoom(page, openPeer, 'fx-i', 3);
    await everyoneVotes(pages, ['5', '5', '?']);
    for (const p of pages) {
      await expect(band(p, COMPLETE)).toBeVisible();
      await expect(band(p, UNANIMOUS)).toHaveCount(0);
      await expect(p.locator('.ui-cutin').filter({ hasText: UNANIMOUS })).toHaveCount(0);
    }
  });

  test('Given 記録する・全員同じが 2 回続く / When 2 回目を開票する / Then カットインの添え書きに「2 回続けて」が出る', async ({ page, openPeer }) => {
    const pages = await openRoom(page, openPeer, 'fx-j', 2);
    await turnRecordingOn(page);
    await everyoneVotes(pages, ['3', '3']);
    for (const p of pages) await expect(cutIn(p, UNANIMOUS)).toBeVisible();
    await page.getByRole('button', { name: '再投票' }).click();
    for (const p of pages) await expect(p.getByRole('heading', { name: 'あなたのカード' })).toBeVisible();
    await everyoneVotes(pages, ['3', '3']);
    for (const p of pages) {
      await expect(cutIn(p, UNANIMOUS).locator('.ui-cutin-sub')).toHaveText('2 回続けて');
      await expect(announced(p, '2 回続けて')).toHaveCount(1);
    }
  });

  test('Given 演出 / When 2 秒ほど待つ / Then 帯の動きは終わり、帯の文言は残る（レイアウトが跳ねない）', async ({ page, openPeer }) => {
    const pages = await openRoom(page, openPeer, 'fx-k', 2);
    await everyoneVotes(pages, ['8', '8']);
    const el = band(page, UNANIMOUS);
    await expect(el).toBeVisible();
    // 動きそのものの長さは 2 秒以内（1.5s）。遅れは札のめくりの待ち（(席の数 − 1) × 90ms + 0.45s）で、演出の長さではない。
    // 終わる時刻を壁時計で測ると、遅れと CI の揺れで偽の赤になる（PR #652 の CI）ので、長さは動きの設定から読み、終わりは余裕を持って待つ
    const timings = await el.evaluate((node) =>
      node.getAnimations().map((a) => {
        const t = a.effect?.getTiming();
        return { duration: Number(t?.duration ?? 0), iterations: Number(t?.iterations ?? 1) };
      }),
    );
    expect(timings.length).toBeGreaterThan(0);
    for (const t of timings) expect(t.duration * t.iterations).toBeLessThanOrEqual(2000);
    await expect
      .poll(() => el.evaluate((node) => node.getAnimations().every((a) => a.playState === 'finished')), { timeout: 10_000 })
      .toBe(true);
    await expect(el).toBeVisible();
    await expect(el).toHaveCSS('opacity', '1');
  });

  test('Given 動きを減らす設定 / When 全員が同じ札を出す / Then カットインは出ず、静かな帯と読み上げが同じことを伝える', async ({ page, openPeer }) => {
    const pages = await openRoom(page, openPeer, 'fx-l', 2);
    for (const p of pages) await p.emulateMedia({ reducedMotion: 'reduce' });
    await everyoneVotes(pages, ['2', '2']);
    for (const p of pages) {
      const el = band(p, UNANIMOUS);
      await expect(el).toBeVisible();
      await expect(el).toHaveCSS('opacity', '1');
      // 読み上げの知らせは出る（動きを減らす設定では待たずに入る）
      await expect(announced(p, UNANIMOUS)).toHaveCount(1);
      // 動きは長さ 0（要素層の一括の手当て）。終わりの姿（枠の色・字の色）が出ている
      // 計算済みの値は書き方（0.01ms）でなく秒（1e-05s）で返るので、数に直して比べる
      const seconds = await el.evaluate((node) => parseFloat(getComputedStyle(node).animationDuration));
      expect(seconds).toBeLessThanOrEqual(0.001);
      expect(await el.evaluate((node) => node.getAnimations().every((a) => a.playState === 'finished'))).toBe(true);
      expect(await el.evaluate((node) => getComputedStyle(node).borderTopColor)).not.toBe('rgba(0, 0, 0, 0)');
    }
    // カットインは出る時機（札のめくりの後）を過ぎても出ない。出ないことは待って確かめるほかない
    await page.waitForTimeout(CUTIN_DELAY_2_SEATS_MS + 700);
    for (const p of pages) await expect(p.locator('.ui-cutin')).toHaveCount(0);
  });
});
