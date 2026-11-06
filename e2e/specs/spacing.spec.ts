/**
 * 縦に並ぶブロックの間（余白の持ち主・#553・ADR 0035）。
 *
 * **タグを付けない（`local` 専用）。** 本番のルーム枠を消費して確かめる種類のものではない。
 *
 * 見るのは要素の矩形どうしの間だけ（スクリーンショットの比較は入れない。ADR 0035 決定 4）。
 * 間は「上の要素の下端から下の要素の上端まで」の px で、`--space-3`（12px）・`--space-2`（8px）を下限にする。
 * 全画面への展開は #557。
 */
import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures/test';
import { chooseCard, createRoom as createPokerRoom } from '../support/poker';
import { openRouletteTool } from '../support/roulette';
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

/**
 * 見出し（テキストが `headingText` に完全一致する h2）を持つ見出しの行（`.ui-section-head`）を先に決め、その行の中で
 * `actionLabel` の操作を探して、次のどちらかであることを測る（#553・ADR 0035）。
 *   ① 見出しと同じ行に収まる（操作の上端が見出しを持つ要素の下端より上）
 *   ② 折り返したときは、操作の上端と見出しの下端の間が `--space-2`（8px）±1px で、操作の左端が見出しの左端に揃う（右へ寄せない）
 * 「行の中にあるか」だけでは、操作が見出しから離れて右寄せで下の行に落ちても緑になる。
 * 行を先に決めるので、行の外に同じ名前の操作があっても拾わない（操作が行の外へ出たら「行の中に無い」で赤になる）。
 * 「見出しを持つ要素」は、行の直下の子のうち h2 を含むもの（timer はアイコンと h2 を包む `.section-header-lead`）。
 * 操作は `aria-label` か可視の文字で探し、位置は行の直下の子（操作が塊に入っていれば塊）で測る。
 */
async function expectActionsBelongToHeading(page: Page, headingText: string, actionLabel: string, label: string): Promise<void> {
  const m = await page.evaluate(
    ({ headingText, actionLabel }) => {
      const heading = [...document.querySelectorAll('h2')].find((h) => (h.textContent ?? '').trim() === headingText);
      const row = heading?.closest('.ui-section-head');
      if (heading === undefined || row === null || row === undefined) return { found: 'heading' as const };
      const action = [...row.querySelectorAll('button')].find(
        (b) => b.getAttribute('aria-label') === actionLabel || (b.textContent ?? '').trim() === actionLabel,
      );
      if (action === undefined) return { found: 'action' as const };
      const headBox = [...row.children].find((c) => c.contains(heading)) ?? heading;
      const h = headBox.getBoundingClientRect();
      // 操作が塊（`.roster-panel-head-actions`）に入っているときは、塊の最初のボタンの位置で測る。塊の箱は行の幅いっぱいに広げて
      // 右寄せにもできる（箱の左端は揃うのに、ボタンは右に寄る）ので、見える端は箱でなくボタンで測る
      const group = [...row.children].find((c) => c.contains(action)) ?? action;
      const first = group.matches('button') ? group : (group.querySelector('button') ?? group);
      const a = { top: group.getBoundingClientRect().top, left: first.getBoundingClientRect().left };
      return { found: 'ok' as const, sameLine: a.top < h.bottom - 0.5, below: a.top - h.bottom, leftDelta: a.left - h.left };
    },
    { headingText, actionLabel },
  );
  expect(m.found, `${label}: 見出し「${headingText}」の行の中に操作「${actionLabel}」がある（'heading' は見出しの行が無い・'action' は行の中に操作が無い）`).toBe('ok');
  if (m.found !== 'ok') return;
  if (!m.sameLine) {
    expect(Math.abs(m.below - SPACE_2), `${label}: 折り返した「${actionLabel}」と見出しの間は 8px`).toBeLessThanOrEqual(1);
    expect(Math.abs(m.leftDelta), `${label}: 折り返した「${actionLabel}」の左端は見出しの左端に揃う`).toBeLessThanOrEqual(1);
  }
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
      // 「見学する」は見出しの隣に置く（見出しから操作の面の反対の端まで飛ばさない）。同じ行なら横の間は 24px 以内、
      // 下の行へ落ちたら左端が見出しに揃う
      const next = await page.evaluate(() => {
        const heading = [...document.querySelectorAll('h2')].find((h) => (h.textContent ?? '').startsWith('参加者'));
        const row = heading?.closest('.ui-section-head');
        const button = row?.querySelector('button');
        if (heading === undefined || button === null || button === undefined) return null;
        const h = heading.getBoundingClientRect();
        const b = button.getBoundingClientRect();
        return { sameLine: b.top < h.bottom - 0.5, gap: b.left - h.right, leftDelta: b.left - h.left };
      });
      expect(next, `幅 ${String(width)}: 見出しの行に「見学する」がある`).not.toBeNull();
      if (next!.sameLine) expect(next!.gap, `幅 ${String(width)}: 見出しと「見学する」の横の間`).toBeLessThanOrEqual(2 * SPACE_3);
      else expect(Math.abs(next!.leftDelta), `幅 ${String(width)}: 折り返した「見学する」の左端は見出しの左端に揃う`).toBeLessThanOrEqual(1);
    }
  });

  test('Given poker の記録に空白の無い 40 字の項目名の束 / When 脇（1280）と 320 で開く / Then ポイントの選択は名前と同じ行の右に残り、名前の列が縮む（#553 レビュー）', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await createPokerRoom(page, 'spacing-log');
    await page.getByRole('button', { name: '記録する' }).click();
    await page.locator('.estimate-item-title').first().click();
    await page.locator('.estimate-item-input').fill('T'.repeat(40));
    await page.keyboard.press('Enter');
    await chooseCard(page, '5');
    await page.getByRole('button', { name: '次のアイテムへ' }).click();
    // 閉じた束（名前つき）と、いま開いている束の 2 つ
    await expect(page.locator('.estimate-group')).toHaveCount(2);
    for (const width of [320, 1280] as const) {
      await page.setViewportSize({ width, height: 900 });
      const m = await page.evaluate(() => {
        const head = [...document.querySelectorAll('.estimate-group-head')].find((e) => e.getClientRects().length > 0 && (e.textContent ?? '').includes('TTTT'));
        const name = head?.querySelector('.estimate-group-item');
        const points = head?.querySelector('select');
        if (head === undefined || name === null || name === undefined || points === null || points === undefined) return null;
        const n = name.getBoundingClientRect();
        const p = points.getBoundingClientRect();
        return { sameLine: p.top < n.bottom - 0.5, rightOfName: p.left >= n.right - 1, inside: p.right <= head.getBoundingClientRect().right + 1 };
      });
      expect(m, `幅 ${String(width)}: 束の見出しの行が描かれている`).not.toBeNull();
      expect(m, `幅 ${String(width)}: 名前の右（同じ行）にポイントがあり、行からはみ出さない`).toEqual({ sameLine: true, rightOfName: true, inside: true });
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

  test('Given timer のロビーとセッション（2 人） / When 320・390・1280 で開く / Then 「ランダム」は「参加者」の見出しの行の中で、見出しと同じ行か、見出しの下 8px・左端そろいに置かれる（#553 一覧 #6・#33）', async ({ page, openPeer }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const code = await createTimerRoom(page, 'spacing-timer');
    const guest = await openPeer('spacing-timer-guest');
    await joinAsDriver(guest.page, code, 'ゲスト');
    await expect(page.getByRole('listitem').filter({ hasText: 'ゲスト' })).toBeVisible();
    // ロビー（見出しは「参加者 (n人)」）
    for (const width of [320, 1280] as const) {
      await page.setViewportSize({ width, height: 900 });
      await expectActionsBelongToHeading(page, '参加者 (2人)', 'ドライバー順をランダムに並べ替える', `ロビー 幅 ${String(width)}`);
    }
    await page.getByRole('button', { name: 'セッションを開始' }).click();
    await expect(page.getByRole('timer')).toBeVisible();
    for (const width of [320, 390, 1280] as const) {
      await page.setViewportSize({ width, height: 900 });
      await expectActionsBelongToHeading(page, '参加者', 'ドライバー順をランダムに並べ替える', `セッション 幅 ${String(width)}`);
      await expectActionsBelongToHeading(page, '参加者', '代理参加者を追加', `セッション 幅 ${String(width)}`);
    }
    // 共有メモの「編集」も同じ約束（脇が 22rem の 1280 と、320）
    for (const width of [320, 1280] as const) {
      await page.setViewportSize({ width, height: 900 });
      await expectActionsBelongToHeading(page, '共有メモ', '編集', `共有メモ 幅 ${String(width)}`);
    }
  });

  test('Given roulette のいつものメンツ（組なし） / When 開く / Then 見出しの行・一覧・操作の間は 12px で、空の知らせは gap を取らず、読み上げの対象（表示される要素）として残る（#553）', async ({ page }) => {
    await openRouletteTool(page, 'spacing-roulette');
    for (const width of [320, 1280] as const) {
      await page.setViewportSize({ width, height: 900 });
      const m = await page.evaluate(() => {
        const sec = document.querySelector('.roulette-regulars');
        const head = sec?.querySelector('.roulette-regulars-head');
        const empty = sec?.querySelector('.roulette-regulars-empty');
        const notice = sec?.querySelector('.roulette-regulars-notice');
        const tools = sec?.querySelector('.roulette-regulars-tools');
        if (!sec || !head || !empty || !notice || !tools) return null;
        const r = (e: Element) => e.getBoundingClientRect();
        return {
          headToEmpty: r(empty).top - r(head).bottom,
          emptyToTools: r(tools).top - r(empty).bottom,
          noticeEmpty: (notice.textContent ?? '') === '',
          noticeDisplay: getComputedStyle(notice).display,
          noticeStatus: notice.getAttribute('role'),
        };
      });
      // 空の知らせは読み上げの木に 1 つ残る（`getByRole` は `visibility: hidden`・`hidden`・`aria-hidden` で木から外れたものを数えない）
      await expect(page.locator('.roulette-regulars').getByRole('status'), `幅 ${String(width)}: 空の知らせ（role=status）が読み上げの木に残る`).toHaveCount(1);
      // 見出し（h3）と「この端末だけ」は字の基準線で揃える（字の大きさが違うので、中央揃えだと基準線がずれる）。
      // 各要素の末尾に幅も高さも 0 の inline-block を置くと、その下端が最後の行の基準線になる
      const base = await page.evaluate(() => {
        const h = document.querySelector('.roulette-regulars-head h3');
        const w = document.querySelector('.roulette-regulars-where');
        if (!h || !w) return null;
        const probe = (el: Element): number => {
          const span = document.createElement('span');
          span.style.cssText = 'display:inline-block;width:0;height:0';
          el.append(span);
          const y = span.getBoundingClientRect().bottom;
          span.remove();
          return y;
        };
        const hb = h.getBoundingClientRect();
        const wb = w.getBoundingClientRect();
        return { sameLine: wb.top < hb.bottom - 0.5, delta: probe(h) - probe(w) };
      });
      expect(base, `幅 ${String(width)}: 見出しと「この端末だけ」が描かれている`).not.toBeNull();
      if (base!.sameLine) expect(Math.abs(base!.delta), `幅 ${String(width)}: 見出しと「この端末だけ」の基準線`).toBeLessThanOrEqual(1);
      expect(m, `幅 ${String(width)}: いつものメンツの区画が描かれている`).not.toBeNull();
      expect(m!.noticeEmpty, '知らせは空').toBe(true);
      expect(m!.noticeDisplay, '空の知らせを display: none にしない（ライブリージョンを木に残す）').not.toBe('none');
      expect(m!.noticeStatus).toBe('status');
      expect(Math.abs(m!.headToEmpty - SPACE_3), `幅 ${String(width)}: 見出しの行 → 一覧の間`).toBeLessThanOrEqual(1);
      expect(Math.abs(m!.emptyToTools - SPACE_3), `幅 ${String(width)}: 一覧 → 操作の間（空の知らせの gap を取らない）`).toBeLessThanOrEqual(1);
    }
  });
});
