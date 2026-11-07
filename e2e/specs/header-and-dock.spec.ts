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

/**
 * 数える集合（hidden・.ui-visually-hidden・select・.ui-actions-start を除く）と最後を決める集合が同じであること。
 * 帯の実物に無い並び（[副, 副, 主, 控えの包み] と [主, 選択欄]・[副, 主, 選択欄]・[副, 主, hidden, 主]）を一時の帯に作り、数えた奇数の最後が全幅になるか・偶数なら半分かを測る。
 */
async function expectLastCountedButtonFullWidth(page: Page, label: string): Promise<void> {
  const cases = await page.evaluate(() => {
    const build = (kinds: string[]): { counted: number; ratios: number[]; inner: number } => {
      const dock = document.createElement('div');
      dock.className = 'ui-actions ui-actions--dock';
      for (const k of kinds) {
        let el: HTMLElement;
        if (k === 'select') el = document.createElement('select');
        else if (k === 'start') {
          el = document.createElement('div');
          el.className = 'ui-actions-start';
          el.innerHTML = '<button type="button" class="ui-button ui-button--quiet">控え</button>';
        } else {
          el = document.createElement('button');
          el.type = 'button';
          el.className = 'ui-button ui-button--secondary';
          el.textContent = k === 'hidden' ? '隠す' : '操作';
          if (k === 'hidden') el.hidden = true;
        }
        dock.append(el);
      }
      (document.querySelector('main') ?? document.body).append(dock);
      const cs = getComputedStyle(dock);
      const inner = dock.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const counted = Array.from(dock.children).filter((c) => c.tagName === 'BUTTON' && !(c as HTMLElement).hidden);
      const ratios = counted.map((c) => c.getBoundingClientRect().width / inner);
      dock.remove();
      return { counted: counted.length, ratios, inner };
    };
    return {
      startLast: build(['btn', 'btn', 'btn', 'start']),
      selectLast: build(['btn', 'select']),
      selectMid: build(['btn', 'select', 'btn', 'btn']),
      hiddenMid: build(['btn', 'btn', 'hidden', 'btn']),
      evenWithStart: build(['btn', 'btn', 'start']),
    };
  });
  const lastFull = (c: { ratios: number[] }): number => c.ratios.at(-1)!;
  expect(lastFull(cases.startLast), `${label}: [操作, 操作, 操作, 控えの包み] の奇数の最後の操作が全幅でない`).toBeGreaterThanOrEqual(0.95);
  expect(lastFull(cases.selectLast), `${label}: [操作, 選択欄] の最後の操作が全幅でない`).toBeGreaterThanOrEqual(0.95);
  expect(lastFull(cases.selectMid), `${label}: [操作, 選択欄, 操作, 操作] の奇数の最後の操作が全幅でない`).toBeGreaterThanOrEqual(0.95);
  expect(lastFull(cases.hiddenMid), `${label}: [操作, 操作, hidden, 操作] の奇数の最後の操作が全幅でない`).toBeGreaterThanOrEqual(0.95);
  expect(lastFull(cases.evenWithStart), `${label}: 偶数（2 つ）の最後が全幅になっている（半分のはず）`).toBeLessThan(0.7);
}

/**
 * 帯のすぐ上の操作へ Tab で移ったとき、その操作が帯に隠れない（WCAG 2.4.11）。帯より前の DOM の最後のフォーカスできる要素を、画面の下端のすぐ内側（帯の後ろ）に
 * 見えている状態から Tab の送りで着ける（見えている要素はブラウザが送らないので、scroll-padding が帯の高さを持っていなければ帯の後ろに残る）。
 */
async function expectNothingJustAboveDockHidden(page: Page, dockSelector: string, label: string): Promise<void> {
  // 低い画面にして、帯のすぐ上の操作が画面の下端の帯の範囲に入るまでスクロールできるようにする（終わったら戻す）
  const original = page.viewportSize()!;
  await page.setViewportSize({ width: original.width, height: 420 });
  await page.evaluate((sel) => {
    const el = document.querySelector(sel)!;
    const all = Array.from(document.querySelectorAll<HTMLElement>('button, a[href], select, input, textarea, [tabindex]:not([tabindex="-1"])'))
      .filter((e) => !el.contains(e) && (e.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 && e.getBoundingClientRect().height > 0 && !e.closest('[inert]'));
    const target = all.at(-1)!;
    target.id = '__above-dock';
    (document.activeElement as HTMLElement | null)?.blur();
    // 帯の高さの範囲のうち、6rem（旧い余白）では「見えている」とされ、帯の高さの余白なら「見えていない」とされる位置（下端から 120px）に置く
    target.scrollIntoView({ block: 'nearest' });
    window.scrollBy(0, target.getBoundingClientRect().bottom - (innerHeight - 120));
  }, dockSelector);
  await page.locator('#__above-dock').focus();
  await expect.poll(async () => page.evaluate((sel) => {
    const f = document.getElementById('__above-dock')!.getBoundingClientRect();
    return f.bottom - document.querySelector(sel)!.getBoundingClientRect().top;
  }, dockSelector), { message: `${label}: 帯のすぐ上の操作が帯の後ろに隠れる（scroll-padding が帯の高さに足りない）` }).toBeLessThanOrEqual(0.5);
  await page.evaluate(() => document.getElementById('__above-dock')?.removeAttribute('id'));
  await page.setViewportSize(original);
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
  hasSelect: boolean;
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
    // 部品の帯（.ui-actions--dock）は、CSS の数え方と同じ直下の子だけ（hidden・.ui-visually-hidden・.ui-actions-start の包みを除く）。倣う画面の帯は群の中のボタンを数える
    const direct = el.classList.contains('ui-actions--dock');
    const candidates = direct
      ? Array.from(el.querySelectorAll(':scope > :not([hidden]):not(.ui-visually-hidden):not(.ui-actions-start)'))
      : Array.from(el.querySelectorAll('button, select, a'));
    const counted = direct ? candidates.filter((c) => c.tagName !== 'SELECT') : [];
    const kids = candidates.filter((c) => ['BUTTON', 'SELECT', 'A'].includes(c.tagName));
    const selectFirst = kids.every((c, i) => c.tagName !== 'SELECT' || i === 0);
    const selectThenOthers = kids.some((c) => c.tagName === 'SELECT') ? kids.length - 1 : 0;
    for (const child of kids) {
      const r = child.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (child.tagName === 'BUTTON') {
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
    return {
      selectFirst,
      selectThenOthers,
      // 部品の帯は CSS と同じ集合（hidden・.ui-visually-hidden・select・.ui-actions-start を除く直下の子）の奇数の最後を測る。倣う画面の帯は測らない
      lastPrimaryRatio: direct && counted.length % 2 === 1 ? (counted.at(-1)!.getBoundingClientRect().width / inner) : null,
      hasSelect: kids.some((c) => c.tagName === 'SELECT'),
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

/**
 * 最下部までスクロールしたとき、帯の前の中身の最下端が帯の上端より上にある（覆われた中身が最後まで見える）。
 * **何を測っているか**: 矩形だけで測る（計算値に頼らない）。fixed の帯（agenda）は流れの外なので、帯より後ろの DOM も含めた全部の中身の下端を見る。
 * sticky の帯（poker・timer）は流れの中にあり、最下部では帯が流れの終わりに来るので、帯の直前までの中身（帯より前の DOM）の下端が帯の上端以下であることを見る。
 * 帯に負の margin-block-start や transform を足すと、帯が前の中身に重なって赤になる（変異 1291）。
 * **何を測っていないか**: sticky の帯が流れの外へ出る欠陥（position の変更）は、`buttons.spec.ts` の「帯が下端に留まる」が見る。
 */
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
      // sticky の帯は、帯より後ろの DOM（timer の休憩の注記など）を覆わない。帯より前の DOM は、帯の祖先でも子孫でもないものだけ見る
      if (!fixed && !(other.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
      if (other.contains(el)) continue;
      const o = other.getBoundingClientRect();
      if (o.width > 0 && o.height > 0 && o.bottom > contentBottom) {
        contentBottom = o.bottom;
        who = `${other.tagName.toLowerCase()}.${(other as HTMLElement).className}`;
      }
    }
    return { top: el.getBoundingClientRect().top, contentBottom, who };
  });
  expect(m.contentBottom, `${label}: 最下部で中身（${m.who}）が帯に隠れる（帯の上端 ${m.top}）`).toBeLessThanOrEqual(m.top + 0.5);
}

test.describe('poker のルームの見出しと帯', () => {
  test('Given poker のルーム / When 320・390・640・768・900 で見る / Then URL は 1 行で、戻るは題と揃い、見出しは 3 段、公開後の帯は不透明で 2 段まで、最下部で中身が帯に隠れない', async ({ page, openPeer }) => {
    test.setTimeout(120_000);
    // 帯の無い画面（玄関）の Tab の送り先の余白は旧い 6rem（96px）のまま。帯のある画面だけが --dock-max-height（152px）に広がる
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'ルームを作る' })).toBeVisible();
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingBottom), '帯の無い画面（玄関）の scroll-padding-block-end が 6rem でない').toBe('96px');
    await page.setViewportSize({ width: 768, height: 900 });
    const url = await createPokerRoom(page, 'header-host');
    for (const width of [640, 768, 900]) {
      await page.setViewportSize({ width, height: 900 });
      await expectInviteUrlOneLine(page, `poker URL（${width}）`);
      // 40rem 以上は Tab の送り先の余白を掛けない（要素層の 6rem の既定が @media の外へ漏れない）
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingBottom), `poker（${width}）: 40rem 以上に scroll-padding-block-end が掛かっている`).toBe('auto');
      // URL に title・aria-label を付けない（触る端末ではツールチップが出ず、読み上げで URL が二重になる）
      expect(await page.locator('.ui-invite-url').first().evaluate((el) => [el.hasAttribute('title'), el.hasAttribute('aria-label')]), `poker URL（${width}）に title か aria-label がある`).toEqual([false, false]);
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
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingBottom), 'poker（帯あり）の scroll-padding-block-end が --dock-max-height でない').toBe('152px');
    // 選択欄の選んだ字が切れていない（字の自然な幅 ≤ 選択欄の中の幅 − 矢印のぶん）。1 列（約 138px）に押し込むと切れる
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 800 });
      const fit = await dock.locator('select').evaluate((sel: HTMLSelectElement) => {
        const cs = getComputedStyle(sel);
        const ctx = document.createElement('canvas').getContext('2d')!;
        ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        const text = sel.selectedOptions[0]?.textContent ?? '';
        const inner = sel.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        return { text: ctx.measureText(text).width + (Number.parseFloat(cs.letterSpacing) || 0) * text.length, inner };
      });
      // 矢印（約 24px）のぶんを引く
      expect(fit.text, `poker 公開後（${width}）: 選択欄の字（${fit.text}px）が選択欄の中の幅（${fit.inner}px − 矢印）に収まらない`).toBeLessThanOrEqual(fit.inner - 24);
    }
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
    // 帯でない .ui-actions の中の hidden のボタンも描かない（.ui-button の display が UA の [hidden] に勝たない）
    const plainHidden = await page.evaluate(() => {
      const box = document.createElement('div');
      box.className = 'ui-actions';
      box.innerHTML = '<button type="button" class="ui-button" hidden>隠す</button>';
      document.body.append(box);
      const display = getComputedStyle(box.firstElementChild!).display;
      box.remove();
      return display;
    });
    expect(plainHidden, '帯でない .ui-actions の中の hidden のボタンが描かれる').toBe('none');
    // 選択欄が実物にあり（空の検査にしない）、先頭にある
    expect((await dockFacts(dock)).hasSelect, 'poker 公開後の帯に選択欄が無い（選択欄の約束の測りが空振りする）').toBe(true);
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 800 });
      await expectLastCountedButtonFullWidth(page, `一時の帯（${width}）`);
      await expectDockContract(dock, `poker 公開後（${width}）`);
      await expectContentClearOfDock(page, dock, `poker 公開後（${width}）`);
      if (width === 320) await expectNothingJustAboveDockHidden(page, '.room-main > .ui-actions--dock', `poker 公開後（${width}）`);
    }
  });
});

test.describe('timer のセッションの帯', () => {
  test('Given timer のセッション / When 320・390 で見る / Then 帯は不透明で 2 段まで、最下部で盤の下が帯に隠れない', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await createTimerRoom(page, 'header-timer');
    // 帯の無い画面（ロビー）は旧い 6rem（96px）のまま。帯のあるセッションだけ --dock-max-height（152px）に広がる
    await expect(page.getByRole('button', { name: 'セッションを開始' })).toBeVisible();
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingBottom), 'timer ロビー（帯なし）の scroll-padding-block-end が 6rem でない').toBe('96px');
    await page.getByRole('button', { name: 'セッションを開始' }).click();
    await expect(page.getByRole('timer')).toBeVisible();
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingBottom), 'timer セッション（帯あり）の scroll-padding-block-end が --dock-max-height でない').toBe('152px');
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
      // 低い画面にして、フォーカスした行が画面の下端に送られる（scroll-padding が無ければ帯の後ろに入る）状況を作る
      await page.setViewportSize({ width, height: 400 });
      const skips = page.locator('.step-list-skip');
      const count = await skips.count();
      expect(count, '進行表に「スキップ」が無い').toBeGreaterThan(0);
      // すでにフォーカスがある要素への focus() は送らないので、先に外す
      // 最後の「スキップ」が画面の下端のすぐ内側（帯の後ろ）に見えている状態から Tab で着く。ブラウザはフォーカスで、見えている要素は送らない。
      // scroll-padding が帯の高さを持っていれば、その位置は「見えていない」とされて帯の上へ送られる
      await page.evaluate(() => {
        (document.activeElement as HTMLElement | null)?.blur();
        const last = Array.from(document.querySelectorAll('.step-list-skip')).at(-1)!;
        last.scrollIntoView({ block: 'end' });
        window.scrollBy(0, -8);
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
    for (const width of [320, 390, 639, 640, 660, 662, 668, 680, 700, 768, 900, 1024, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await expectHeaderTabOrderFollowsSight(page, `poker 見出しの Tab（お題あり・${width}）`);
      if (width < 640) await expectTabOrderWithShareOpen(page, `poker 見出しの Tab（お題あり・${width}）`);
      await expectBackAlignedWithTitle(page, `poker 戻る（お題あり・${width}）`);
      // 戻るが道具のボタンの右隣に並ぶ幅（662〜700px 前後）でも、左の隣の操作との間が 8px 以上ある（負の margin の打ち消しだと 3px まで縮んだ）
      const gap = await page.evaluate(() => {
        const back = document.querySelector('.ui-page-header-back')!.getBoundingClientRect();
        const peers = Array.from(document.querySelectorAll('.ui-room-header button, .ui-room-header a'))
          .filter((e) => !e.classList.contains('ui-page-header-back') && getComputedStyle(e).display !== 'none')
          .map((e) => e.getBoundingClientRect())
          .filter((r) => r.width > 0 && Math.abs(r.top + r.height / 2 - (back.top + back.height / 2)) < 10 && r.right <= back.left + 12);
        return peers.length === 0 ? null : back.left - Math.max(...peers.map((r) => r.right));
      });
      if (gap !== null) expect(gap, `poker 戻る（お題あり・${width}）: 左の隣の操作との間が ${gap}px（8px 以上のはず）`).toBeGreaterThanOrEqual(8);
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
  test('Given 映す表示で操作帯を出した / When 帯の地と下の余白を測る / Then 不透明で、帯の字の点を帯が受け、最下部の中身が帯と重ならない', async ({ page }) => {
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
    // 広い画面（64rem 以上）は帯が中身に重ならないので余白を取らない: 縦のスクロールが無く、盤は画面の中央にある（main と同じ位置。1920×1080 で 540・1280×720 で 360）
    for (const [width, height] of [[1280, 720], [1920, 1080]] as const) {
      await page.setViewportSize({ width, height });
      const m = await page.evaluate(() => {
        const root = document.querySelector('.projection')!;
        const dial = document.querySelector('.projection-dial')!.getBoundingClientRect();
        return { scrollH: root.scrollHeight, clientH: root.clientHeight, center: dial.top + dial.height / 2, half: innerHeight / 2 };
      });
      expect(m.scrollH, `映す表示（${width}×${height}）: 縦のスクロールが出る（scrollHeight ${m.scrollH} > ${m.clientH}）`).toBeLessThanOrEqual(m.clientH);
      expect(Math.abs(m.center - m.half), `映す表示（${width}×${height}）: 盤の中心（${m.center}）が画面の中央（${m.half}）からずれる`).toBeLessThanOrEqual(2);
    }
    // 狭い幅（64rem 未満）は、帯が出ても盤が跳ねない（余白は帯の有無によらず常に取る）
    for (const [width, height] of [[390, 800], [768, 1024], [844, 390], [1000, 700]] as const) {
      await page.setViewportSize({ width, height });
      await page.mouse.move(0, 0);
      await page.locator('.projection-body').focus().catch(() => undefined);
      await (await page.evaluateHandle(() => (document.activeElement as HTMLElement | null)?.blur())).dispose();
      await strip.evaluate((el) => el.classList.remove('is-shown'));
      const y0 = await page.locator('.projection-dial').evaluate((el) => el.getBoundingClientRect().top);
      await strip.evaluate((el) => el.classList.add('is-shown'));
      const y1 = await page.locator('.projection-dial').evaluate((el) => el.getBoundingClientRect().top);
      expect(Math.abs(y1 - y0), `映す表示（${width}×${height}）: 帯が出ると盤が ${y1 - y0}px 動く`).toBeLessThanOrEqual(1);
    }
    // 帯が出ている間、下端の中身（「予定の終わり」など）が帯と重ならない。縦長・背の低い・狭い画面で、最下部までスクロールして測る。帯の高さは変数以下
    for (const [width, height] of [[390, 800], [320, 568], [800, 400], [844, 390], [1000, 700]] as const) {
      await page.setViewportSize({ width, height });
      await exit.focus();
      await expect(strip).toHaveCSS('opacity', '1');
      const m = await page.evaluate(() => {
        const root = document.querySelector('.projection')!;
        root.scrollTo(0, root.scrollHeight);
        const stripBox = document.querySelector('.projection-strip')!.getBoundingClientRect();
        const probe = document.createElement('div');
        probe.style.height = getComputedStyle(document.documentElement).getPropertyValue('--projection-strip-height').trim();
        document.body.append(probe);
        const limit = probe.getBoundingClientRect().height;
        probe.remove();
        let bottom = -Infinity;
        let who = '';
        for (const el of Array.from(document.querySelectorAll('.projection-body *'))) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0 && r.bottom > bottom) { bottom = r.bottom; who = `${el.tagName.toLowerCase()}.${(el as HTMLElement).className}`; }
        }
        return { strip: stripBox.height, stripTop: stripBox.top, limit, bottom, who };
      });
      expect(m.strip, `映す表示の帯の高さ（${width}×${height}）が --projection-strip-height（${m.limit}px）を超える`).toBeLessThanOrEqual(m.limit);
      expect(m.bottom, `映す表示（${width}×${height}）: 最下部で中身（${m.who}）が帯（上端 ${m.stripTop}）に隠れる`).toBeLessThanOrEqual(m.stripTop + 0.5);
    }
  });
});

test.describe('長い招待の URL', () => {
  test('Given 70 字以上の URL（日本語のルーム名） / When 320・639・640・768・1280 で見る / Then URL の箱が欄の内に収まり、ページが横に溢れない', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 768, height: 900 });
    await createPokerRoom(page, 'long-url');
    for (const width of [320, 639, 640, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const toggle = page.getByRole('button', { name: '仲間を招く' });
      if (await toggle.isVisible()) {
        if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
      }
      const m = await page.evaluate(() => {
        const url = document.querySelector('.ui-room-header-invite .ui-invite-url') as HTMLElement;
        url.textContent = `http://127.0.0.1:38557/?room=${'ながいなまえのへや'.repeat(8)}`;
        const share = document.querySelector('.ui-room-header-share')!.getBoundingClientRect();
        const r = url.getBoundingClientRect();
        return { right: r.right, shareRight: share.right, len: url.textContent!.length, scrollW: document.documentElement.scrollWidth, innerW: innerWidth };
      });
      expect(m.len, '長い URL（70 字以上）になっていない').toBeGreaterThanOrEqual(70);
      expect(m.right, `長い URL（${width}）の箱が欄（右端 ${m.shareRight}）の外へ出る`).toBeLessThanOrEqual(m.shareRight + 0.5);
      expect(m.scrollW, `長い URL（${width}）でページが横に溢れる`).toBeLessThanOrEqual(m.innerW);
    }
  });
});
