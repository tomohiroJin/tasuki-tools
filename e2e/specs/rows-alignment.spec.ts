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
});
