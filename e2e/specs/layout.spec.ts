/**
 * 器の幅と段組み・読む面（#316 PR 1・設計正本 D1〜D3・E3・E4）。
 *
 * **タグを付けない（`local` 専用）。** 本番のルーム枠を消費して確かめる種類のものではない。
 *
 * 段組みは 2 区画（操作の面 `.ui-workspace-main`・脇 `.ui-workspace-side`）。poker は脇が左の読む面、
 * お題ツールは脇が右の読む面（タブつき）、timer は脇が右の参加者・メモ。
 * 狭い幅の「続きを読む」→ シート → Esc → フォーカスが戻る検査は `invite-sheet-md.spec.ts` にあるので、ここでは重ねない。
 *
 * 区画の位置は**区画どうしの相対位置**で見る（px の直値で見ると器の余白を変えるたびに壊れる）。
 * 押せる大きさ（44px）は PR 1 では合否にせず、件数を注釈に出すだけにする（設計正本 D9）。
 */
import type { Page, TestInfo } from '@playwright/test';
import { expect, test } from '../fixtures/test';
import { chooseCard, createRoom as createPokerRoom, joinRoom as joinPokerRoom, participantRow } from '../support/poker';
import { createRoom as createTimerRoom, joinAsDriver } from '../support/timer';
import { joinTopicTool, openTopicTool, setTopic } from '../support/topic';

const REM = 16;
const MAIN_MIN = 32 * REM;

interface Box { x: number; y: number; width: number; height: number }

async function boxOf(page: Page, selector: string): Promise<Box> {
  const box = await page.locator(selector).first().boundingBox();
  if (box === null) throw new Error(`${selector} が描かれていない（判定が空振りする）`);
  return box;
}

/** 器の外寸と、余白を除いた内側の幅・右端。 */
async function pageBox(
  page: Page,
  // timer は器を `<main>` ではなく `Stage` の `div` に当てる。
  selector = 'main.ui-page',
): Promise<{ outer: number; inner: number; innerRight: number }> {
  return page.locator(selector).first().evaluate((el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      outer: r.width,
      inner: el.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight),
      innerRight: r.right - parseFloat(s.paddingRight),
    };
  });
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

/** 44px 未満の操作を注釈に出す（PR 1 では合否にしない）。 */
async function noteSmallTargets(page: Page, testInfo: TestInfo, label: string): Promise<void> {
  const small = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button, a[href], summary, [role="tab"]'))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44))
      .map(({ el, r }) => `${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)} ${Math.round(r.width)}x${Math.round(r.height)}`),
  );
  testInfo.annotations.push({ type: `44px 未満（${label}）`, description: `${small.length} 件: ${small.join(' / ')}` });
}

/** 40 行ほどの長い説明（Markdown の段落）。読む面の本文が札の中でスクロールすることを見る。 */
const LONG_BODY = Array.from({ length: 40 }, (_, i) => `${i + 1} 行目の説明です。`).join('\n\n');

type OpenPeer = (label: string) => Promise<{ page: Page }>;

/** poker のルームにお題を掲げ、脇（読む面）まで描かれた状態にする。返すのは参加用 URL。 */
async function openPokerWithTopic(page: Page, openPeer: OpenPeer, body = '3 のときは Fizz を出す'): Promise<string> {
  const url = await createPokerRoom(page, 'layout-a');
  const topic = await openPeer('layout-topic');
  await joinTopicTool(topic.page, url, 'layout-t');
  await setTopic(topic.page, 'FizzBuzz', body);
  await expect(page.getByRole('region', { name: 'お題', exact: true })).toBeVisible();
  return url;
}

/** 区切りの無い ASCII の長い名前（表示名の上限 40 字の内）。折り返す場所が無く、flex の子が縮まないと行からはみ出す。 */
const LONG_NAME = 'A'.repeat(30);

/**
 * 長い名前のゲストを入れて投票させ、場（参加者）の席に「投票済み」のバッジまで並んだ状態にする。
 * ホストは投票しない（全員が投票すると自動で公開され、バッジが消える）。
 */
async function addLongNameVoter(page: Page, url: string, openPeer: OpenPeer): Promise<void> {
  const guest = await openPeer('layout-long-name');
  await joinPokerRoom(guest.page, url, LONG_NAME);
  await chooseCard(guest.page, '5');
  await expect(participantRow(page, LONG_NAME).getByText('投票済み')).toBeVisible();
}

/**
 * 席ごとに、名前の箱が席（li）の左右に収まり、文字も名前の箱からはみ出さない。
 * 席は 6.5rem 固定で左から並ぶので、場（.participants）の右端と比べても、名前が席から溢れる誤りは見えない
 * （箱が広がっても場の右端に届かず、`overflow-wrap` を消した場合は箱でなく文字だけがはみ出す）。
 */
async function expectNamesFitSeats(page: Page): Promise<void> {
  const seats = await page.locator('.participants li').evaluateAll((lis) =>
    lis.flatMap((li) => {
      const name = li.querySelector('.name');
      if (name === null) return [];
      const l = li.getBoundingClientRect();
      const n = name.getBoundingClientRect();
      return [{ text: (name.textContent ?? '').slice(0, 20), inBox: n.left >= l.left - 0.5 && n.right <= l.right + 0.5, textFits: name.scrollWidth <= name.clientWidth }];
    }),
  );
  expect(seats.length).toBeGreaterThan(0);
  for (const seat of seats) {
    expect(seat.inBox, `${seat.text} の箱が席に収まる`).toBe(true);
    expect(seat.textFits, `${seat.text} の文字が名前の箱に収まる`).toBe(true);
  }
}

/** 読む面の本文が札の中でスクロールしている（本文の中身が枠より高い）。 */
async function expectBodyScrolls(page: Page): Promise<void> {
  expect(await page.locator('.ui-reader-body:visible').first().evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
}

/**
 * 読む面の高さが画面に収まる: 100dvh - 14rem（見出しと招待の行 約 9.5rem + 器の下の余白 4rem）以下。
 * 長い説明で読む面そのものが伸びていないことを守る。操作の面が長い画面でも成り立つ。
 */
async function expectReaderFitsScreen(page: Page): Promise<void> {
  const height = await page.locator('.ui-reader').first().evaluate((el) => el.getBoundingClientRect().height);
  expect(height).toBeLessThanOrEqual((page.viewportSize()?.height ?? 0) - 14 * REM + 0.5);
}

/**
 * 長い説明でページを伸ばさない。1 つ目（expectReaderFitsScreen）は読む面が伸びないこと、
 * 2 つ目は「操作の面が読む面より短い」画面で、ページ全体が画面 1 枚に収まること（スクロールバーが出ない）。
 * 操作の面が読む面より伸びる画面（お題ツール、参加者が多い poker）では 2 つ目を使わない（ページは操作の面の背丈で決まる）。
 * （読む面の高さの式が器の下の余白を引いていなかった間は、どの高さでもページが約 3.5rem はみ出していた。2026-10-11 に利用者が指摘）
 */
async function expectPageFitsScreen(page: Page): Promise<void> {
  await expectReaderFitsScreen(page);
  const { pageHeight, viewport } = await page.evaluate(() => ({ pageHeight: document.documentElement.scrollHeight, viewport: innerHeight }));
  expect(pageHeight, 'ページが画面より高く、スクロールバーが出る').toBeLessThanOrEqual(viewport);
}

/**
 * ページを本当の最下端までスクロールしても、読む面は画面の中に留まる（脇が sticky）。
 * 読む面の高さが器の下の余白（4rem）を引いていないと、最下端で段組みの下端が持ち上がり、上端が画面の外へ押し出される。
 */
async function expectReaderStaysOnScreen(page: Page): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const box = await boxOf(page, '.ui-reader');
  const viewportHeight = page.viewportSize()?.height ?? 0;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(viewportHeight + 0.5);
}

/**
 * 脇の区画（sticky で画面に留まるもの全体）の背丈が読む面の札と同じで、最下端までスクロールしても画面に収まる。
 * 札の最大の高さ（reader.css）は区画に札しか載らない前提で画面の高さから引いてある。脇に札以外の物（知らせなど）が
 * 載ると区画はその背丈ぶん画面の予算を超える（最終レビュー I3。1 行の知らせなら 32px の余りに収まって見えてしまうので、
 * 「収まる」だけでなく背丈の一致で見る）。
 */
async function expectSideIsReaderOnly(page: Page): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const side = await boxOf(page, '.ui-workspace-side');
  const reader = await boxOf(page, '.ui-reader');
  const viewportHeight = page.viewportSize()?.height ?? 0;
  expect(side.height, '脇の区画に読む面の札以外の物が載っている').toBeCloseTo(reader.height, 0);
  expect(side.y).toBeGreaterThanOrEqual(0);
  expect(side.y + side.height).toBeLessThanOrEqual(viewportHeight + 0.5);
}

/**
 * お題ツールの WS を実サーバーへ中継し、サーバーから届く `topic` フレームを「定型に落ちた」（`degraded: true`）に書き換える。
 * 実サーバーで定型に落とすには AI の失敗が要るので、届く状態の 1 項目だけを変える（製品コードにテスト用の経路は作らない・
 * `notices-a11y.spec.ts` と同じ方針）。中継はツールを開く前に掛けること（掛ける前に張られた接続は掴めない）。
 */
async function relayTopicSyncAsDegraded(page: Page): Promise<void> {
  await page.routeWebSocket(/\/ws\?.*\btool=topic\b/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((message) => server.send(message));
    server.onMessage((message) => {
      const frame = JSON.parse(String(message)) as { type?: string; state?: { degraded?: boolean } };
      if (frame.type === 'topic' && frame.state !== undefined) frame.state.degraded = true;
      ws.send(JSON.stringify(frame));
    });
  });
}

/** 操作の面が約 46rem で、器の内側の中央にある（左右の余白の差が 2px 以内）。 */
async function expectMainCentered(page: Page): Promise<void> {
  const inner = await pageBox(page);
  const main = await boxOf(page, '.ui-workspace-main');
  expect(Math.abs(main.width - 46 * REM)).toBeLessThanOrEqual(2);
  const left = main.x - (inner.innerRight - inner.inner);
  const right = inner.innerRight - (main.x + main.width);
  expect(Math.abs(left - right)).toBeLessThanOrEqual(2);
}

test.describe('poker のルームは広い画面で読む面と操作の面を並べる', () => {
  test('Given 幅 1920・長い説明 / When ルームを開く / Then 器は 1536px で、読む面が左・操作の面が右に揃い、ページは伸びず本文が札の中でスクロールする', async ({ page, openPeer }, testInfo) => {
    await page.setViewportSize({ width: 1920, height: 900 });
    await openPokerWithTopic(page, openPeer, LONG_BODY);
    expect((await pageBox(page)).outer).toBe(96 * REM);
    const reader = await boxOf(page, '.ui-reader');
    const main = await boxOf(page, '.ui-workspace-main');
    expect(reader.x + reader.width).toBeLessThanOrEqual(main.x);
    expect(main.width).toBeGreaterThanOrEqual(MAIN_MIN);
    expect(reader.y).toBeCloseTo(main.y, 0);
    await expectPageFitsScreen(page);
    await expectBodyScrolls(page);
    await noteSmallTargets(page, testInfo, 'poker 1920');
  });

  test('Given 幅 1280・長い説明・長い名前の参加者 / When ルームを開く / Then 器の内側は 1152px 以上で、読む面が左・操作の面が右に揃い、席は場の右端を越えない', async ({ page, openPeer }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const url = await openPokerWithTopic(page, openPeer, LONG_BODY);
    await addLongNameVoter(page, url, openPeer);
    expect((await pageBox(page)).inner).toBeGreaterThanOrEqual(72 * REM);
    const reader = await boxOf(page, '.ui-reader');
    const main = await boxOf(page, '.ui-workspace-main');
    expect(reader.x + reader.width).toBeLessThanOrEqual(main.x);
    expect(reader.y).toBeCloseTo(main.y, 0);
    expect(main.width).toBeGreaterThanOrEqual(MAIN_MIN);
    // 長い名前でも、名前は席（6.5rem）に収まる
    await expectNamesFitSeats(page);
    await expectPageFitsScreen(page);
    await expectBodyScrolls(page);
    // 操作の面が読む面より長い場面でも、読む面は伸びず、最下端まで画面に留まる
    await page.locator('.ui-workspace-main').evaluate((el) => { el.style.minHeight = '3000px'; });
    await expectReaderFitsScreen(page);
    await expectReaderStaysOnScreen(page);
  });

  test('Given 幅 1280・お題が無い / When ルームを開く / Then 脇が無く、場と手札は約 46rem で器の内側の中央にある', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await createPokerRoom(page, 'layout-no-topic');
    expect(await page.locator('.ui-workspace-side').count()).toBe(0);
    await expectMainCentered(page);
    // 手札は列の幅を使って 1 段に並ぶ（5 列の grid が 46rem の列の左へ寄って右半分が空かない）
    const tops = await page.locator('.card-hand .card').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
    expect(tops.length).toBe(10);
    expect(new Set(tops).size).toBe(1);
  });

  test('Given 幅 1280・お題を開いている / When ルームを開く / Then 「お題を隠す」は見出しと同じ行で、h1 の右隣にある', async ({ page, openPeer }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openPokerWithTopic(page, openPeer);
    const h1 = await boxOf(page, '.room header h1');
    const toggle = await page.getByRole('button', { name: 'お題を隠す' }).boundingBox();
    if (toggle === null) throw new Error('「お題を隠す」が描かれていない');
    expect(Math.abs(toggle.y + toggle.height / 2 - (h1.y + h1.height / 2))).toBeLessThanOrEqual(16);
    const gap = toggle.x - (h1.x + h1.width);
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThanOrEqual(48);
  });

  test('Given 幅 1280・お題を開いている / When ルームを開く / Then 札は操作の面より狭い（約 43%）', async ({ page, openPeer }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openPokerWithTopic(page, openPeer);
    const reader = await boxOf(page, '.ui-workspace-side');
    const main = await boxOf(page, '.ui-workspace-main');
    expect(reader.width).toBeLessThan(main.width);
    const ratio = reader.width / (reader.width + main.width);
    expect(ratio).toBeGreaterThan(0.41);
    expect(ratio).toBeLessThan(0.45);
  });

  test('Given 幅 1280・お題を開いている / When 「お題を隠す」を押す / Then 場と手札は約 46rem で中央に寄り、「お題を見る」で札が戻る', async ({ page, openPeer }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openPokerWithTopic(page, openPeer);
    await page.getByRole('button', { name: 'お題を隠す' }).click();
    await expect(page.getByRole('region', { name: 'お題', exact: true })).toHaveCount(0);
    await expectMainCentered(page);
    await page.getByRole('button', { name: 'お題を見る' }).click();
    await expect(page.getByRole('region', { name: 'お題', exact: true })).toBeVisible();
  });

  test('Given 幅 320・長い説明・長い名前の参加者 / When ルームを開く / Then 横に溢れず、お題 → 操作の面の順に積み、本文は 3 行で切れる', async ({ page, openPeer }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 900 });
    const url = await openPokerWithTopic(page, openPeer, LONG_BODY);
    await addLongNameVoter(page, url, openPeer);
    await expectNoHorizontalOverflow(page);
    await expectNamesFitSeats(page);
    const side = await boxOf(page, '.ui-workspace-side');
    const main = await boxOf(page, '.ui-workspace-main');
    expect(side.y + side.height).toBeLessThanOrEqual(main.y);
    expect(main.x).toBeCloseTo(side.x, 0);
    // 本文は 3 行で切れる（行の高さ × 3.5 まで）。続きは「続きを読む」のシート（invite-sheet-md.spec.ts が見る）
    const { height, lineHeight } = await page.locator('.ui-reader-body').evaluate((el) => ({
      height: el.getBoundingClientRect().height,
      lineHeight: parseFloat(getComputedStyle(el).lineHeight),
    }));
    expect(height).toBeLessThanOrEqual(lineHeight * 3.5);
    await noteSmallTargets(page, testInfo, 'poker 320');
  });
});

test.describe('お題ツールの部屋は読む面を右に持つ', () => {
  test('Given 幅 1920 / When 部屋を開く / Then 器は 1536px で、操作の面の右に読む面が並び、読む面の右端は器の内側の右端に揃う', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1920, height: 900 });
    await openTopicTool(page, 'layout-topic-wide');
    const box = await pageBox(page);
    expect(box.outer).toBe(96 * REM);
    const reader = await boxOf(page, '.ui-reader');
    const main = await boxOf(page, '.ui-workspace-main');
    expect(main.x + main.width).toBeLessThanOrEqual(reader.x);
    expect(reader.x + reader.width).toBeCloseTo(box.innerRight, 0);
    expect(reader.y).toBeCloseTo(main.y, 0);
    await noteSmallTargets(page, testInfo, 'お題ツール 1920');
  });

  test('Given 幅 1280・長い説明 / When お題を掲げる / Then 器の内側は 1152px 以上で、操作の面が左・読む面が右。本文は札の中でスクロールし、下までスクロールしても読む面は画面に留まる', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openTopicTool(page, 'layout-topic-mid');
    await setTopic(page, 'FizzBuzz', LONG_BODY);
    expect((await pageBox(page)).inner).toBeGreaterThanOrEqual(72 * REM);
    const reader = await boxOf(page, '.ui-reader');
    const main = await boxOf(page, '.ui-workspace-main');
    expect(main.x + main.width).toBeLessThanOrEqual(reader.x);
    expect(main.width).toBeGreaterThanOrEqual(MAIN_MIN);
    await expectBodyScrolls(page);
    await expectReaderFitsScreen(page);
    // 操作の面が長いのはお題ツール（作る・書く）。実画面で足りなければ背を伸ばして、下までスクロールできる場面を必ず作る
    await page.locator('.ui-workspace-main').evaluate((el) => { el.style.minHeight = '3000px'; });
    expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true);
    await expectReaderStaysOnScreen(page);
  });

  test('Given 幅 1280・長い説明 / When 定型に落ちた知らせが出ている / Then 知らせは操作の面にあり、下までスクロールしても読む面と脇の区画が画面に留まる', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    // Given: 届く状態を「定型に落ちた」に書き換える中継を掛けてから開く（知らせは立っている間ずっと出る）
    await relayTopicSyncAsDegraded(page);
    await openTopicTool(page, 'layout-topic-notice');
    // When: 長い説明のお題を掲げる
    await setTopic(page, 'FizzBuzz', LONG_BODY);
    await expect(page.getByRole('status').filter({ hasText: '定型のお題にしました' })).toBeVisible();
    await page.locator('.ui-workspace-main').evaluate((el) => { el.style.minHeight = '3000px'; });
    // Then
    await expectReaderStaysOnScreen(page);
    await expectSideIsReaderOnly(page);
  });

  test('Given 幅 320 / When 部屋を開く / Then 横に溢れず、場のお題 → 書く → 作るの順に積み、下に空きを残さない', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await openTopicTool(page, 'layout-topic-narrow');
    await expectNoHorizontalOverflow(page);
    const side = await boxOf(page, '.ui-workspace-side');
    const main = await boxOf(page, '.ui-workspace-main');
    const workspace = await boxOf(page, '.ui-workspace');
    expect(side.y + side.height).toBeLessThanOrEqual(main.y);
    expect(main.x).toBeCloseTo(side.x, 0);
    expect(workspace.y + workspace.height).toBeCloseTo(main.y + main.height, 0);
    await noteSmallTargets(page, testInfo, 'お題ツール 320');
  });
});

test.describe('玄関の器', () => {
  test('Given 幅 1280 / When 名乗る画面を開く / Then 器は 640px（読む・入力する）', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await expect(page.getByLabel('あなたの名前')).toBeVisible();
    expect((await pageBox(page)).outer).toBe(40 * REM);
    await noteSmallTargets(page, testInfo, '玄関 1280');
  });

  test('Given 幅 1280 / When ルームを作る / Then 道具選びの器は 1152px', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await page.getByLabel('あなたの名前').fill('layout-hub');
    await page.getByRole('button', { name: 'ルームを作る' }).click();
    await expect(page.getByRole('list', { name: 'ツール' })).toBeVisible();
    expect((await pageBox(page)).outer).toBe(72 * REM);
  });
});

test.describe('timer は 1 つのルームでロビー・セッション・お題・まとめの順に画面を見る', () => {
  test('Given 幅 320 のロビー（参加者 2 人） / When 幅 1920・1280 のロビー・セッション・長いお題・幅 390・まとめと開く / Then ロビーは脇が右・22rem で先頭がお題、セッションの脇は上端が揃い、お題は脇の先頭でタイマーは最初の画面に収まり、器は画面の用途の段（ロビー・セッションは wide・まとめは prose）', async ({ page, openPeer }) => {
    // 同期サーバーのルーム枠が逼迫しているので、timer は 1 室で画面の流れの順に全てを見る
    // （ロビー → セッション → お題の読む面 → まとめ。前の段階を戻す必要がある検査は置かない）。
    const TIMER_PAGE = 'div.ui-page.stage-inner';
    // Given 幅 320 のロビー。ホスト + ドライバーで加わる 1 人（ルームの枠が逼迫しているので、timer は 1 室で全ての画面を順に見る）
    await page.setViewportSize({ width: 320, height: 640 });
    const code = await createTimerRoom(page, 'layout-timer');
    const guest = await openPeer('layout-timer-guest');
    // 区切りのない 30 字の名前。名前が行の幅を使い切ると、操作が次の行へ折り返す（行の flex-wrap）ので、折り返しが無いと 320 で溢れる
    const guestName = 'W'.repeat(30);
    await joinAsDriver(guest.page, code, guestName);
    await expect(page.getByRole('listitem').filter({ hasText: guestName })).toBeVisible();
    await expect(page.getByLabel('パスフレーズ', { exact: true })).toBeVisible();

    // Then 320: ロビーは横に溢れない（B1）。パスフレーズの「設定」は縦に積まれ、字が折れない
    await expectNoHorizontalOverflow(page);
    // 「詳細設定」を拾わないよう名前は完全一致。高さは自分の 1 行ぶん（行の高さ + 縦の padding と枠）以下
    const setBtn = page.getByRole('button', { name: '設定', exact: true });
    await expect(setBtn).toBeVisible();
    // 字の行数を数える（`.ui-button` は高さを min-height で持つので、高さでは 2 行に折れても気づけない）
    const setLines = await setBtn.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return new Set(Array.from(range.getClientRects()).map((r) => Math.round(r.top))).size;
    });
    expect(setLines).toBe(1); // 「設／定」と 2 行に折れると 2 になる

    // When 幅 1280（お題も掲げる）。段の判定は幅 1920 を先に測る（お題の有無で器の段は変わらない）
    await page.setViewportSize({ width: 1920, height: 1080 });
    expect((await pageBox(page, TIMER_PAGE)).outer).toBe(96 * REM);
    await page.setViewportSize({ width: 1280, height: 900 });
    expect((await pageBox(page, TIMER_PAGE)).inner).toBeGreaterThanOrEqual(72 * REM);
    const tool = await openPeer('layout-timer-tool');
    await joinTopicTool(tool.page, `/?room=${encodeURIComponent(code)}`, 'layout-timer-t');
    await setTopic(tool.page, 'FizzBuzz', LONG_BODY);
    const card = page.getByRole('region', { name: 'お題', exact: true });
    await expect(card).toContainText('40 行目の説明です。');
    await expectNoHorizontalOverflow(page);

    // Then 脇は右・22rem・間 2rem。操作の面に「セッションを開始」、脇に「参加者」
    const main = await boxOf(page, '.ui-workspace-main');
    const side = await boxOf(page, '.ui-workspace-side');
    expect(main.x + main.width).toBeLessThanOrEqual(side.x);
    expect(side.width).toBeCloseTo(22 * REM, 0);
    expect(side.x - (main.x + main.width)).toBeCloseTo(2 * REM, 0);
    await expect(page.locator('.ui-workspace-main').getByRole('button', { name: 'セッションを開始' })).toBeVisible();
    await expect(page.locator('.ui-workspace-side').getByText(/^参加者 \(/)).toBeVisible();
    // お題は脇の先頭。長くても主役の操作を押し下げない（開始の上端 ≤ 札の上端・下端は最初の画面に収まる）
    const placement = await card.evaluate((el) => {
      const s = el.closest('.ui-workspace-side');
      return { inSide: s !== null, first: s?.firstElementChild === el };
    });
    expect(placement).toEqual({ inSide: true, first: true });
    const start = await page.getByRole('button', { name: 'セッションを開始' }).boundingBox();
    const topicBox = await card.boundingBox();
    if (start === null || topicBox === null) throw new Error('開始ボタンかお題が描かれていない');
    expect(start.y).toBeLessThanOrEqual(topicBox.y);
    expect(start.y + start.height).toBeLessThanOrEqual(900);

    // Then 行のアイコンの当たり（::before）は 44×44 で、隣の当たりと重ならない
    const hits = await page.locator('.lobby-row-icon-button').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        const b = getComputedStyle(el, '::before');
        const px = (v: string): number => parseFloat(v);
        // 絶対配置の擬似要素の used 値（top/left は px で返る）。幅・高さは inset から決まる
        const left = r.left + px(b.left) - px(getComputedStyle(el).borderLeftWidth);
        const top = r.top + px(b.top) - px(getComputedStyle(el).borderTopWidth);
        return { visible: r.width, left, top, width: px(b.width), height: px(b.height) };
      }),
    );
    expect(hits.length).toBeGreaterThanOrEqual(2);
    for (const h of hits) {
      expect(h.width).toBeGreaterThanOrEqual(44);
      expect(h.height).toBeGreaterThanOrEqual(44);
    }
    // どの 2 つの当たりも、横と縦の両方で重ならない（折り返した行どうしも含む）。丸め誤差 0.5px を許す。
    // 同じ行の組が 1 つも無いと横の検査が空振りするので、組の数も数える。
    let sameRowPairs = 0;
    for (let i = 0; i < hits.length; i++) {
      for (let j = i + 1; j < hits.length; j++) {
        const a = hits[i]!;
        const b = hits[j]!;
        const overlapX = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
        const overlapY = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
        if (Math.abs(a.top - b.top) < 1) sameRowPairs++;
        expect(overlapX > 0.5 && overlapY > 0.5, `当たり ${String(i)} と ${String(j)} が重なる（x ${String(overlapX)} / y ${String(overlapY)}）`).toBe(false);
      }
    }
    expect(sameRowPairs).toBeGreaterThan(0);

    // 幅 1280 でセッションを始める
    await page.getByRole('button', { name: 'セッションを開始' }).click();
    await expect(page.getByRole('timer')).toBeVisible();
    expect((await pageBox(page, TIMER_PAGE)).inner).toBeGreaterThanOrEqual(72 * REM);

    // Then セッションの脇は右・22rem・間 2rem で、上端は操作の面の上端に揃う（上に空きを作らない）
    // 脇が操作の面より背が高い場面を作る（実際の参加者の盤は主より低く、人数を増やすと主の方が先に伸びる）。
    // 後の高さの比較に残らないよう、測ったら戻す。
    await page.locator('.ui-workspace-side').evaluate((el) => { el.style.minHeight = '3000px'; });
    const sMain = await boxOf(page, '.ui-workspace-main');
    const sSide = await boxOf(page, '.ui-workspace-side');
    expect(sMain.x + sMain.width).toBeLessThanOrEqual(sSide.x);
    expect(sSide.width).toBeCloseTo(22 * REM, 0);
    expect(sSide.x - (sMain.x + sMain.width)).toBeCloseTo(2 * REM, 0);
    expect(sSide.y).toBeCloseTo(sMain.y, 0);
    // 行は 1 本: 段組みの下端は主と脇の低い方で、gap だけの空き行を下に残さない。
    const ws = await boxOf(page, '.ui-workspace');
    expect(ws.y + ws.height).toBeCloseTo(Math.max(sMain.y + sMain.height, sSide.y + sSide.height), 0);
    await page.locator('.ui-workspace-side').evaluate((el) => { el.style.minHeight = ''; });

    // Then お題は脇の先頭で、本文は札の中でスクロールし、札は上限（24rem）を超えない
    // 同じルームで、40 段落 → 80 段落の順に高さを比べる。札には高さの上限があるので、上限に届かない短い説明と比べると
    // 札のぶんだけ伸びて当然になる。どちらも上限を超える長さで比べ、「上限で止まり、それ以上はページを伸ばさない」を見る。
    await expect(card).toContainText('40 行目の説明です。');
    const sessionPlacement = await card.evaluate((el) => {
      const side = el.closest('.ui-workspace-side');
      return { inSide: side !== null, first: side?.firstElementChild === el };
    });
    expect(sessionPlacement).toEqual({ inSide: true, first: true });
    await expectBodyScrolls(page);
    expect((await boxOf(page, 'section.timer-topic')).height).toBeLessThanOrEqual(24 * REM + 0.5);
    // タイマーの下端は最初の画面（900）に収まる。お題が長くても主役を押し下げない
    const timer = await boxOf(page, '[role="timer"]');
    expect(timer.y + timer.height).toBeLessThanOrEqual(900);
    // お題の札の本文に Tab で入ると、フォーカスの輪は象牙の上で読める濃い色（--coal）になる（WCAG 1.4.11。金だと 1.2〜1.6:1）。
    // timer は要素層の `.ui-reader :focus-visible` を読まないので、timer 自身の規則が当たっていることを見る。
    await page.keyboard.press('Shift'); // キーボード操作のあとの focus() は :focus-visible になる
    const ringColors = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--coal)';
      document.body.append(probe);
      const coal = getComputedStyle(probe).color;
      probe.remove();
      const body = document.querySelector<HTMLElement>('section.timer-topic .ui-reader-body');
      if (body === null) return { coal, ring: 'なし', focused: false };
      body.focus();
      return { coal, ring: getComputedStyle(body).outlineColor, focused: document.activeElement === body };
    });
    expect(ringColors.focused).toBe(true);
    expect(ringColors.ring).toBe(ringColors.coal);
    const longHeight = await page.evaluate(() => document.documentElement.scrollHeight);

    // When 80 段落の説明に差し替える
    await setTopic(tool.page, 'FizzBuzz', `${LONG_BODY}\n\n${LONG_BODY.replaceAll('行目', '行目（続き）')}`);
    await expect(card).toContainText('40 行目（続き）の説明です。');
    // Then ページの高さは説明の長さで伸びない（40 段落と 80 段落で 1px 以内）
    const longerHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(Math.abs(longerHeight - longHeight)).toBeLessThanOrEqual(1);

    // When 幅 390
    await page.setViewportSize({ width: 390, height: 844 });
    // Then 札は 3 行で切れ、タイマーは最初の画面に収まる
    const clamp = await page.locator('.ui-reader-body').first().evaluate((el) => ({
      client: el.clientHeight,
      line: parseFloat(getComputedStyle(el).lineHeight),
      scroll: el.scrollHeight,
    }));
    expect(clamp.client).toBeLessThanOrEqual(clamp.line * 3 + 1);
    expect(clamp.scroll).toBeGreaterThan(clamp.client);
    const narrowTimer = await boxOf(page, '[role="timer"]');
    // 下端の帯（.ui-actions--dock）の裏に隠れないこと（画面の高さではなく帯の上端と比べる）
    const dockBox = await boxOf(page, '.ui-actions--dock');
    expect(narrowTimer.y + narrowTimer.height).toBeLessThanOrEqual(dockBox.y);
    await expectNoHorizontalOverflow(page);

    // 「続きを読む」でシートに全文が出て、Esc で閉じるとフォーカスが戻る
    const more = page.getByRole('button', { name: '続きを読む' });
    await more.click();
    const sheet = page.locator('dialog.ui-drawer');
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('40 行目の説明です。');
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(more).toBeFocused();

    // 幅 320 でセッションも横に溢れない
    await page.setViewportSize({ width: 320, height: 640 });
    await expectNoHorizontalOverflow(page);

    // 最後にまとめ（prose の段）。完成にすると戻れないので末尾に置く
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole('button', { name: /完成!/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: '完成として記録する' }).click();
    await expect(page.locator('.summary')).toBeVisible();
    expect((await pageBox(page, TIMER_PAGE)).outer).toBe(40 * REM);
  });
});
