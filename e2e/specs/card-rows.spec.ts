/**
 * 札の並びと行の崩れ（#555・一覧 #4・#8・#9・#10・#21）。
 *
 * **タグを付けない（`local` 専用）。** 本番のルーム枠を消費して確かめる種類のものではない。
 *
 * 見るのは要素の矩形どうしの関係だけ（画像の比較は入れない。ADR 0034 決定 4）。
 */
import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures/test';
import { chooseMethod, handCard, joinCheckinTool, openCheckinTool } from '../support/checkin';
import { chooseCard, createRoom as createPokerRoom, joinRoom as joinPokerRoom, resultsSection, turnRecordingOn } from '../support/poker';

type OpenPeer = (label: string) => Promise<{ page: Page }>;

/** 28 字の名前（一覧 #4 の撮影と同じ長さ）。 */
const LONG_NAME = 'ながいなまえのさんかしゃでございますよろしくおねがいします';
/** 名前を 3 行で切る（`line-clamp`）。 */
const NAME_LINES = 3;

/** 席（`.participants li`）の外寸と、名前の字の行数の上限に収まっているか。 */
async function seatMetrics(page: Page, nameStart: string): Promise<{ seatHeight: number; nameHeight: number; lineHeight: number }> {
  return page.locator('.participants li').filter({ hasText: nameStart }).first().evaluate((li) => {
    const text = li.querySelector('.name-text') ?? li.querySelector('.name');
    if (text === null) throw new Error('名前が描かれていない（判定が空振りする）');
    return {
      seatHeight: li.getBoundingClientRect().height,
      nameHeight: text.getBoundingClientRect().height,
      lineHeight: parseFloat(getComputedStyle(text).lineHeight),
    };
  });
}

test.describe('poker の席の札の並び', () => {
  test('Given 28 字の名前の参加者 / When 4 つの幅で開く / Then 名前は 3 行まで・短い名前の席は伸びない・名前の全文は title に残る（#4）', async ({ page, openPeer }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const url = await createPokerRoom(page, 'ホスト');
    const guest = await (openPeer as OpenPeer)('cards-long');
    await joinPokerRoom(guest.page, url, LONG_NAME);
    await expect(page.getByRole('heading', { name: '参加者（2人）' })).toBeVisible();
    for (const width of [320, 390, 1280, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      const long = await seatMetrics(page, 'ながいなまえ');
      const short = await seatMetrics(page, 'ホスト');
      expect(long.nameHeight, `幅 ${String(width)}: 長い名前は ${String(NAME_LINES)} 行まで`).toBeLessThanOrEqual(long.lineHeight * NAME_LINES + 1);
      if (long.nameHeight > long.lineHeight * 1.5) {
        expect(short.seatHeight, `幅 ${String(width)}: 同じ行の短い名前の席が長い席に引き伸ばされていない`).toBeLessThan(long.seatHeight - long.lineHeight / 2);
      }
    }
    await expect(page.locator('.participants li [title]').filter({ hasText: 'ながいなまえ' }).first()).toHaveAttribute('title', LONG_NAME);
  });

  test('Given 3 人 / When 幅 320・390 で開く / Then 席の並びは行の右端まで等分で埋まる（右に端数の空きが残らない・#9）', async ({ page, openPeer }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    const url = await createPokerRoom(page, 'ホスト');
    for (const name of ['さとう', 'すずき']) {
      const peer = await (openPeer as OpenPeer)(`cards-${name}`);
      await joinPokerRoom(peer.page, url, name);
    }
    await expect(page.getByRole('heading', { name: '参加者（3人）' })).toBeVisible();
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const { listRight, rowRight } = await page.locator('.participants').evaluate((ul) => {
        const first = ul.querySelector('li');
        if (first === null) throw new Error('席が描かれていない（判定が空振りする）');
        const top = first.getBoundingClientRect().top;
        const rights = [...ul.querySelectorAll('li')].filter((li) => Math.abs(li.getBoundingClientRect().top - top) < 1).map((li) => li.getBoundingClientRect().right);
        return { listRight: ul.getBoundingClientRect().right, rowRight: Math.max(...rights) };
      });
      expect(Math.abs(listRight - rowRight), `幅 ${String(width)}: 1 行目の右端が並びの右端に揃う`).toBeLessThanOrEqual(1);
    }
  });

  test('Given お題も記録も無いルーム / When 幅 1280・1920 で開く / Then 操作の面は器の内側いっぱいで、見出しと左右の端が揃う（#8）', async ({ page }) => {
    await createPokerRoom(page, 'ホスト');
    for (const width of [1280, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      const { left, right, mainLeft, mainRight } = await page.evaluate(() => {
        const page = document.querySelector('main.ui-page');
        const main = document.querySelector('.ui-workspace-main');
        if (page === null || main === null) throw new Error('器か操作の面が描かれていない（判定が空振りする）');
        const s = getComputedStyle(page);
        const r = page.getBoundingClientRect();
        const m = main.getBoundingClientRect();
        return { left: r.left + parseFloat(s.paddingLeft), right: r.right - parseFloat(s.paddingRight), mainLeft: m.left, mainRight: m.right };
      });
      expect(Math.abs(mainLeft - left), `幅 ${String(width)}: 左端`).toBeLessThanOrEqual(2);
      expect(Math.abs(mainRight - right), `幅 ${String(width)}: 右端`).toBeLessThanOrEqual(2);
    }
  });

  test('Given 記録を入れて「次のアイテムへ」を押した後 / When 幅 320 で開く / Then 束の見出しの「（名前なし）」は 1 行に収まる（#10）', async ({ page, openPeer }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const url = await createPokerRoom(page, 'ホスト');
    const guest = await (openPeer as OpenPeer)('cards-log');
    await joinPokerRoom(guest.page, url, 'ゲスト');
    await expect(page.getByRole('heading', { name: '参加者（2人）' })).toBeVisible();
    await turnRecordingOn(page);
    await chooseCard(page, '5');
    await chooseCard(guest.page, '5');
    await expect(resultsSection(page)).toBeVisible();
    await page.getByRole('button', { name: '次のアイテムへ' }).click();
    await expect(resultsSection(page)).toHaveCount(0);
    // 名前の無い束が閉じ、ポイントの選択を持つ。もう 1 件開票して、閉じた束を残す
    await chooseCard(page, '3');
    await chooseCard(guest.page, '3');
    await expect(resultsSection(page)).toBeVisible();
    // 名前と「ポイントなし」の選択は 1 行に並ぶか、選択が下の行へ落ちるかのどちらか。名前が 2 行に折れる幅は無い。
    // 折れる幅は札の余白・選択の幅の端数で決まるので、320 から 400 まで 4px ずつ見る
    for (let width = 320; width <= 400; width += 4) {
      await page.setViewportSize({ width, height: 900 });
      const title = page.locator('.estimate-group:has(select) .estimate-group-item .estimate-item-title:visible').first();
      await expect(title).toBeVisible();
      const lines = await title.evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
      });
      expect(lines, `幅 ${String(width)}: （名前なし）の字の行は 1 つ`).toBe(1);
    }
  });
});

test.describe('landing の道具の札', () => {
  test('Given 道具を選ぶ画面 / When 幅 320・390 で開く / Then 札は下の欄と左右が揃い、1 枚ずつ低く、並び全体が 2 画面に収まる（#21）', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('あなたの名前').fill('ホスト');
    await page.getByRole('button', { name: 'ルームを作る' }).click();
    await expect(page.getByRole('heading', { name: '道具を選ぶ' })).toBeVisible();
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 800 });
      // 札を配る動きと、傾きが戻る移り変わりが終わってから測る
      await page.evaluate(async () => { await Promise.all(document.getAnimations().map((a) => a.finished)); });
      const m = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('.hub-tools .tool-card')].map((el) => el.getBoundingClientRect());
        const panel = document.querySelector('.hub-panel')?.getBoundingClientRect();
        const hand = document.querySelector('.hub-tools .hand')?.getBoundingClientRect();
        if (panel === undefined || hand === undefined || cards.length === 0) throw new Error('札か欄が描かれていない（判定が空振りする）');
        return {
          lefts: cards.map((c) => c.left - panel.left),
          rights: cards.map((c) => c.right - panel.right),
          heights: cards.map((c) => c.height),
          handHeight: hand.height,
        };
      });
      for (const d of [...m.lefts, ...m.rights]) expect(Math.abs(d), `幅 ${String(width)}: 札の左右が欄と揃う ${JSON.stringify([m.lefts, m.rights])}`).toBeLessThanOrEqual(1);
      for (const h of m.heights) expect(h, `幅 ${String(width)}: 札の高さ`).toBeLessThanOrEqual(8 * 16);
      expect(m.handHeight, `幅 ${String(width)}: 札の並びの高さ`).toBeLessThanOrEqual(1100);
    }
  });
});

test.describe('checkin の札の並びと行', () => {
  test('Given 6 人が 2 人出した札を出す途中 / When 幅 320・390 で開く / Then 手札は行の右端まで等分で埋まり（#27）、「2 / 6 人が出しました」は席の並びの中央に置かれる（#28）', async ({ page, openPeer }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    const url = await openCheckinTool(page, 'ホスト');
    const peers: Page[] = [];
    for (const n of ['ながいなまえのさんかしゃでございますよろしくおねがいします', 'さとう', 'すずき', 'たかはし', 'いとう']) {
      const p = await (openPeer as OpenPeer)(`checkin-${peers.length}`);
      await joinCheckinTool(p.page, url, n);
      peers.push(p.page);
    }
    await chooseMethod(page, 'チェックイン', '今日の天気');
    await handCard(page, '晴れ').click();
    await handCard(peers[0]!, 'くもり').click();
    await expect(page.locator('.seat-count')).toContainText('2 / 6');
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const m = await page.evaluate(() => {
        const hand = document.querySelector('.hand')?.getBoundingClientRect();
        const list = document.querySelector('.seat-list')?.getBoundingClientRect();
        const count = document.querySelector('.seat-count > span');
        const cards = [...document.querySelectorAll('.hand .hand-card')].map((el) => el.getBoundingClientRect());
        if (hand === undefined || list === undefined || count === null || cards.length === 0) throw new Error('手札か席が描かれていない（判定が空振りする）');
        const top = cards[0]!.top;
        const firstRow = cards.filter((c) => Math.abs(c.top - top) < 1);
        const rowRight = Math.max(...firstRow.map((c) => c.right));
        const range = document.createRange();
        range.selectNodeContents(count);
        const text = range.getBoundingClientRect();
        return { handRight: hand.right, rowRight, inRow: firstRow.length, listCenter: (list.left + list.right) / 2, textCenter: (text.left + text.right) / 2 };
      });
      expect(m.inRow, `幅 ${String(width)}: 手札は 1 行に 2 枚以上`).toBeGreaterThanOrEqual(2);
      expect(Math.abs(m.handRight - m.rowRight), `幅 ${String(width)}: 手札の 1 行目の右端が並びの右端に揃う`).toBeLessThanOrEqual(1);
      expect(Math.abs(m.listCenter - m.textCenter), `幅 ${String(width)}: 人数の行が席の並びの中央にある`).toBeLessThanOrEqual(2);
    }
  });

  test('Given やり方を選ぶ画面 / When 幅 390・768・1280 で開く / Then どの札の説明も、最後の行は 3 字以上（最後の 1〜2 字だけが落ちない・#30）', async ({ page }) => {
    await openCheckinTool(page, 'ホスト');
    await expect(page.locator('.method-list .method-prompt').first()).toBeVisible();
    for (const width of [390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const lastLines = await page.locator('.method-prompt').evaluateAll((els) =>
        els.flatMap((el) => {
          const node = el.firstChild;
          if (node === null || node.nodeType !== Node.TEXT_NODE) return [];
          const text = node.textContent ?? '';
          const lines = new Map<number, number>();
          for (let i = 0; i < text.length; i++) {
            const range = document.createRange();
            range.setStart(node, i);
            range.setEnd(node, i + 1);
            const rect = range.getClientRects()[0];
            if (rect === undefined) continue;
            const top = Math.round(rect.top);
            lines.set(top, (lines.get(top) ?? 0) + 1);
          }
          const counts = [...lines.entries()].sort(([a], [b]) => a - b).map(([, n]) => n);
          return [{ text: text.slice(0, 12), counts }];
        }),
      );
      expect(lastLines.length, `幅 ${String(width)}: 説明を測れた`).toBeGreaterThan(0);
      for (const { text, counts } of lastLines) {
        if (counts.length > 1) expect(counts[counts.length - 1], `幅 ${String(width)}: 「${text}」の最後の行`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
