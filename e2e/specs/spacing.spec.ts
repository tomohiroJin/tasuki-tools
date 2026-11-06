/**
 * 縦に並ぶブロックの間（余白の持ち主・#553・ADR 0034）。
 *
 * **タグを付けない（`local` 専用）。** 本番のルーム枠を消費して確かめる種類のものではない。
 *
 * 見るのは要素の矩形どうしの間だけ（スクリーンショットの比較は入れない。ADR 0034 決定 4）。
 * 間は「上の要素の下端から下の要素の上端まで」の px で、`--space-3`（12px）・`--space-2`（8px）を下限にする。
 * 全画面への展開は #557。
 */
import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures/test';
import { createRoom as createPokerRoom } from '../support/poker';
import { createRoom as createTimerRoom, joinAsDriver } from '../support/timer';
import { joinTopicTool, setTopic } from '../support/topic';

const WIDTHS = [320, 390, 768, 1280, 1920] as const;
/** `--space-3`（0.75rem）。区画の中のブロックどうしの間の最低限。 */
const SPACE_3 = 12;
/** `--space-2`（0.5rem）。ブロックの中の要素どうしの間の最低限。 */
const SPACE_2 = 8;

type OpenPeer = (label: string) => Promise<{ page: Page }>;

/** 見出し（h2）が `text` を含む行（見出しの親）の下端から、同じ区画の `selector` の上端までの距離。 */
async function gapBelowHeadingRow(page: Page, headingText: string, selector: string): Promise<number> {
  return page.evaluate(
    ({ headingText, selector }) => {
      const heading = [...document.querySelectorAll('h2')].find((h) => (h.textContent ?? '').includes(headingText));
      if (heading === undefined) throw new Error(`見出し「${headingText}」が無い（判定が空振りする）`);
      const row = heading.parentElement;
      const section = row?.parentElement;
      const target = section?.querySelector(selector);
      if (row === null || row === undefined || target === null || target === undefined) {
        throw new Error(`見出しの行の下に ${selector} が無い（判定が空振りする）`);
      }
      return target.getBoundingClientRect().top - row.getBoundingClientRect().bottom;
    },
    { headingText, selector },
  );
}

/** 読む面（本文か 3 行の写しのうち、いま描かれている方）で、隣り合う段落どうしの間を全部返す。 */
async function paragraphGaps(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const root = [...document.querySelectorAll('.ui-reader-body, .ui-reader-preview')].find((el) => el.getClientRects().length > 0);
    if (root === undefined) throw new Error('読む面が描かれていない（判定が空振りする）');
    const paragraphs = [...root.querySelectorAll('.ui-md > .ui-md-p')];
    const gaps: number[] = [];
    for (let i = 1; i < paragraphs.length; i++) {
      gaps.push(paragraphs[i]!.getBoundingClientRect().top - paragraphs[i - 1]!.getBoundingClientRect().bottom);
    }
    return gaps;
  });
}

test.describe('縦に並ぶブロックの間は親が持つ', () => {
  test('Given poker のルーム / When 5 つの幅で開く / Then 「参加者」の見出しの行の下端と札の並びの上端の間は 12px 以上（#553 一覧 #1）', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await createPokerRoom(page, 'spacing-a');
    await expect(page.locator('.participants li').first()).toBeVisible();
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      const gap = await gapBelowHeadingRow(page, '参加者', '.participants');
      expect(gap, `幅 ${String(width)}: 見出しの行と札の並びの間`).toBeGreaterThanOrEqual(SPACE_3);
    }
  });

  test('Given poker の読む面に段落が 3 つ / When 5 つの幅で開く / Then 段落どうしの間は 8px 以上（#553 一覧 #3）', async ({ page, openPeer }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const url = await createPokerRoom(page, 'spacing-b');
    const topic = await (openPeer as OpenPeer)('spacing-topic');
    await joinTopicTool(topic.page, url, 'spacing-t');
    await setTopic(topic.page, 'Spacing', ['一つ目の段落です。', '二つ目の段落です。', '三つ目の段落です。'].join('\n\n'));
    await expect(page.getByRole('region', { name: 'お題', exact: true })).toBeVisible();
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      // 列が広がる移り変わり（0.32 秒）が終わるのを待つ
      await page.waitForTimeout(500);
      const gaps = await paragraphGaps(page);
      expect(gaps.length, `幅 ${String(width)}: 段落の間を測れた`).toBeGreaterThanOrEqual(1);
      for (const gap of gaps) {
        expect(gap, `幅 ${String(width)}: 段落どうしの間`).toBeGreaterThanOrEqual(SPACE_2);
      }
    }
  });

  test('Given timer のセッション（2 人） / When 開く / Then 「ランダム」は「参加者」の見出しの行の中に、「編集」は「共有メモ」の見出しと同じ行にある（#553 一覧 #6・#18）', async ({ page, openPeer }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const code = await createTimerRoom(page, 'spacing-timer');
    const guest = await openPeer('spacing-timer-guest');
    await joinAsDriver(guest.page, code, 'ゲスト');
    await expect(page.getByRole('listitem').filter({ hasText: 'ゲスト' })).toBeVisible();
    await page.getByRole('button', { name: 'セッションを開始' }).click();
    await expect(page.getByRole('timer')).toBeVisible();
    for (const width of [1280, 390] as const) {
      await page.setViewportSize({ width, height: 900 });
      const inside = await page.evaluate(() => {
        const heading = [...document.querySelectorAll('h2')].find((h) => (h.textContent ?? '').trim() === '参加者');
        const row = heading?.parentElement?.parentElement;
        const shuffle = [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'ドライバー順をランダムに並べ替える');
        if (heading === undefined || row === null || row === undefined || shuffle === undefined) return null;
        const r = row.getBoundingClientRect();
        const s = shuffle.getBoundingClientRect();
        return { contained: row.contains(shuffle), top: s.top >= r.top - 0.5, bottom: s.bottom <= r.bottom + 0.5 };
      });
      expect(inside, `幅 ${String(width)}: 「参加者」の見出しと「ランダム」が描かれている`).not.toBeNull();
      expect(inside, `幅 ${String(width)}: 「ランダム」は見出しの行の中`).toEqual({ contained: true, top: true, bottom: true });
      // 共有メモの「編集」も見出しの行の中にあり、見出しと同じ行（下の行へ落ちていない）に並ぶ（一覧 #18）。脇が 22rem の幅（1280）で測る
      if (width === 1280) {
        const memo = await page.evaluate(() => {
          const heading = [...document.querySelectorAll('h2')].find((h) => (h.textContent ?? '').includes('共有メモ'));
          const row = heading?.closest('.ui-section-head');
          const edit = [...document.querySelectorAll('button')].find((b) => (b.textContent ?? '').trim() === '編集');
          if (heading === undefined || row === null || row === undefined || edit === undefined) return null;
          const h = heading.getBoundingClientRect();
          const e = edit.getBoundingClientRect();
          return { contained: row.contains(edit), sameLine: e.top < h.bottom };
        });
        expect(memo, '共有メモの見出しと「編集」が描かれている').not.toBeNull();
        expect(memo, '「編集」は見出しの行の中で、見出しと同じ行').toEqual({ contained: true, sameLine: true });
      }
    }
  });
});
