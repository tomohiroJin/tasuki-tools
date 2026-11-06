/**
 * ルーム画面の共通の見出しと、下端の帯の約束（#554・親 #479）。
 *
 * **タグを付けない（`local` 専用）。** 本番のルーム枠を消費して確かめる種類のものではない。
 *
 * 見出し（`RoomHeader`）: 招待の URL は 1 行に収まり（768px 前後でも 2 行に折れない）、40rem 未満で単独の行に落ちた
 * 「選択画面へ戻る」は左端が題と揃い、poker の 320px で見出しが 4 段に積まれない。
 * 帯（`.ui-actions--dock` とその仲間）: 帯の字の後ろの地は不透明（透明へ溶かさない）・帯の上端に内側の余白がある・
 * 40rem 未満の操作は 2 段まで・最下部までスクロールすると帯の後ろの中身が帯に隠れない。
 * 「帯が下端に留まる」仕様そのものは `buttons.spec.ts` が見る。ここは重ねない。
 *
 * ルームの枠を食わないよう、画面の種類ごとに 1 室（poker・timer・agenda・checkin）だけ作る。
 */
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../fixtures/test';
import { joinAgendaTool, loadSampleAndStart, openAgendaTool } from '../support/agenda';
import { chooseMethod, handCard, joinCheckinTool, openCheckinTool } from '../support/checkin';
import { chooseCard, createRoom as createPokerRoom, joinRoom as joinPokerRoom, turnRecordingOn } from '../support/poker';
import { createRoom as createTimerRoom } from '../support/timer';
import { joinTopicTool, setTopic } from '../support/topic';

/** 見出しの全体の高さの上限（px）。poker の 320px で、題・戻る＋記録する・仲間を招くの 3 段（実測 124px）に収める。以前は 4 段で約 230px。 */
const HEADER_MAX_HEIGHT = 140;

/** 40rem 未満の帯の操作の段数の上限。 */
const DOCK_MAX_ROWS = 2;

/** 帯の上端の内側の余白の下限（`--space-2`）。 */
const DOCK_MIN_PADDING_TOP = 8;

async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label}: 横に溢れる`).toBe(true);
}

/** 招待の URL の箱が 1 行ぶんの高さで、隣のボタンと同じ行なら縦の中心が揃う。 */
async function expectInviteUrlOneLine(page: Page, label: string): Promise<void> {
  const m = await page.locator('.ui-room-header-invite .ui-invite-url').first().evaluate((el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const fontSize = parseFloat(cs.fontSize);
    const lineHeight = Number.isNaN(parseFloat(cs.lineHeight)) ? fontSize * 1.6 : parseFloat(cs.lineHeight);
    const frame = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    const button = el.parentElement?.querySelector('button');
    const b = button?.getBoundingClientRect();
    return {
      height: r.height,
      oneLine: lineHeight + frame,
      right: r.right,
      viewport: innerWidth,
      sameRow: b !== undefined && Math.abs(b.top - r.top) < r.height,
      centerGap: b === undefined ? 0 : Math.abs(b.top + b.height / 2 - (r.top + r.height / 2)),
    };
  });
  expect(m.height, `${label}: URL の箱が 1 行に収まらない（${m.height}px）`).toBeLessThanOrEqual(m.oneLine + 1);
  expect(m.right, `${label}: URL の箱が画面の外へ出る`).toBeLessThanOrEqual(m.viewport + 0.5);
  if (m.sameRow) expect(m.centerGap, `${label}: URL の箱が隣のボタンと縦の中心で揃わない`).toBeLessThanOrEqual(2);
}

/**
 * 戻る導線の字の左端が、題の字の左端と揃う（40rem 未満・戻るが行の先頭に落ちたとき）。
 * 戻るが道具のボタンと同じ行に並ぶときは、先頭ではないので揃えを求めず、ボタンの右端との字の間が 12px 以上あることを見る。
 */
async function expectBackAlignedWithTitle(page: Page, label: string): Promise<void> {
  const m = await page.evaluate(() => {
    const h1 = document.querySelector('.ui-room-header h1');
    const back = document.querySelector('.ui-room-header .ui-page-header-back');
    if (!h1 || !back) return null;
    const ink = (el: Element): DOMRect => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return range.getBoundingClientRect();
    };
    const b = back.getBoundingClientRect();
    const peers = Array.from(document.querySelectorAll('.ui-room-header button, .ui-room-header a'))
      .filter((e) => e !== back && getComputedStyle(e).display !== 'none')
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.width > 0 && Math.abs(r.top + r.height / 2 - (b.top + b.height / 2)) < 10 && r.left < b.left);
    return { title: ink(h1).left, back: ink(back).left, previousRight: peers.length === 0 ? null : Math.max(...peers.map((r) => r.right)) };
  });
  expect(m, `${label}: 題か戻るが描かれていない`).not.toBeNull();
  if (m!.previousRight === null) {
    expect(Math.abs(m!.back - m!.title), `${label}: 戻るの字の左端（${m!.back}）が題（${m!.title}）と揃わない`).toBeLessThanOrEqual(1);
  } else {
    expect(m!.back - m!.previousRight, `${label}: 戻るの字が左のボタンに近すぎる`).toBeGreaterThanOrEqual(12);
  }
}

/**
 * 見出しの中を Tab で順に辿り、フォーカスした要素の矩形が目の順（上端の行ごとに上から、行の中は左から右）に並ぶ。
 * `order` で目の順だけを変えると、Tab・読み上げの順が見た目と食い違う（WCAG 2.4.3・1.3.2）。
 */
async function expectHeaderTabOrderFollowsSight(page: Page, label: string, minStops = 2): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, 0));
  // Chromium の「次に Tab が進む起点」は body.focus() では戻らない。見出しの直前に tabindex=-1 の一時の要素を置いてフォーカスし、そこから辿る
  await page.evaluate(() => {
    const header = document.querySelector('.ui-room-header')!;
    const start = document.createElement('span');
    start.id = '__tab-start';
    start.tabIndex = -1;
    header.before(start);
    start.focus();
  });
  const stops: Array<{ name: string; top: number; left: number; height: number }> = [];
  for (let i = 0; i < 30; i += 1) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || !el.closest('.ui-room-header')) return null;
      const r = el.getBoundingClientRect();
      return { name: (el.textContent ?? '').trim().slice(0, 20), top: r.top, left: r.left, height: r.height };
    });
    if (stop === null) {
      if (stops.length > 0) break;
      continue;
    }
    stops.push(stop);
  }
  await page.evaluate(() => document.getElementById('__tab-start')?.remove());
  expect(stops.length, `${label}: 見出しの中で Tab が止まる所が ${stops.length} 個`).toBeGreaterThanOrEqual(minStops);
  for (let i = 1; i < stops.length; i += 1) {
    const a = stops[i - 1]!;
    const b = stops[i]!;
    const sameRow = Math.abs(a.top + a.height / 2 - (b.top + b.height / 2)) < Math.min(a.height, b.height) / 2;
    const ok = sameRow ? b.left > a.left : b.top > a.top;
    expect(ok, `${label}: Tab が「${a.name}」(${Math.round(a.left)},${Math.round(a.top)}) → 「${b.name}」(${Math.round(b.left)},${Math.round(b.top)}) と見た目の順に進まない`).toBe(true);
  }
}

/** 40rem 未満で「仲間を招く」を開いた後（招待の欄が増えた後）でも、見出しの全部の Tab の順が見た目の順であることを見る。閉じて戻す。 */
async function expectTabOrderWithShareOpen(page: Page, label: string): Promise<void> {
  const toggle = page.getByRole('button', { name: '仲間を招く' });
  // 40rem 未満で見えなければ失敗（黙って戻らない）。呼び出し側は 40rem 未満の幅でだけ呼ぶ
  await expect(toggle, `${label}: 「仲間を招く」が見えない`).toBeVisible();
  await toggle.click();
  await expect(page.getByRole('button', { name: '招待リンクをコピー' })).toBeVisible();
  await expectHeaderTabOrderFollowsSight(page, `${label}・招待を開いた`, 4);
  await toggle.click();
  await expect(page.getByRole('button', { name: '招待リンクをコピー' })).toBeHidden();
}

interface DockFacts {
  rows: number;
  height: number;
  paddingTop: number;
  /** 帯の中のボタンの字の行数の最大（字が折れていれば 2 以上）。 */
  maxTextLines: number;
  /** 操作（ボタン）が奇数で選択欄が無いとき、最後の主の幅 ÷ 帯の内側の幅。それ以外は null。 */
  lastPrimaryRatio: number | null;
  /** 選択欄があるとき、先頭にあるか・続く操作の数（約束は「先頭に置く・続く操作は 2 つまで」）。 */
  selectFirst: boolean;
  selectThenOthers: number;
  alpha: number;
  backgroundImage: string;
  position: string;
}

/** 帯の操作の段数（直接の子のうちボタンと選択欄の、縦の位置の種類）・高さ・上の余白・地の不透明さ。 */
async function dockFacts(dock: Locator): Promise<DockFacts> {
  return dock.evaluate((el) => {
    const cs = getComputedStyle(el);
    const tops: number[] = [];
    let maxTextLines = 0;
    const buttons: Element[] = [];
    // 部品の帯（.ui-actions--dock）は、CSS の数え方と同じ直下の子だけ（hidden・.ui-visually-hidden・.ui-actions-start の包みを除く）。倣う画面の帯は群の中のボタンを数える
    const direct = el.classList.contains('ui-actions--dock');
    const candidates = direct
      ? Array.from(el.querySelectorAll(':scope > :not([hidden]):not(.ui-visually-hidden):not(.ui-actions-start)'))
      : Array.from(el.querySelectorAll('button, select, a'));
    const kids = candidates.filter((c) => ['BUTTON', 'SELECT', 'A'].includes(c.tagName));
    const selectFirst = kids.every((c, i) => c.tagName !== 'SELECT' || i === 0);
    const selectThenOthers = kids.some((c) => c.tagName === 'SELECT') ? kids.length - 1 : 0;
    for (const child of kids) {
      const r = child.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (child.tagName === 'BUTTON') {
        buttons.push(child);
        // 字の行数: 字のノードの矩形の縦の位置の種類（アイコンの svg は数えない）
        const lineTops: number[] = [];
        const walker = document.createTreeWalker(child, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          if ((n.textContent ?? '').trim() === '') continue;
          const range = document.createRange();
          range.selectNodeContents(n);
          for (const lr of Array.from(range.getClientRects())) {
            if (!lineTops.some((t) => Math.abs(t - lr.top) < lr.height / 2)) lineTops.push(lr.top);
          }
        }
        maxTextLines = Math.max(maxTextLines, lineTops.length);
      }
      if (!tops.some((t) => Math.abs(t - r.top) < r.height / 2)) tops.push(r.top);
    }
    const match = /rgba?\(([^)]+)\)/.exec(cs.backgroundColor);
    const parts = match ? match[1]!.split(/[,/ ]+/).filter(Boolean) : [];
    const inner = el.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const last = buttons.at(-1)?.getBoundingClientRect();
    return {
      selectFirst,
      selectThenOthers,
      lastPrimaryRatio: buttons.length % 2 === 1 && el.querySelector('select') === null && last !== undefined ? last.width / inner : null,
      rows: tops.length,
      height: el.getBoundingClientRect().height,
      paddingTop: parseFloat(cs.paddingTop),
      maxTextLines,
      alpha: parts.length >= 4 ? parseFloat(parts[3]!) : match ? 1 : 0,
      backgroundImage: cs.backgroundImage,
      position: cs.position,
    };
  });
}

/** 40rem・64rem 未満の帯が約束（不透明・上の余白・段数）を守る。 */
async function expectDockContract(dock: Locator, label: string, wholeWidthPrimary = true, maxRows = DOCK_MAX_ROWS): Promise<void> {
  const f = await dockFacts(dock);
  expect(f.alpha, `${label}: 帯の地が不透明でない（α=${f.alpha}）。字の後ろに中身が透ける`).toBe(1);
  expect(f.backgroundImage, `${label}: 帯の地に透明へ溶けるグラデーションがある`).toBe('none');
  expect(f.paddingTop, `${label}: 帯の上端の内側の余白が ${DOCK_MIN_PADDING_TOP}px 未満`).toBeGreaterThanOrEqual(DOCK_MIN_PADDING_TOP);
  expect(f.selectFirst, `${label}: 選択欄が帯の先頭にない（約束は先頭に置く）`).toBe(true);
  expect(f.selectThenOthers, `${label}: 選択欄の後ろの操作が ${f.selectThenOthers} 個（選択欄があれば 2 つまで）`).toBeLessThanOrEqual(2);
  expect(f.maxTextLines, `${label}: 帯のボタンの字が ${f.maxTextLines} 行に折れている`).toBeLessThanOrEqual(1);
  if (f.lastPrimaryRatio !== null && wholeWidthPrimary) {
    expect(f.lastPrimaryRatio, `${label}: 奇数の最後の主が全幅の段でない（帯の内側の幅の ${f.lastPrimaryRatio}）`).toBeGreaterThanOrEqual(0.95);
  }
  expect(f.rows, `${label}: 帯の操作が ${f.rows} 段（${maxRows} 段まで）`).toBeLessThanOrEqual(maxRows);
}

/** 最下部までスクロールしたとき、帯の外の中身の最下端が帯の上端より上にある（覆われた中身が最後まで見える）。 */
async function expectContentClearOfDock(page: Page, dock: Locator, label: string): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const m = await dock.evaluate((el) => {
    const parent = el.parentElement!;
    const fixed = getComputedStyle(el).position === 'fixed';
    let contentBottom = -Infinity;
    let who = '';
    for (const other of Array.from(parent.querySelectorAll('*'))) {
      if (el.contains(other) || other === el) continue;
      if (['absolute', 'fixed'].includes(getComputedStyle(other).position)) continue;
      // sticky の帯（流れの中にある）は、帯より後ろの DOM（timer の休憩の注記など）を覆わない。fixed の帯（agenda）は流れの外なので、後ろの DOM（進行表）も覆う
      if (fixed ? false : !(other.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
      const o = other.getBoundingClientRect();
      if (o.width > 0 && o.height > 0 && o.bottom > contentBottom) {
        contentBottom = o.bottom;
        who = `${other.tagName.toLowerCase()}.${(other as HTMLElement).className}`;
      }
    }
    return { top: el.getBoundingClientRect().top, contentBottom, who };
  });
  expect(m.contentBottom, `${label}: 最下部で中身（${m.who}）が帯に隠れる`).toBeLessThanOrEqual(m.top + 0.5);
}

test.describe('poker のルームの見出しと帯', () => {
  test('Given poker のルーム / When 320・390・640・768・900 で見る / Then URL は 1 行で、戻るは題と揃い、見出しは 3 段、公開後の帯は不透明で 2 段まで、最下部で中身が帯に隠れない', async ({ page, openPeer }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 768, height: 900 });
    const url = await createPokerRoom(page, 'header-host');
    for (const width of [640, 768, 900]) {
      await page.setViewportSize({ width, height: 900 });
      await expectInviteUrlOneLine(page, `poker URL（${width}）`);
      await expectNoHorizontalOverflow(page, `poker（${width}）`);
    }
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 800 });
      await expectBackAlignedWithTitle(page, `poker 戻る（${width}）`);
      const header = await page.locator('.ui-room-header').boundingBox();
      expect(header!.height, `poker 見出し（${width}）が高い（${header!.height}px）`).toBeLessThanOrEqual(HEADER_MAX_HEIGHT);
      await expectNoHorizontalOverflow(page, `poker（${width}）`);
    }

    const guest = await openPeer('header-guest');
    await joinPokerRoom(guest.page, url, 'header-guest');
    await expect(page.getByText('参加者（2人）')).toBeVisible();
    await chooseCard(guest.page, '5');
    const dock = page.locator('.room-main > .ui-actions--dock');
    await expect(dock).toBeVisible();
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 800 });
      await expectDockContract(dock, `poker 投票中（${width}）`);
    }
    await turnRecordingOn(page);
    await chooseCard(page, '8');
    await expect(page.getByRole('button', { name: '再投票' })).toBeVisible();
    // 数えない子（hidden）は描かれない: .ui-button の display が UA の [hidden] に勝つと、描かれて段が増える
    const hiddenDisplay = await dock.evaluate((el) => {
      const probe = document.createElement('button');
      probe.className = 'ui-button';
      probe.hidden = true;
      el.append(probe);
      const display = getComputedStyle(probe).display;
      probe.remove();
      return display;
    });
    expect(hiddenDisplay, 'hidden の子が帯の中で描かれる（数えない子は描かない）').toBe('none');
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 800 });
      await expectDockContract(dock, `poker 公開後（${width}）`);
      await expectContentClearOfDock(page, dock, `poker 公開後（${width}）`);
    }
  });
});

test.describe('timer のセッションの帯', () => {
  test('Given timer のセッション / When 320・390 で見る / Then 帯は不透明で 2 段まで、最下部で盤の下が帯に隠れない', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await createTimerRoom(page, 'header-timer');
    await page.getByRole('button', { name: 'セッションを開始' }).click();
    await expect(page.getByRole('timer')).toBeVisible();
    const dock = page.locator('.session-actions');
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 800 });
      await expectDockContract(dock, `timer セッション（${width}）`);
      await expectContentClearOfDock(page, dock, `timer セッション（${width}）`);
    }
  });
});

test.describe('agenda の進行中の帯', () => {
  test('Given agenda の進行中 / When 390・768 で見る / Then 帯の字の点は帯が受け、地は不透明で、操作は 2 段まで、最下部で進行表が帯に隠れない。戻るは題と揃う', async ({ page, openPeer }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 390, height: 800 });
    const url = await openAgendaTool(page, 'header-agenda');
    const guest = await openPeer('header-agenda-guest');
    await joinAgendaTool(guest.page, url, 'header-agenda-guest');
    await loadSampleAndStart(page);
    const dock = page.locator('.run-controls');
    for (const width of [390, 768]) {
      await page.setViewportSize({ width, height: 800 });
      await expectDockContract(dock, `agenda 進行中（${width}）`, false);
      // 実経路: 帯の見出し「このステップに」の字の点を、最前面で受けているのは帯の中の要素（後ろの進行表の字ではない）
      const front = await page.locator('.run-extend-label').evaluate((el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2)[0];
        return hit?.closest('.run-controls') !== null && hit !== undefined;
      });
      expect(front, `agenda 進行中（${width}）: 帯の字の点を、帯より前の要素が受けている`).toBe(true);
      await expectContentClearOfDock(page, dock, `agenda 進行中（${width}）`);
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 800 });
      await expectBackAlignedWithTitle(page, `agenda 戻る（${width}）`);
    }
    // 帯の実際の高さは、下の余白の変数（--run-controls-height）以下（値がずれたら赤）。帯が fixed の幅（64rem 未満）の全部で測る
    for (const width of [320, 390, 639, 768, 1023]) {
      await page.setViewportSize({ width, height: 800 });
      const m = await page.evaluate(() => {
        const bar = document.querySelector('.run-controls')!.getBoundingClientRect().height;
        const probe = document.createElement('div');
        probe.style.height = getComputedStyle(document.documentElement).getPropertyValue('--run-controls-height').trim();
        document.body.append(probe);
        const limit = probe.getBoundingClientRect().height;
        probe.remove();
        return { bar, limit };
      });
      expect(m.bar, `agenda 帯の高さ（${width}）が --run-controls-height（${m.limit}px）を超える`).toBeLessThanOrEqual(m.limit);
      expect(m.limit, `agenda --run-controls-height（${width}）が読めない`).toBeGreaterThan(0);
    }
    // 進行表の最後の「スキップ」に Tab で行っても、不透明な帯の後ろに隠れない（WCAG 2.4.11）。40rem 未満・40〜64rem の両方で測る
    for (const width of [390, 768]) {
      await page.setViewportSize({ width, height: 700 });
      const skips = page.locator('.step-list-skip');
      const count = await skips.count();
      expect(count, '進行表に「スキップ」が無い').toBeGreaterThan(0);
      // すでにフォーカスがある要素への focus() は送らないので、先に外す
      await page.evaluate(() => {
        (document.activeElement as HTMLElement | null)?.blur();
        window.scrollTo(0, 0);
      });
      await skips.nth(count - 1).focus();
      // 送りはなめらかなスクロール（scroll-behavior）で時間がかかることがあるので、終わるまで待つ（時間では待たない）
      await expect.poll(async () => page.evaluate(() => {
        const f = document.activeElement!.getBoundingClientRect();
        const bar = document.querySelector('.run-controls')!.getBoundingClientRect();
        return f.bottom - bar.top;
      }), { message: `agenda 最後の「スキップ」（${width}）が帯の後ろに隠れる（scroll-padding が帯の高さに足りない）` }).toBeLessThanOrEqual(0.5);
    }
    for (const width of [320, 639, 768, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await expectHeaderTabOrderFollowsSight(page, `agenda 見出しの Tab（${width}）`);
    }
  });
});

test.describe('Check-in Cards の開いた後', () => {
  test('Given 開いた後 / When 768・1024・1280 で見る / Then 帯は席に重ならず、URL は 1 行', async ({ page, openPeer }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 900 });
    const url = await openCheckinTool(page, 'header-checkin');
    const names = ['ながいなまえのさんかしゃでございますよろしくおねがいします', 'とてもながいおなまえのひとがきましたよー', 'さとう', 'すずき', 'たかはし'];
    for (const [i, name] of names.entries()) {
      const peer = await openPeer(`header-checkin-${i}`);
      await joinCheckinTool(peer.page, url, name);
    }
    await chooseMethod(page, 'チェックイン', '今日の天気');
    await handCard(page, '晴れ').click();
    await page.getByRole('button', { name: '待たずに開く', exact: true }).click();
    await expect(page.getByRole('button', { name: 'もう一回', exact: true })).toBeVisible();
    // 開いた直後の演出が終わるのを、帯と席の矩形が 2 回続けて同じになるまで待つ（時間では待たない）
    let previous = '';
    await expect.poll(async () => {
      const now = await page.evaluate(() => ['.seat-row', '.round-dock'].map((s) => JSON.stringify(document.querySelector(s)?.getBoundingClientRect())).join('|'));
      const same = now === previous;
      previous = now;
      return same;
    }, { message: '開いた後の帯と席の矩形が落ち着かない' }).toBe(true);
    for (const width of [768, 1024, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await expectInviteUrlOneLine(page, `checkin URL（${width}）`);
      const m = await page.locator('.round-dock').evaluate((dock) => {
        const top = dock.getBoundingClientRect().top;
        let bottom = -Infinity;
        let who = '';
        for (const other of Array.from(dock.parentElement!.querySelectorAll('*'))) {
          if (dock.contains(other) || other === dock || other.contains(dock)) continue;
          const o = other.getBoundingClientRect();
          if (o.width > 0 && o.height > 0 && o.bottom > bottom) {
            bottom = o.bottom;
            who = `${other.tagName.toLowerCase()}.${(other as HTMLElement).className}`;
          }
        }
        return { top, bottom, who };
      });
      expect(m.bottom, `checkin 開いた後（${width}）: 帯（上端 ${m.top}）が ${m.who} に重なる`).toBeLessThanOrEqual(m.top + 0.5);
    }
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 800 });
      await expectBackAlignedWithTitle(page, `checkin 戻る（${width}）`);
    }
  });
});

test.describe('見出しの Tab の順は見た目の順', () => {
  test('Given poker のルーム（お題なし・あり） / When 320・390・639・768・1280 で見出しを Tab で辿る / Then 矩形が上から下・行の中は左から右に並ぶ', async ({ page, openPeer }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 768, height: 900 });
    const url = await createPokerRoom(page, 'tab-host');
    for (const width of [320, 390, 639, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await expectHeaderTabOrderFollowsSight(page, `poker 見出しの Tab（お題なし・${width}）`);
      if (width < 640) await expectTabOrderWithShareOpen(page, `poker 見出しの Tab（お題なし・${width}）`);
    }
    const topic = await openPeer('tab-topic');
    await joinTopicTool(topic.page, url, 'tab-t');
    await setTopic(topic.page, 'FizzBuzz', '3 のときは Fizz を出す');
    await expect(page.getByRole('button', { name: /お題を(隠す|見る)/ })).toBeVisible();
    // 640・660・668 は 40rem 以上でも、お題と記録で題の行が埋まり、戻るが単独の行に落ちる幅（main からあった崩れ・#13 と同じ形）
    for (const width of [320, 390, 639, 640, 660, 668, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await expectHeaderTabOrderFollowsSight(page, `poker 見出しの Tab（お題あり・${width}）`);
      if (width < 640) await expectTabOrderWithShareOpen(page, `poker 見出しの Tab（お題あり・${width}）`);
      await expectBackAlignedWithTitle(page, `poker 戻る（お題あり・${width}）`);
    }
  });
});

test.describe('timer の休憩つきのセッションの帯', () => {
  test('Given 休憩の条件を経過時間にしたセッション / When 320・390 で帯を見る / Then 操作は 4 つで 2 段まで、主は最後で、字は折れず、不透明で、最下部で盤が隠れない', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await createTimerRoom(page, 'header-timer-break');
    await page.locator('summary', { hasText: '詳細設定' }).click();
    await page.getByRole('group', { name: '休憩の条件' }).getByRole('button', { name: '経過時間' }).click();
    await page.getByRole('button', { name: 'セッションを開始' }).click();
    await expect(page.getByRole('timer')).toBeVisible();
    const dock = page.locator('.session-actions');
    await expect(dock.getByRole('button', { name: /休憩する/ })).toBeVisible();
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 800 });
      expect(await dock.locator('button').count(), `timer 休憩つき（${width}）: 帯の操作が 4 つでない`).toBe(4);
      await expectDockContract(dock, `timer 休憩つき（${width}）`, false);
      const order = await dock.locator('button').evaluateAll((els) => {
        const rects = els.map((e) => e.getBoundingClientRect());
        const last = rects[rects.length - 1]!;
        return { primaryIsLast: rects.every((r) => r.top < last.top + 1 && (r.top < last.top - 1 || r.left <= last.left)) };
      });
      expect(order.primaryIsLast, `timer 休憩つき（${width}）: 主（最後の子）が帯の最後（右下）にない`).toBe(true);
      await expectContentClearOfDock(page, dock, `timer 休憩つき（${width}）`);
    }
  });
});

test.describe('agenda の映す表示の帯', () => {
  test('Given 映す表示で操作帯を出した / When 帯の地を測る / Then 不透明で、帯の字の点を帯が受ける', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openAgendaTool(page, 'header-projection');
    await loadSampleAndStart(page);
    await page.getByRole('button', { name: '映す表示', exact: true }).click();
    const exit = page.getByRole('button', { name: '手元の表示に戻る', exact: true });
    await expect(exit).toBeAttached();
    await exit.focus();
    const strip = page.locator('.projection-strip');
    await expect(strip).toHaveCSS('opacity', '1');
    const f = await dockFacts(strip);
    expect(f.alpha, `映す表示の帯の地が不透明でない（α=${f.alpha}）。字の後ろに大きな字が透ける`).toBe(1);
    expect(f.backgroundImage, '映す表示の帯の地に透明へ溶けるグラデーションがある').toBe('none');
    // 実経路: 帯のボタンの字の点を、最前面で受けているのは帯の中の要素
    const front = await exit.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2)[0];
      return hit?.closest('.projection-strip') !== null && hit !== undefined;
    });
    expect(front, '映す表示の帯のボタンの点を、帯より前の要素が受けている').toBe(true);
  });
});
