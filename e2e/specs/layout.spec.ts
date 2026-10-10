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
import { createRoom as createTimerRoom } from '../support/timer';
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
async function pageBox(page: Page): Promise<{ outer: number; inner: number; innerRight: number }> {
  return page.locator('main.ui-page').evaluate((el) => {
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
 * 読む面の高さが画面に収まる: 100dvh - 10rem（見出しと招待の行 約 9.5rem + 器の下の余白 4rem を含む）以下。
 * 長い説明で読む面そのものが伸びていないことを守る。操作の面が長い画面でも成り立つ。
 */
async function expectReaderFitsScreen(page: Page): Promise<void> {
  const height = await page.locator('.ui-reader').first().evaluate((el) => el.getBoundingClientRect().height);
  expect(height).toBeLessThanOrEqual((page.viewportSize()?.height ?? 0) - 10 * REM + 0.5);
}

/**
 * 長い説明でページを伸ばさない。1 つ目（expectReaderFitsScreen）は読む面が伸びないこと、
 * 2 つ目は「操作の面が読む面より短い」画面で、ページ全体が読む面の下端 + 器の下の余白（4rem）に収まること（画面 1 枚ぶん）。
 * 操作の面が読む面より伸びる画面（お題ツール、参加者が多い poker）では 2 つ目を使わない（ページは操作の面の背丈で決まる）。
 * （ページ全体を `innerHeight + 2rem` で測ると、読む面の上にある見出し・招待リンクの背丈だけで超える。）
 */
async function expectPageFitsScreen(page: Page): Promise<void> {
  await expectReaderFitsScreen(page);
  const { pageHeight, readerBottom } = await page.evaluate(() => {
    const r = document.querySelector('.ui-reader')!.getBoundingClientRect();
    return { pageHeight: document.documentElement.scrollHeight, readerBottom: r.bottom + scrollY };
  });
  expect(pageHeight).toBeLessThanOrEqual(readerBottom + 4 * REM + 0.5);
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

test.describe('timer のセッションは脇を右に持つ', () => {
  test('Given 幅 1280 / When セッションを始める / Then 脇は右・22rem・間 2rem で、上端は操作の面の上端に揃う（上に空きを作らない）', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await createTimerRoom(page, 'layout-timer');
    await page.getByRole('button', { name: 'セッションを開始' }).click();
    await expect(page.getByRole('timer')).toBeVisible();
    // 脇が操作の面より背が高い場面を作る（実際の参加者の盤は主より低く、人数を増やすと主の方が先に伸びる）。
    await page.locator('.ui-workspace-side').evaluate((el) => { el.style.minHeight = '3000px'; });
    const main = await boxOf(page, '.ui-workspace-main');
    const side = await boxOf(page, '.ui-workspace-side');
    expect(main.x + main.width).toBeLessThanOrEqual(side.x);
    expect(side.width).toBeCloseTo(22 * REM, 0);
    expect(side.x - (main.x + main.width)).toBeCloseTo(2 * REM, 0);
    expect(side.y).toBeCloseTo(main.y, 0);
    // 行は 1 本: 段組みの下端は主と脇の低い方で、gap だけの空き行を下に残さない。
    const ws = await boxOf(page, '.ui-workspace');
    expect(ws.y + ws.height).toBeCloseTo(Math.max(main.y + main.height, side.y + side.height), 0);
  });
});
