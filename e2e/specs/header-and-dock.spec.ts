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

/** 見出しの全体の高さの上限（px）。poker の 320px で、題・戻る＋記録する・仲間を招くの 3 段（実測 約 150px）に収める。以前は 4 段で約 230px。 */
const HEADER_MAX_HEIGHT = 170;

/** 40rem 未満の帯の操作の段数の上限。 */
const DOCK_MAX_ROWS = 2;

/** 帯のボタンの高さの上限。`--lg` で 48px 前後。字が 2 行に折れると 70px 前後になる。 */
const DOCK_MAX_BUTTON_HEIGHT = 56;

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

/** 戻る導線の字の左端が、題の字の左端と揃う（40rem 未満・どちらも先頭の列にあるとき）。 */
async function expectBackAlignedWithTitle(page: Page, label: string): Promise<void> {
  const m = await page.evaluate(() => {
    const h1 = document.querySelector('.ui-room-header h1');
    const back = document.querySelector('.ui-room-header .ui-page-header-back');
    const ink = (el: Element): DOMRect => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return range.getBoundingClientRect();
    };
    return h1 && back ? { title: ink(h1).left, back: ink(back).left } : null;
  });
  expect(m, `${label}: 題か戻るが描かれていない`).not.toBeNull();
  expect(Math.abs(m!.back - m!.title), `${label}: 戻るの字の左端（${m!.back}）が題（${m!.title}）と揃わない`).toBeLessThanOrEqual(1);
}

interface DockFacts {
  rows: number;
  height: number;
  paddingTop: number;
  /** 帯の中のボタンの最大の高さ。字が 2 行に折れると 44px を大きく超える。 */
  maxButtonHeight: number;
  alpha: number;
  backgroundImage: string;
  position: string;
}

/** 帯の操作の段数（直接の子のうちボタンと選択欄の、縦の位置の種類）・高さ・上の余白・地の不透明さ。 */
async function dockFacts(dock: Locator): Promise<DockFacts> {
  return dock.evaluate((el) => {
    const cs = getComputedStyle(el);
    const tops: number[] = [];
    let maxButtonHeight = 0;
    for (const child of Array.from(el.querySelectorAll('button, select, a'))) {
      const r = child.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (child.tagName === 'BUTTON') maxButtonHeight = Math.max(maxButtonHeight, r.height);
      if (!tops.some((t) => Math.abs(t - r.top) < r.height / 2)) tops.push(r.top);
    }
    const match = /rgba?\(([^)]+)\)/.exec(cs.backgroundColor);
    const parts = match ? match[1]!.split(/[,/ ]+/).filter(Boolean) : [];
    return {
      rows: tops.length,
      height: el.getBoundingClientRect().height,
      paddingTop: parseFloat(cs.paddingTop),
      maxButtonHeight,
      alpha: parts.length >= 4 ? parseFloat(parts[3]!) : match ? 1 : 0,
      backgroundImage: cs.backgroundImage,
      position: cs.position,
    };
  });
}

/** 40rem・64rem 未満の帯が約束（不透明・上の余白・段数）を守る。 */
async function expectDockContract(dock: Locator, label: string, maxRows = DOCK_MAX_ROWS): Promise<void> {
  const f = await dockFacts(dock);
  expect(f.alpha, `${label}: 帯の地が不透明でない（α=${f.alpha}）。字の後ろに中身が透ける`).toBe(1);
  expect(f.backgroundImage, `${label}: 帯の地に透明へ溶けるグラデーションがある`).toBe('none');
  expect(f.paddingTop, `${label}: 帯の上端の内側の余白が ${DOCK_MIN_PADDING_TOP}px 未満`).toBeGreaterThanOrEqual(DOCK_MIN_PADDING_TOP);
  expect(f.maxButtonHeight, `${label}: 帯のボタンの字が折れている（高さ ${f.maxButtonHeight}px）`).toBeLessThanOrEqual(DOCK_MAX_BUTTON_HEIGHT);
  expect(f.rows, `${label}: 帯の操作が ${f.rows} 段（${maxRows} 段まで）`).toBeLessThanOrEqual(maxRows);
}

/** 最下部までスクロールしたとき、帯の外の中身の最下端が帯の上端より上にある（覆われた中身が最後まで見える）。 */
async function expectContentClearOfDock(page: Page, dock: Locator, label: string): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const m = await dock.evaluate((el) => {
    const parent = el.parentElement!;
    let contentBottom = -Infinity;
    let who = '';
    for (const other of Array.from(parent.querySelectorAll('*'))) {
      if (el.contains(other) || other === el) continue;
      if (['absolute', 'fixed'].includes(getComputedStyle(other).position)) continue;
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
      await expectDockContract(dock, `agenda 進行中（${width}）`);
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
    await page.waitForTimeout(800);
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
