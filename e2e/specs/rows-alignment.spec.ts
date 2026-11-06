/**
 * 一覧の行の並び（#556・#479 A）。長い名前の行と自分の行が、他の行と同じ並びになる。
 *
 * **タグを付けない（`local` 専用）。** 本番のルーム枠を消費して確かめる種類のものではない。
 * 見るのは要素の矩形だけ（スクリーンショットの比較は入れない）。
 */
import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures/test';
import { addRouletteGuest, openRouletteTool } from '../support/roulette';
import { createRoom as createTimerRoom, driverRoster, joinAsDriver } from '../support/timer';

const WIDTHS = [320, 390, 1280] as const;
/** 全角 28 字（一覧 #7・#15・#20 の再現に使った名前） */
const LONG = 'ながいなまえのさんかしゃでございますよろしくおねがいします';

type OpenPeer = (label: string) => Promise<{ page: Page }>;

interface RowBox { readonly name: string; readonly height: number; readonly tailRight: number }

/** 行ごとに、高さと「末尾の操作の右端」を測る（`tail` は行の中の最後に描かれた操作のセレクタ）。 */
async function measureRows(page: Page, rowSelector: string, tail: string, scope = 'body'): Promise<RowBox[]> {
  return page.evaluate(({ rowSelector, tail, scope }) => {
    const root = document.querySelector(scope)!;
    const rows = [...root.querySelectorAll(rowSelector)].filter((r) => r.getClientRects().length > 0);
    return rows.map((r) => {
      const ends = [...r.querySelectorAll(tail)].filter((t) => t.getClientRects().length > 0);
      const last = ends[ends.length - 1];
      return {
        name: (r.textContent ?? '').trim().slice(0, 40),
        height: r.getBoundingClientRect().height,
        tailRight: last === undefined ? Number.NaN : last.getBoundingClientRect().right,
      };
    });
  }, { rowSelector, tail, scope });
}

/** 自分がまだ輪に入っていなければ入る（作った人は入っていないことがある）。 */
async function joinSelf(page: Page): Promise<void> {
  await page.waitForTimeout(800);
  const join = page.getByRole('button', { name: 'ドライバーに加わる' });
  if (await join.isVisible()) await join.click();
}

test.describe('一覧の行は名前の長さや自分かどうかで並びを変えない', () => {
  test('Given timer のロビー（自分と長い名前の人） / When 3 つの幅で開く / Then 末尾の操作の右端が全行で揃う（#556 一覧 #7）', async ({ page, openPeer }) => {
    const code = await createTimerRoom(page, 'ホスト');
    const peers: OpenPeer = openPeer;
    for (const [i, n] of [LONG, 'さとう'].entries()) {
      const p = await peers(`rows-lobby-${String(i)}`);
      await joinAsDriver(p.page, code, n);
    }
    await joinSelf(page);
    await expect(page.locator('.lobby-participant')).toHaveCount(3);
    await expect(page.locator('.lobby-participant-badge-driver')).toHaveCount(3);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      const rows = await measureRows(page, '.lobby-participant', '.lobby-row-icon-button');
      expect(rows.length, `幅 ${String(width)}: 行`).toBe(3);
      const rights = rows.map((r) => Math.round(r.tailRight));
      expect(new Set(rights).size, `幅 ${String(width)}: 末尾の操作の右端 ${rights.join(',')}`).toBe(1);
      // 長い名前の他人の行と短い名前の他人の行は同じ高さ
      const [, long, short] = rows;
      expect(Math.abs(long!.height - short!.height), `幅 ${String(width)}: 他人の行の高さ`).toBeLessThanOrEqual(1);
    }
  });

  test('Given timer のセッションの名簿（長い名前の人） / When 3 つの幅で開く / Then 長い名前の行は短い名前の行より名前 1 行ぶんしか高くならず、操作の右端が揃う（#556 一覧 #15）', async ({ page, openPeer }) => {
    const code = await createTimerRoom(page, 'ホスト');
    for (const [i, n] of [LONG, 'さとう'].entries()) {
      const p = await openPeer(`rows-roster-${String(i)}`);
      await joinAsDriver(p.page, code, n);
    }
    await joinSelf(page);
    await expect(page.locator('.lobby-participant-badge-driver')).toHaveCount(3);
    await page.getByRole('button', { name: 'セッションを開始' }).click();
    await expect(driverRoster(page)).toBeVisible();
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      const rows = await measureRows(page, '.roster-panel-row', '.roster-panel-icon-actions button', '[aria-label="ドライバー一覧"]');
      expect(rows.length, `幅 ${String(width)}: 行`).toBe(3);
      const long = rows.find((r) => r.name.includes('ながい'))!;
      const short = rows.find((r) => r.name.includes('さとう'))!;
      expect(long.height - short.height, `幅 ${String(width)}: 長い名前の行が高くなる量（名前 1 行ぶん以内）`).toBeLessThanOrEqual(30);
      expect(Math.round(long.tailRight), `幅 ${String(width)}: 操作の右端`).toBe(Math.round(short.tailRight));
    }
  });

  test('Given roulette の入る人（長い名前を含む） / When 3 つの幅で開く / Then 全行が同じ高さで、「名前を消す」の右端が揃う（#556 一覧 #20）', async ({ page }) => {
    await openRouletteTool(page, 'ホスト');
    for (const n of [LONG, 'さとう', 'すずき']) await addRouletteGuest(page, n);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      const rows = await measureRows(page, '.roulette-row', '.roulette-row-tail button');
      expect(rows.length, `幅 ${String(width)}: 行`).toBeGreaterThanOrEqual(4);
      const heights = rows.map((r) => Math.round(r.height));
      expect(Math.max(...heights) - Math.min(...heights), `幅 ${String(width)}: 行の高さ ${heights.join(',')}`).toBeLessThanOrEqual(24);
      const long = rows.find((r) => r.name.includes('ながい'))!;
      const short = rows.find((r) => r.name.includes('さとう'))!;
      expect(long.height - short.height, `幅 ${String(width)}: 長い名前の行の高さ`).toBeLessThanOrEqual(24);
      expect(Math.round(long.tailRight), `幅 ${String(width)}: 末尾の操作の右端`).toBe(Math.round(short.tailRight));
    }
  });

  test('Given timer のロビーの状態の帯 / When 4 つの幅で開く / Then 帯の中の目の順（行ごとに左から右）が DOM の順（読み上げ・Tab の順）と同じ（#556 一覧 #14・WCAG 1.3.2・2.4.3）', async ({ page }) => {
    await createTimerRoom(page, 'ホスト');
    await expect(page.getByRole('status', { name: 'ステータス情報' })).toBeVisible();
    for (const width of [320, 390, 768, 1280] as const) {
      await page.setViewportSize({ width, height: 900 });
      const items = await page.evaluate(() => {
        const strip = document.querySelector('[aria-label="ステータス情報"]')!;
        return [...strip.children].map((c) => {
          const r = c.getBoundingClientRect();
          return { text: (c.textContent ?? '').trim().slice(0, 12), top: r.top, left: r.left, height: r.height };
        });
      });
      expect(items.length, `幅 ${String(width)}: 帯の項目`).toBeGreaterThanOrEqual(4);
      // 目の順: 上端が行の高さの半分以内なら同じ行として左から右。DOM の順と一致する
      const visual = [...items.keys()].sort((a, b) => {
        const A = items[a]!, B = items[b]!;
        return Math.abs(A.top - B.top) < A.height / 2 ? A.left - B.left : A.top - B.top;
      });
      expect(visual, `幅 ${String(width)}: 目の順 ${visual.map((i) => items[i]!.text).join(' / ')}`).toEqual([...items.keys()]);
      // 押せるもの（通知）は Tab で届き、帯の最後に目でも並ぶ
      await page.locator('body').click({ position: { x: 1, y: 1 } });
      const notify = page.getByRole('button', { name: '通知設定' });
      await notify.focus();
      const box = await notify.boundingBox();
      const last = items[items.length - 1]!;
      expect(box!.y, `幅 ${String(width)}: 通知は最後の項目の行にある`).toBeGreaterThanOrEqual(last.top - last.height);
      expect(box!.x + box!.width, `幅 ${String(width)}: 通知は帯の右端寄り`).toBeGreaterThan(last.left);
    }
  });

  test('Given timer のロビーのカード / When 2 つの幅で開く / Then 見出しの行の下端から中身の上端までの間は 16px（親の gap が持ち、以前の margin-bottom と同じ見た目・#556）', async ({ page, openPeer }) => {
    const code = await createTimerRoom(page, 'ホスト');
    const guest = await openPeer('rows-gap');
    await joinAsDriver(guest.page, code, 'ゲスト');
    await joinSelf(page);
    await expect(page.locator('.lobby-participant')).toHaveCount(2);
    for (const width of [320, 1280] as const) {
      await page.setViewportSize({ width, height: 900 });
      const gaps = await page.evaluate(() => [...document.querySelectorAll('.section-header')].filter((h) => h.getClientRects().length > 0).map((h) => {
        const next = h.nextElementSibling!;
        return { title: (h.querySelector('h2')?.textContent ?? '').trim(), gap: next.getBoundingClientRect().top - h.getBoundingClientRect().bottom };
      }));
      expect(gaps.length, `幅 ${String(width)}: 見出しの行`).toBeGreaterThanOrEqual(4);
      for (const g of gaps) expect(Math.abs(g.gap - 16), `幅 ${String(width)}: 「${g.title}」の下の間`).toBeLessThanOrEqual(1);
    }
  });
});
