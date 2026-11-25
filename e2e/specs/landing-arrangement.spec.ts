/**
 * 玄関の選択画面の並び（#684 の札・#673 の札の下）。
 *
 * **タグを付けない（`local` 専用）。** 本番のルーム枠を消費して確かめる種類のものではない。
 *
 * 見るのは要素の矩形どうしの関係だけ（画像の比較は入れない。ADR 0034 決定 4）。
 *
 * - 札: 最後の段だけ 1 枚に余らない（段の差は 1 枚以内）・短い段は中央・640px 以上は 2 列以上・
 *   扇では段の両端だけが傾く・**枚数を変えても同じ規則**（枚数ごとの決め打ちが無い）
 * - 札の下: 参加者と招待は段と高さが揃い、合言葉はその下に全幅でたたまれ、「記録を見る」は右端に揃う。
 *   合言葉を開いても上の 2 枚は動かない
 */
import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures/test';

/** 幅と、その幅で 1 段に並ぶ札の最大の枚数・札が縦長（扇）か。段の境目（40rem・64rem）の 1px 手前も測る。 */
const WIDTHS: readonly { width: number; maxPerRow: number; fan: boolean }[] = [
  { width: 320, maxPerRow: 1, fan: false },
  { width: 390, maxPerRow: 1, fan: false },
  { width: 639, maxPerRow: 1, fan: false },
  { width: 640, maxPerRow: 2, fan: false },
  { width: 768, maxPerRow: 2, fan: false },
  { width: 1023, maxPerRow: 2, fan: false },
  { width: 1024, maxPerRow: 3, fan: false },
  { width: 1280, maxPerRow: 4, fan: true },
  { width: 1920, maxPerRow: 4, fan: true },
];

/** 幅を変えた直後の移り変わり（配る動き・傾きの戻り）が終わるまで待つ（`card-rows.spec.ts` の `settle` と同じ待ち方）。 */
async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined)));
  });
}

/**
 * 段の割り方の期待値。**画面の実装（`apps/landing/src/hand-rows.ts`）を読まずに、ここで独立に出す**
 * （同じ関数を使うと、関数が壊れても両方が同じに壊れて緑になる）。段の数は要る分だけ・差は 1 枚以内・多い段が先。
 */
function expectedRows(count: number, maxPerRow: number): number[] {
  const rows: number[] = [];
  const rowCount = Math.ceil(count / maxPerRow);
  let left = count;
  for (let r = rowCount; r > 0; r -= 1) {
    const size = Math.ceil(left / r);
    rows.push(size);
    left -= size;
  }
  return rows;
}

interface HandMetrics {
  /** 段ごとの枚数（上から） */
  rows: number[];
  /** 段ごとの、並びの箱の左端からの空きと右端までの空き（px） */
  gaps: { left: number; right: number }[];
  /** 札ごとに、傾いているか（並び順） */
  tilted: boolean[];
  /** 札の（傾ける前の）幅と高さ */
  cardWidths: number[];
  cardHeights: number[];
  handHeight: number;
  overflow: number;
}

/**
 * 札の並びを測る。**傾ける前の箱（`offset*`）で測る** —— `getBoundingClientRect()` は回転後の外接矩形を返し、
 * 傾いた札の上端が隣とずれて、同じ段の札が別の段に見える。
 */
async function handMetrics(page: Page): Promise<HandMetrics> {
  return page.evaluate(() => {
    const hand = document.querySelector<HTMLElement>('.hub-tools .hand');
    const items = [...document.querySelectorAll<HTMLElement>('.hub-tools .hand > li')];
    if (hand === null || items.length === 0) throw new Error('札が描かれていない（判定が空振りする）');
    const handBox = hand.getBoundingClientRect();
    const boxes = items.map((li) => {
      const card = li.querySelector<HTMLElement>('.tool-card');
      if (card === null) throw new Error('札の中身が無い');
      // li は傾けない（傾くのは中の札）。配る動きが終わった後なので、li の矩形は置き場所そのもの
      const r = li.getBoundingClientRect();
      return { top: Math.round(r.top), left: r.left, right: r.right, width: card.offsetWidth, height: card.offsetHeight, transform: getComputedStyle(card).transform };
    });
    const tops = [...new Set(boxes.map((b) => b.top))].sort((a, b) => a - b);
    const rows = tops.map((t) => boxes.filter((b) => b.top === t));
    return {
      rows: rows.map((r) => r.length),
      gaps: rows.map((r) => ({ left: Math.min(...r.map((b) => b.left)) - handBox.left, right: handBox.right - Math.max(...r.map((b) => b.right)) })),
      tilted: boxes.map((b) => b.transform !== 'none' && b.transform !== 'matrix(1, 0, 0, 1, 0, 0)'),
      cardWidths: boxes.map((b) => b.width),
      cardHeights: boxes.map((b) => b.height),
      handHeight: handBox.height,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

/** 段の割り方から、傾くはずの札（段の両端。1 枚だけの段は傾けない）を並び順で出す。 */
function expectedTilts(rows: number[]): boolean[] {
  return rows.flatMap((size) => Array.from({ length: size }, (_, i) => size > 1 && (i === 0 || i === size - 1)));
}

function expectHand(m: HandMetrics, count: number, at: { width: number; maxPerRow: number; fan: boolean }, label: string): void {
  const where = `${label}・幅 ${String(at.width)}`;
  const rows = expectedRows(count, at.maxPerRow);
  expect(m.rows, `${where}: 段ごとの枚数`).toEqual(rows);
  expect(Math.max(...m.rows) - Math.min(...m.rows), `${where}: 段の差は 1 枚以内（最後の段だけ余らない）`).toBeLessThanOrEqual(1);
  for (const [i, gap] of m.gaps.entries()) {
    expect(Math.abs(gap.left - gap.right), `${where}: ${String(i + 1)} 段目は中央（左の空き ${gap.left.toFixed(1)}・右の空き ${gap.right.toFixed(1)}）`).toBeLessThanOrEqual(1.5);
  }
  expect(new Set(m.cardWidths).size, `${where}: 札の幅が揃う ${m.cardWidths.join(',')}`).toBe(1);
  expect(m.tilted, `${where}: 傾く札（扇なら段の両端・それ以外は無し）`).toEqual(at.fan ? expectedTilts(rows) : rows.flatMap((size) => Array.from({ length: size }, () => false)));
  // 扇は縦長の実物大（幅 15rem 以上・縦が横より長い）、それ以外は横長
  const [w, h] = [m.cardWidths[0]!, m.cardHeights[0]!];
  if (at.fan) {
    expect(w, `${where}: 扇の札は実物大（15rem）`).toBeGreaterThanOrEqual(15 * 16 - 1);
    expect(h, `${where}: 扇の札は縦長`).toBeGreaterThan(w);
  } else {
    expect(h, `${where}: 横長の札は 1 枚が低い`).toBeLessThanOrEqual(8 * 16);
  }
  expect(m.overflow, `${where}: 横にはみ出さない`).toBe(0);
}

async function openChoice(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('あなたの名前').fill('ホスト');
  await page.getByRole('button', { name: 'ルームを作る' }).click();
  await expect(page.getByRole('heading', { name: '道具を選ぶ' })).toBeVisible();
  // 手をかざした札は持ち上がって傾きが戻る。測る前にポインタを札の外へ出す
  await page.mouse.move(0, 0);
}

test.describe('landing の道具の札の並び（#684）', () => {
  test('Given 道具を選ぶ画面 / When 幅 320〜1920 で開く / Then 段の差は 1 枚以内で、短い段は中央にあり、640px 以上は 2 列以上で、扇では段の両端だけが傾く', async ({ page }) => {
    await openChoice(page);
    const count = await page.locator('.hub-tools .hand > li').count();
    expect(count).toBeGreaterThan(0);
    for (const at of WIDTHS) {
      await page.setViewportSize({ width: at.width, height: 900 });
      await settle(page);
      const m = await handMetrics(page);
      expectHand(m, count, at, `${String(count)} 枚`);
      if (at.width >= 640) {
        expect(Math.max(...m.rows), `幅 ${String(at.width)}: 640px 以上は 2 列以上`).toBeGreaterThanOrEqual(Math.min(2, count));
        // 縦長の札を 1 列に積むと札だけで 2400px を超えた。横長と扇なら 2 画面（900px × 2）に収まる
        expect(m.handHeight, `幅 ${String(at.width)}: 札の並びの高さ`).toBeLessThanOrEqual(800);
      }
    }
  });

  test('Given 札を 1 枚足した・減らした・5 枚・9 枚にした並び / When 幅 640・1024・1280 で開く / Then 同じ規則で段が割れる（枚数ごとの決め打ちが無い）', async ({ page }) => {
    await openChoice(page);
    const original = await page.locator('.hub-tools .hand > li').count();
    for (const count of [original + 1, original - 1, 5, 9]) {
      // 画面が札ごとに付ける置き場所（始まりの列・段の端）を、枚数を変えて付け直す。割り方はここで独立に出す
      await page.evaluate(({ count, plans }) => {
        const hand = document.querySelector<HTMLElement>('.hub-tools .hand');
        if (hand === null) throw new Error('札の並びが無い');
        while (hand.children.length > count) hand.lastElementChild?.remove();
        while (hand.children.length < count) hand.append(hand.lastElementChild!.cloneNode(true));
        const items = [...hand.children] as HTMLElement[];
        for (const li of items) {
          li.removeAttribute('data-row-edge');
          for (const max of [2, 3, 4]) li.style.removeProperty(`--hand-start-${String(max)}`);
        }
        for (const { max, rows } of plans) {
          let i = 0;
          for (const size of rows) {
            items[i]!.style.setProperty(`--hand-start-${String(max)}`, String(max - size + 1));
            if (max === 4 && size > 1) {
              items[i]!.setAttribute('data-row-edge', 'start');
              items[i + size - 1]!.setAttribute('data-row-edge', 'end');
            }
            i += size;
          }
        }
      }, { count, plans: [2, 3, 4].map((max) => ({ max, rows: expectedRows(count, max) })) });
      for (const at of WIDTHS.filter((w) => [640, 1024, 1280].includes(w.width))) {
        await page.setViewportSize({ width: at.width, height: 900 });
        await settle(page);
        expectHand(await handMetrics(page), count, at, `${String(count)} 枚に変えた並び`);
      }
    }
  });
});

/** 矩形（**ページの座標**。押すと画面がスクロールするので、画面内の座標で比べると動いていない物が動いて見える）。 */
interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

interface RoomMetrics {
  roster: Box;
  invite: Box;
  passphrase: Box;
  history: Box;
  overflow: number;
}

async function roomMetrics(page: Page): Promise<RoomMetrics> {
  return page.evaluate(() => {
    const box = (el: Element): { left: number; right: number; top: number; bottom: number; width: number; height: number } => {
      const r = el.getBoundingClientRect();
      return { left: r.left + scrollX, right: r.right + scrollX, top: r.top + scrollY, bottom: r.bottom + scrollY, width: r.width, height: r.height };
    };
    const region = (name: string): ReturnType<typeof box> => {
      const heading = [...document.querySelectorAll('.hub-room h2')].find((h) => h.textContent === name);
      const section = heading?.closest('section');
      if (section === null || section === undefined) throw new Error(`「${name}」の区画が無い（判定が空振りする）`);
      return box(section);
    };
    const link = [...document.querySelectorAll('main a')].find((a) => a.textContent?.trim() === '記録を見る');
    if (link === undefined) throw new Error('「記録を見る」が無い');
    return {
      roster: region('参加者'),
      invite: region('仲間を招く'),
      passphrase: region('合言葉'),
      history: box(link),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

test.describe('landing の札の下の並び（#673）', () => {
  test('Given 参加者 3 人の選択画面 / When 幅 320〜1920 で開く / Then 参加者と招待は段と高さが揃い、合言葉はその下に全幅でたたまれ、「記録を見る」は右端に揃う', async ({ page, openPeer }) => {
    await openChoice(page);
    const inviteUrl = await page.getByLabel('参加用 URL').inputValue();
    for (const name of ['ながいなまえのさんかしゃでございますよろしく', 'みさき']) {
      const peer = await openPeer(`arrangement-${name}`);
      await peer.page.goto(inviteUrl);
      await peer.page.getByLabel('あなたの名前').fill(name);
      await peer.page.getByRole('button', { name: '参加する' }).click();
      await expect(peer.page.getByRole('list', { name: 'ツール' })).toBeVisible();
    }
    await expect(page.getByRole('list', { name: '参加者' }).getByRole('listitem')).toHaveCount(3);
    await expect(page.getByRole('button', { name: '設定する' })).toHaveAttribute('aria-expanded', 'false');

    for (const width of [320, 390, 639, 640, 768, 1024, 1280, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await settle(page);
      const m = await roomMetrics(page);
      const where = `幅 ${String(width)}`;
      expect(m.overflow, `${where}: 横にはみ出さない`).toBe(0);
      if (width >= 640) {
        // 2 枚が横に並び、上端・下端が揃う
        expect(Math.abs(m.roster.top - m.invite.top), `${where}: 参加者と招待の上端`).toBeLessThanOrEqual(1);
        expect(Math.abs(m.roster.bottom - m.invite.bottom), `${where}: 参加者と招待の下端`).toBeLessThanOrEqual(1);
        expect(m.invite.left, `${where}: 招待は参加者の右`).toBeGreaterThan(m.roster.right);
        expect(Math.abs(m.roster.width - m.invite.width), `${where}: 2 枚の幅`).toBeLessThanOrEqual(1);
      } else {
        expect(m.invite.top, `${where}: 1 列に積む`).toBeGreaterThanOrEqual(m.roster.bottom);
        expect(Math.abs(m.roster.left - m.invite.left), `${where}: 左端`).toBeLessThanOrEqual(1);
      }
      // 合言葉は 2 枚の下に、左端から右端まで
      expect(m.passphrase.top, `${where}: 合言葉は 2 枚の下`).toBeGreaterThanOrEqual(Math.max(m.roster.bottom, m.invite.bottom));
      expect(Math.abs(m.passphrase.left - m.roster.left), `${where}: 合言葉の左端`).toBeLessThanOrEqual(1);
      expect(Math.abs(m.passphrase.right - m.invite.right), `${where}: 合言葉の右端`).toBeLessThanOrEqual(1);
      // たたんだ合言葉は低い（開いた口は 370px を超えていた）
      expect(m.passphrase.height, `${where}: たたんだ合言葉の高さ`).toBeLessThanOrEqual(width >= 640 ? 130 : 200);
      // 「記録を見る」は合言葉の下で、右端がパネルの右端を越えず、パネルの右半分にある
      expect(m.history.top, `${where}: 記録を見るは合言葉の下`).toBeGreaterThanOrEqual(m.passphrase.bottom);
      expect(m.history.right, `${where}: 記録を見るの右端`).toBeLessThanOrEqual(m.passphrase.right + 1);
      expect(m.history.left, `${where}: 記録を見るは右寄せ`).toBeGreaterThan((m.passphrase.left + m.passphrase.right) / 2);
    }
  });

  test('Given たたんだ合言葉 / When 開く・QR コードを開く / Then 上の 2 枚は動かず、開いた口は読む幅に収まり、QR を開いても 2 枚の下端は揃う', async ({ page }) => {
    await openChoice(page);
    for (const width of [390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await settle(page);
      const where = `幅 ${String(width)}`;
      const before = await roomMetrics(page);
      await page.getByRole('button', { name: '設定する' }).click();
      const input = page.getByLabel('新しい合言葉');
      await expect(input).toBeVisible();
      const opened = await roomMetrics(page);
      expect(opened.roster, `${where}: 合言葉を開いても参加者は動かない`).toEqual(before.roster);
      expect(opened.invite, `${where}: 合言葉を開いても招待は動かない`).toEqual(before.invite);
      expect(opened.passphrase.height, `${where}: 開くと伸びる`).toBeGreaterThan(before.passphrase.height);
      const inputBox = await input.boundingBox();
      expect(inputBox!.width, `${where}: 入力欄は読む幅（32rem）まで`).toBeLessThanOrEqual(32 * 16 + 1);
      expect(inputBox!.x + inputBox!.width, `${where}: 入力欄はパネルの中`).toBeLessThanOrEqual(opened.passphrase.right);
      expect(opened.overflow, `${where}: 横にはみ出さない`).toBe(0);
      await page.getByRole('button', { name: '閉じる' }).click();
      await expect(input).toBeHidden();
      expect((await roomMetrics(page)).passphrase, `${where}: 閉じると元の高さに戻る`).toEqual(before.passphrase);

      await page.getByRole('button', { name: 'QR コードを表示' }).click();
      await expect(page.getByRole('img', { name: '参加用 URL の QR コード' })).toBeVisible();
      const withQr = await roomMetrics(page);
      if (width >= 640) expect(Math.abs(withQr.roster.bottom - withQr.invite.bottom), `${where}: QR を開いても 2 枚の下端が揃う`).toBeLessThanOrEqual(1);
      expect(withQr.passphrase.top, `${where}: 合言葉は QR の下へ送られる（重ならない）`).toBeGreaterThanOrEqual(withQr.invite.bottom);
      expect(withQr.overflow, `${where}: 横にはみ出さない`).toBe(0);
      await page.getByRole('button', { name: 'QR コードを閉じる' }).click();
    }
  });
});
