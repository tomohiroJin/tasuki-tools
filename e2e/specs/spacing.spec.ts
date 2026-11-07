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
import { openAgendaTool } from '../support/agenda';

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
 *   ① 見出しと同じ行に収まる（操作の上端が見出しを持つ要素の下端より上）。`maxGap` を渡したときは、見出しとの横の間の上限も測る
 *   ② 折り返したときは、操作の上端と見出しの下端の間が `--space-2`（8px）±1px で、操作の左端が見出しの左端に揃う（右へ寄せない）
 * 「行の中にあるか」だけでは、操作が見出しから離れて右寄せで下の行に落ちても緑になる。
 * 行を先に決めるので、行の外に同じ名前の操作があっても拾わない（操作が行の外へ出たら「行の中に無い」で赤になる）。
 * 「見出しを持つ要素」は、行の直下の子のうち h2 を含むもの（timer はアイコンと h2 を包む `.section-header-lead`）。
 * 操作は `aria-label` か可視の文字で探し、位置は行の直下の子（操作が塊に入っていれば塊）で測る。
 */
interface BelongOptions {
  /** 同じ行のときの、見出しとの横の間の上限（px） */
  maxGap?: number;
  /** 同じ行のときの、見出しとの横の間の下限（px。`--space-3`＝12px に対して ±1 で、詰まりすぎ（3px など）を捕まえる） */
  minGap?: number;
  /** 折り返さず、必ず見出しと同じ行にあること（広い幅の共有メモの「編集」など） */
  sameLine?: boolean;
  /** 見出しを前方一致で引く（「参加者（3人）」のように人数が付く見出し）。既定は完全一致 */
  prefix?: boolean;
}

async function expectActionsBelongToHeading(page: Page, headingText: string, actionLabel: string, label: string, opts: BelongOptions = {}): Promise<void> {
  const { maxGap, minGap, sameLine: mustSameLine, prefix = false } = opts;
  const m = await page.evaluate(
    ({ headingText, actionLabel, prefix }) => {
      const heading = [...document.querySelectorAll('h2')].find((h) => (prefix ? (h.textContent ?? '').trim().startsWith(headingText) : (h.textContent ?? '').trim() === headingText));
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
      return { found: 'ok' as const, sameLine: a.top < h.bottom - 0.5, below: a.top - h.bottom, leftDelta: a.left - h.left, gap: a.left - h.right };
    },
    { headingText, actionLabel, prefix },
  );
  expect(m.found, `${label}: 見出し「${headingText}」の行の中に操作「${actionLabel}」がある（'heading' は見出しの行が無い・'action' は行の中に操作が無い）`).toBe('ok');
  if (m.found !== 'ok') return;
  // 同じ行なら、操作は見出しの隣にある（見出しから行の反対の端まで離れない）。上限は poker の参加者の欄と同じ 24px
  if (mustSameLine === true) expect(m.sameLine, `${label}: 「${actionLabel}」は見出しと同じ行（折り返さない）`).toBe(true);
  if (m.sameLine && minGap !== undefined) expect(m.gap, `${label}: 見出しと「${actionLabel}」の横の間（下限 ${String(minGap)}px）`).toBeGreaterThanOrEqual(minGap);
  if (m.sameLine && maxGap !== undefined) expect(m.gap, `${label}: 見出しと「${actionLabel}」の横の間（上限 ${String(maxGap)}px）`).toBeLessThanOrEqual(maxGap);
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
      // 「見学する」は見出しの隣に置く（見出しから操作の面の反対の端まで飛ばさない）。同じ行なら横の間は 24px 以内、下の行へ落ちたら見出しの下 8px・左端そろい
      await expectActionsBelongToHeading(page, '参加者', '見学する', `poker 幅 ${String(width)}`, { maxGap: 2 * SPACE_3, prefix: true });
    }
  });

  test('Given poker の記録に 40 字の名前の束（ポイントなし）と「A」の束（13） / When 320〜1920 で開く / Then 選択欄の字は切れず、1 行に収まる名前は同じ行・収まらない名前は選択欄が下の行の右端、束の見出しと回の記録の間は 8px（#553 レビュー）', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await createPokerRoom(page, 'spacing-log');
    await page.getByRole('button', { name: '記録する' }).click();
    for (const name of ['T'.repeat(40), 'A']) {
      // いま開いている束の名前の欄（閉じた束の中の名前は `.estimate-item--inline`）
      await page.locator('.estimate-item:not(.estimate-item--inline) .estimate-item-title').first().click();
      await page.locator('.estimate-item:not(.estimate-item--inline) .estimate-item-input').fill(name);
      await page.keyboard.press('Enter');
      await chooseCard(page, '5');
      await page.getByRole('button', { name: '次のアイテムへ' }).click();
    }
    // 閉じた束が 2 つ（見えているのは脇の記録。足の記録は幅によって隠れる）
    await expect(page.locator('.estimate-group:visible')).toHaveCount(2);
    // 「A」の束にポイント 13 を付ける（字の幅の違う選択肢で、切れを測る）
    await page.locator('.estimate-group:visible', { hasText: 'アイテム名を変えるA' }).locator('select').first().selectOption('13');
    for (const width of [320, 390, 768, 1024, 1280, 1920] as const) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.locator('.estimate-group-head:visible', { hasText: 'TTTT' }).first(), `幅 ${String(width)}: 束の見出しの行が見える`).toBeVisible();
      for (const key of ['TTTT', 'A'] as const) {
        const m = await page.evaluate((key) => {
          const head = [...document.querySelectorAll('.estimate-group-head')].find(
            (e) => e.getClientRects().length > 0 && (key === 'A' ? e.querySelector('input,button')?.textContent === 'A' || (e.textContent ?? '').trim().startsWith('A') : (e.textContent ?? '').includes(key)),
          );
          const name = head?.querySelector('.estimate-group-item');
          const points = head?.querySelector('select');
          if (head === undefined || name === null || name === undefined || points === null || points === undefined) return null;
          const n = name.getBoundingClientRect();
          const p = points.getBoundingClientRect();
          const h = head.getBoundingClientRect();
          // 選択欄の自然な幅（字・左右の padding・枠・矢印を含む）: 同じ規則の複製を、制約なし（flex: none・上限なし・幅は内容）で置いて測る
          const probe = points.cloneNode(true) as HTMLSelectElement;
          probe.value = (points as HTMLSelectElement).value; // 複製は選択が引き継がれない
          probe.style.cssText = 'position:absolute;visibility:hidden;flex:none;max-inline-size:none;inline-size:max-content;min-width:0;margin:0;';
          points.parentElement!.append(probe);
          const natural = probe.getBoundingClientRect().width;
          probe.remove();
          // 名前の行数: 名前の字（テキスト）の矩形の上端を数える（ボタンの箱・padding を数えない）
          const tops = new Set<number>();
          const walker = document.createTreeWalker(name, NodeFilter.SHOW_TEXT);
          for (let t = walker.nextNode(); t !== null; t = walker.nextNode()) {
            if ((t.textContent ?? '').trim() === '') continue;
            const range = document.createRange();
            range.selectNodeContents(t);
            for (const r of Array.from(range.getClientRects())) if (r.width > 0 && r.height > 0) tops.add(Math.round(r.top / 4));
          }
          const next = head.nextElementSibling?.getBoundingClientRect();
          return {
            sameLine: p.top < n.bottom - 0.5,
            topDelta: p.top - n.top,
            nameLines: tops.size,
            rightEdgeGap: h.right - p.right,
            selectWidth: p.width,
            natural,
            inside: p.right <= h.right + 1 && p.left >= h.left - 1,
            below: next === undefined ? null : next.top - h.bottom,
            value: (points as HTMLSelectElement).selectedOptions[0]?.textContent ?? '',
          };
        }, key);
        const label = `幅 ${String(width)}・${key === 'A' ? '「A」の束（13）' : '40 字の束（ポイントなし）'}`;
        expect(m, `${label}: 束の見出しの行が描かれている`).not.toBeNull();
        // ① 選択欄の字が切れていない: 選択欄の幅が、選んだ選択肢の字・padding・枠・矢印を足した自然な幅以上
        expect(m!.selectWidth, `${label}: 選択欄（${m!.value}）の幅が自然な幅（${m!.natural.toFixed(1)}px）以上`).toBeGreaterThanOrEqual(m!.natural - 1);
        expect(m!.inside, `${label}: 選択欄は行の中に収まる`).toBe(true);
        if (key === 'A') {
          // ② 1 行に収まる短い名前は、どの幅でも同じ行（選択欄の上端が名前の上端と揃う）
          expect(m!.sameLine, `${label}: 短い名前は選択欄と同じ行`).toBe(true);
          expect(Math.abs(m!.topDelta), `${label}: 選択欄の上端が名前の上端と揃う`).toBeLessThanOrEqual(8);
        } else if (m!.sameLine) {
          // 収まる幅では同じ行（名前は 1 行）
          expect(m!.nameLines, `${label}: 同じ行のときは名前が 1 行`).toBe(1);
        } else {
          // 収まらない幅では、選択欄が名前の下の行の右端に落ちる（左端には落とさない）
          expect(Math.abs(m!.rightEdgeGap), `${label}: 落ちた選択欄の右端は行の右端に揃う`).toBeLessThanOrEqual(1);
        }
        // ③ 名前は 4 行以下（9 行に戻らない）
        expect(m!.nameLines, `${label}: 名前の行数`).toBeLessThanOrEqual(4);
        // ④ 束の見出しの行と、回の記録の間は --space-2（8px）
        if (m!.below !== null) expect(Math.abs(m!.below - SPACE_2), `${label}: 見出しの行と回の記録の間`).toBeLessThanOrEqual(1);
      }
    }
  });

  test('Given poker の記録の閉じた束（短い名前「A」と 40 字の名前） / When 名前の変更を始める（ボタンが入力に替わる） / Then 選択欄の行は変わらない（切り替えで行が跳ばない）（#553 レビュー）', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await createPokerRoom(page, 'spacing-rename');
    await page.getByRole('button', { name: '記録する' }).click();
    // 長い名前は幅の広い字（W）で、320 では見えない複製が 3 行以上に折れる（入力が伸びないことを測るため）
    const names = { short: 'A', long: 'W'.repeat(40) } as const;
    for (const name of Object.values(names)) {
      await page.locator('.estimate-item:not(.estimate-item--inline) .estimate-item-title').first().click();
      await page.locator('.estimate-item:not(.estimate-item--inline) .estimate-item-input').fill(name);
      await page.keyboard.press('Enter');
      await chooseCard(page, '5');
      await page.getByRole('button', { name: '次のアイテムへ' }).click();
    }
    const row = async (key: string): Promise<{ sameLine: boolean; top: number; left: number } | null> =>
      page.evaluate((key) => {
        const head = [...document.querySelectorAll('.estimate-group-head')].find(
          (e) => e.getClientRects().length > 0 && (e.querySelector('.estimate-item-title, .estimate-item-input') as HTMLElement | null) !== null
            && ((e.querySelector('.estimate-item-title') as HTMLElement | null)?.textContent === key || (e.querySelector('.estimate-item-input') as HTMLInputElement | null)?.value === key),
        );
        const name = head?.querySelector('.estimate-group-item');
        const points = head?.querySelector('select');
        if (!head || !name || !points) return null;
        const n = name.getBoundingClientRect();
        const p = points.getBoundingClientRect();
        return { sameLine: p.top < n.bottom - 0.5, top: Math.round(p.top - head.getBoundingClientRect().top), left: Math.round(p.left) };
      }, key);
    for (const width of [320, 390, 1280] as const) {
      await page.setViewportSize({ width, height: 900 });
      for (const [kind, name] of Object.entries(names)) {
        const title = page.locator('.estimate-group-head:visible .estimate-item--inline .estimate-item-title', { hasText: name }).first();
        await expect(title, `幅 ${String(width)}・${kind}: 名前のボタンが見える`).toBeVisible();
        const before = await row(name);
        expect(before, `幅 ${String(width)}・${kind}: 閉じた束の見出しの行がある`).not.toBeNull();
        await title.click();
        const input = page.locator('.estimate-group-head:visible .estimate-item--inline .estimate-item-input').first();
        await expect(input, `幅 ${String(width)}・${kind}: 入力に替わった`).toBeVisible();
        const after = await row(name);
        expect(after, `幅 ${String(width)}・${kind}: 変更中も見出しの行がある`).not.toBeNull();
        // 入力は包み（名前の列）いっぱいに広がる: 幅が包みと 1px 以内でそろい、320 でも 5rem（80px）以上ある（18px に潰れない）。短い名前は選択欄と同じ行に残すので、320 の包みは 85px ほどで、8rem（128px）は取れない（実測）
        const box = async (): Promise<{ input: number; wrap: number }> =>
          input.evaluate((el) => ({ input: el.getBoundingClientRect().width, wrap: (el.closest('.estimate-item--inline') as HTMLElement).getBoundingClientRect().width }));
        const w0 = await box();
        expect(Math.abs(w0.input - w0.wrap), `幅 ${String(width)}・${kind}: 入力の幅が包みの幅と 1px 以内でそろう`).toBeLessThanOrEqual(1);
        expect(w0.input, `幅 ${String(width)}・${kind}: 入力の幅が 5rem 以上`).toBeGreaterThanOrEqual(80);
        // 入力は 1 行の高さ（押せる大きさ以上・48px 以下）で、包みの上端にそろう（見えない複製が何行に折れても伸びない）
        const hb = await input.evaluate((el) => ({ h: el.getBoundingClientRect().height, dTop: el.getBoundingClientRect().top - (el.closest('.estimate-item--inline') as HTMLElement).getBoundingClientRect().top }));
        expect(hb.h, `幅 ${String(width)}・${kind}: 入力の高さは 1 行（44〜48px）`).toBeGreaterThanOrEqual(44);
        expect(hb.h, `幅 ${String(width)}・${kind}: 入力の高さは 1 行（44〜48px）`).toBeLessThanOrEqual(48);
        expect(Math.abs(hb.dTop), `幅 ${String(width)}・${kind}: 入力は包みの上端にそろう`).toBeLessThanOrEqual(1);
        // 打って名前を 40 字に伸ばしても、入力の幅も選択欄の行も変わらない（字は入力の中で送られる）
        await input.fill('Z'.repeat(40));
        const w1 = await box();
        expect(Math.abs(w1.input - w0.input), `幅 ${String(width)}・${kind}: 40 字を打っても入力の幅が変わらない`).toBeLessThanOrEqual(1);
        const typed = await row('Z'.repeat(40));
        expect(typed, `幅 ${String(width)}・${kind}: 打った後も見出しの行がある`).not.toBeNull();
        expect(typed!.sameLine, `幅 ${String(width)}・${kind}: 40 字を打っても選択欄の行が変わらない`).toBe(before!.sameLine);
        expect(Math.abs(typed!.top - before!.top), `幅 ${String(width)}・${kind}: 40 字を打っても選択欄の縦の位置が変わらない`).toBeLessThan(12);
        // 行が同じ（短い名前は同じ行のまま・長い名前は下の行のまま）。選択欄の位置も同じ（ボタンと入力で名前の列の幅が同じ）
        expect(after!.sameLine, `幅 ${String(width)}・${kind}: 変更の前後で選択欄の行（同じ行か下の行か）が変わらない`).toBe(before!.sameLine);
        expect(Math.abs(after!.top - before!.top), `幅 ${String(width)}・${kind}: 選択欄の縦の位置が変わらない`).toBeLessThan(12);
        expect(Math.abs(after!.left - before!.left), `幅 ${String(width)}・${kind}: 選択欄の横の位置が変わらない`).toBeLessThanOrEqual(1);
        await page.keyboard.press('Escape');
      }
    }
  });

  test('Given poker の記録の開いた束（40 字の名前） / When 320〜1280 で開く / Then 「見積もり中」は名前と同じ行か、下の行の右端にある（左端へ落ちない）（#553）', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await createPokerRoom(page, 'spacing-open');
    await page.getByRole('button', { name: '記録する' }).click();
    await page.locator('.estimate-item:not(.estimate-item--inline) .estimate-item-title').first().click();
    await page.locator('.estimate-item:not(.estimate-item--inline) .estimate-item-input').fill('T'.repeat(40));
    await page.keyboard.press('Enter');
    // 票を出して開票すると、開いた束（名前は 40 字）ができる（次のアイテムへ進むまで開いている）
    await chooseCard(page, '5');
    for (const width of [320, 390, 768, 1280] as const) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.locator('.estimate-group-head:visible .estimate-group-open').first(), `幅 ${String(width)}: 開いた束の「見積もり中」が見える`).toBeVisible();
      const m = await page.evaluate(() => {
        const open = [...document.querySelectorAll('.estimate-group-open')].find((e) => e.getClientRects().length > 0)!;
        const head = open.closest('.estimate-group-head')!;
        const name = head.querySelector('.estimate-group-item')!;
        const o = open.getBoundingClientRect();
        const n = name.getBoundingClientRect();
        return { sameLine: o.top < n.bottom - 0.5, rightGap: head.getBoundingClientRect().right - o.right };
      });
      if (!m.sameLine) expect(Math.abs(m.rightGap), `幅 ${String(width)}: 落ちた「見積もり中」の右端は行の右端に揃う`).toBeLessThanOrEqual(1);
    }
  });

  test('Given agenda の保存した流れに空白の無い 40 字の名前 / When 320〜1280 で開く / Then 横に溢れない（一覧は .ui-stack--tight で、名前の列が縮む）（#553）', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openAgendaTool(page, 'spacing-agenda');
    await page.getByRole('button', { name: 'サンプルから選ぶ', exact: true }).click();
    await page.getByRole('button', { name: /サンプル：KPT のふりかえり/ }).click();
    await page.getByLabel('保存する名前').fill('W'.repeat(40));
    await page.getByRole('button', { name: 'この端末に保存' }).click();
    const list = page.getByRole('list', { name: '保存済み' });
    await expect(list.getByRole('listitem')).toHaveCount(1);
    for (const width of [320, 390, 1024, 1280] as const) {
      await page.setViewportSize({ width, height: 900 });
      await expect(list.getByRole('listitem').first(), `幅 ${String(width)}: 保存済みの行が見える`).toBeVisible();
      const m = await page.evaluate(() => {
        const ul = document.querySelector('.builder-saved-list')!;
        const row = ul.querySelector('li')!.getBoundingClientRect();
        const box = ul.getBoundingClientRect();
        return { scrollWidth: document.documentElement.scrollWidth, innerWidth, rowRight: row.right, listRight: box.right };
      });
      expect(m.scrollWidth, `幅 ${String(width)}: ページが横に溢れない`).toBeLessThanOrEqual(m.innerWidth);
      expect(m.rowRight, `幅 ${String(width)}: 保存済みの行は一覧の幅に収まる`).toBeLessThanOrEqual(m.listRight + 1);
    }
  });

  test('Given roulette のいつものメンツに最大の長さ（40 字）の組を画面から保存 / When 320〜1280 で開く / Then 横に溢れない（区画は .ui-stack の縦の flex で、最小幅 0 の手当てが要らない）（#553）', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await openRouletteTool(page, 'spacing-regulars');
    await page.getByRole('button', { name: '新しく作る' }).click();
    await page.getByLabel('メンツの名前').fill('W'.repeat(40));
    await page.getByLabel('ほかの名前（1 行に 1 人）').fill('さとう\nすずき');
    await page.getByRole('button', { name: 'この端末に保存' }).click();
    await expect(page.locator('.roulette-regulars-name').first()).toBeVisible();
    for (const width of [320, 390, 1280] as const) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.locator('.roulette-regulars-name').first(), `幅 ${String(width)}: 組が見える`).toBeVisible();
      const m = await page.evaluate(() => {
        const sec = document.querySelector('.roulette-regulars')!.getBoundingClientRect();
        const row = document.querySelector('.roulette-regulars-row')!.getBoundingClientRect();
        return { scrollWidth: document.documentElement.scrollWidth, innerWidth, rowRight: row.right, secRight: sec.right };
      });
      expect(m.scrollWidth, `幅 ${String(width)}: ページが横に溢れない`).toBeLessThanOrEqual(m.innerWidth);
      expect(m.rowRight, `幅 ${String(width)}: 組の行は区画の幅に収まる`).toBeLessThanOrEqual(m.secRight + 1);
    }
  });

  test('Given poker の読む面に段落が 3 つ / When 5 つの幅で開く / Then 段落どうしの間は 8px（±1。広げても緑にしない）（#553 一覧 #3）', async ({ page, openPeer }) => {
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
        expect(Math.abs(gap - SPACE_2), `幅 ${String(width)}: 段落どうしの間（${gap.toFixed(1)}px）は --space-2（8px）±1`).toBeLessThanOrEqual(1);
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
    for (const width of [320, 768, 1280] as const) {
      await page.setViewportSize({ width, height: 900 });
      await expectActionsBelongToHeading(page, '参加者 (2人)', 'ドライバー順をランダムに並べ替える', `ロビー 幅 ${String(width)}`, { maxGap: 2 * SPACE_3, minGap: SPACE_3 - 1 });
    }
    await page.getByRole('button', { name: 'セッションを開始' }).click();
    await expect(page.getByRole('timer')).toBeVisible();
    for (const width of [320, 390, 1280] as const) {
      await page.setViewportSize({ width, height: 900 });
      await expectActionsBelongToHeading(page, '参加者', 'ドライバー順をランダムに並べ替える', `セッション 幅 ${String(width)}`, { maxGap: 2 * SPACE_3, minGap: SPACE_3 - 1 });
      await expectActionsBelongToHeading(page, '参加者', '代理参加者を追加', `セッション 幅 ${String(width)}`, { maxGap: 2 * SPACE_3, minGap: SPACE_3 - 1 });
    }
    // 「ランダム」のアイコンは 1rem（16px）。以前の `session-action-icon` と同じ大きさで、名簿の見出しの行の字（--font-size-sm 前後）と釣り合う
    const icon = await page.locator('button[aria-label="ドライバー順をランダムに並べ替える"] svg').first().evaluate((el) => ({ w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height }));
    expect(icon, '「ランダム」のアイコンは 16px 角').toEqual({ w: 16, h: 16 });
    // 共有メモの「編集」も同じ約束。脇が 22rem の 1280 以上は、折り返さず見出しと同じ行にあること（`.shared-memo-lead` が縮む）
    for (const width of [320, 1280, 1920] as const) {
      await page.setViewportSize({ width, height: 900 });
      await expectActionsBelongToHeading(page, '共有メモ', '編集', `共有メモ 幅 ${String(width)}`, { sameLine: width >= 1280 });
    }
    // ルームのタブの名簿（広い幅ほど離れやすい。1024 では行が 577px あった）
    await page.getByRole('tab', { name: 'ルーム' }).click();
    for (const width of [390, 768, 1024, 1280] as const) {
      await page.setViewportSize({ width, height: 900 });
      await expectActionsBelongToHeading(page, '参加者', 'ドライバー順をランダムに並べ替える', `ルームのタブ 幅 ${String(width)}`, { maxGap: 2 * SPACE_3, minGap: SPACE_3 - 1 });
      await expectActionsBelongToHeading(page, '参加者', '代理参加者を追加', `ルームのタブ 幅 ${String(width)}`, { maxGap: 2 * SPACE_3, minGap: SPACE_3 - 1 });
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
