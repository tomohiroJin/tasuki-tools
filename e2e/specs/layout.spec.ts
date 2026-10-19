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
 * 押せる大きさ（44px）とボタンの字の折れは、`buttons.spec.ts` が全画面・4 つの幅で合否にする（#316 PR 4・`expectScreenAcrossWidths`）。
 */
import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures/test';
import { chooseCard, createRoom as createPokerRoom, joinRoom as joinPokerRoom, participantRow, turnRecordingOn } from '../support/poker';
import { createRoom as createTimerRoom, joinAsDriver } from '../support/timer';
import {
  AFTER_LINK_HREF,
  AFTER_LINK_NAME,
  expectNarrowTabSkipsPreviewLink,
  expectWideTabReachesBodyLink,
  joinTopicTool,
  openTopicTool,
  setTopic,
} from '../support/topic';

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

/**
 * まとめの統計の札 3 枚の位置と、値の字が札の内側に収まっているか（#352・設計 L4・L5）。
 * 収まりは値の文字の Range の矩形と、札の矩形から枠と余白を引いた内側で比べる（`scrollWidth` やクラスの値を読まない）。
 */
async function summaryStatCards(page: Page): Promise<Array<{ top: number; left: number; fits: boolean; text: string }>> {
  return page.locator('.summary-stats > .summary-stat').evaluateAll((cards) =>
    cards.map((card) => {
      const r = card.getBoundingClientRect();
      const s = getComputedStyle(card);
      const px = (v: string): number => parseFloat(v);
      const innerLeft = r.left + px(s.borderLeftWidth) + px(s.paddingLeft);
      const innerRight = r.right - px(s.borderRightWidth) - px(s.paddingRight);
      const value = card.querySelector('.summary-stat-value');
      if (value === null) return { top: r.top, left: r.left, fits: false, text: '値が描かれていない' };
      const range = document.createRange();
      range.selectNodeContents(value);
      const t = range.getBoundingClientRect();
      return {
        top: r.top,
        left: r.left,
        fits: t.width > 0 && t.left >= innerLeft - 0.5 && t.right <= innerRight + 0.5,
        text: value.textContent ?? '',
      };
    }),
  );
}

/** 札 3 枚が縦に積まれている（上端が狭義に増え、左端が揃う）か、横に並んでいる（上端が揃う）かを見る。 */
async function expectStatCards(page: Page, arrangement: 'stacked' | 'row', label: string): Promise<void> {
  const cards = await summaryStatCards(page);
  expect(cards, `${label}: 統計の札は 3 枚`).toHaveLength(3);
  // 収まりを先に見る（並びを壊した破壊検証で、はみ出しが実在するかを並びの赤と分けて読むため）
  for (const c of cards) expect(c.fits, `${label}: 「${c.text}」が札の内側からはみ出す`).toBe(true);
  const [a, b, c] = cards as [(typeof cards)[0], (typeof cards)[0], (typeof cards)[0]];
  if (arrangement === 'stacked') {
    expect(a.top < b.top && b.top < c.top, `${label}: 札が縦に積まれていない`).toBe(true);
    expect(Math.abs(a.left - b.left) <= 1 && Math.abs(b.left - c.left) <= 1, `${label}: 積んだ札の左端が揃わない`).toBe(true);
  } else {
    expect(Math.abs(a.top - b.top) <= 1 && Math.abs(b.top - c.top) <= 1, `${label}: 札が横に並んでいない`).toBe(true);
  }
}

/** 40 行ほどの長い説明（Markdown の段落）。読む面の本文が札の中でスクロールすることを見る。 */
const LONG_BODY = Array.from({ length: 40 }, (_, i) => `${i + 1} 行目の説明です。`).join('\n\n');
/** LONG_BODY の 4 段落目にリンクを足したもの（3 行で切った先に来る。Tab が止まるかを見る・#316 PR 4）。 */
const LINKED_LONG_BODY = LONG_BODY.replace('4 行目の説明です。', `4 行目の説明です。[${AFTER_LINK_NAME}](${AFTER_LINK_HREF})`);

type OpenPeer = (label: string) => Promise<{ page: Page }>;

/**
 * お題が届いたときの段組みの移り変わり（列が 0 から広がる 0.32 秒・#348 D7）が終わるのを待つ。
 * 待たずに区画の幅や位置を測ると、広がる途中の値を読む（実測: 札の比が 0.43 でなく 0.40、
 * 滑りの物差しの「開いた位置」が閉じた位置とほぼ同じ）。
 */
async function settleWorkspace(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const workspace = document.querySelector('.room .ui-workspace--reader');
    if (workspace === null) throw new Error('段組みが無い');
    // 状態を替えた直後は移り変わりがまだ始まっていない（getAnimations が空）ので、2 フレーム進めてから待つ
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    await Promise.all(workspace.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => undefined)));
  });
}

/** poker のルームにお題を掲げ、脇（読む面）まで描かれた状態にする。返すのは参加用 URL。 */
async function openPokerWithTopic(page: Page, openPeer: OpenPeer, body = '3 のときは Fizz を出す'): Promise<string> {
  return (await openPokerWithTopicTool(page, openPeer, body)).url;
}

/**
 * `openPokerWithTopic` と同じ状態にし、お題ツールの頁も返す（お題を下ろす・掲げ直すテストが使う・#348）。
 * お題が届いたときの段組みの移り変わりが終わるまで待ってから返す。
 */
async function openPokerWithTopicTool(
  page: Page,
  openPeer: OpenPeer,
  body = '3 のときは Fizz を出す',
): Promise<{ url: string; topicPage: Page }> {
  const url = await createPokerRoom(page, 'layout-a');
  const topic = await openPeer('layout-topic');
  await joinTopicTool(topic.page, url, 'layout-t');
  await setTopic(topic.page, 'FizzBuzz', body);
  await expect(page.getByRole('region', { name: 'お題', exact: true })).toBeVisible();
  await settleWorkspace(page);
  return { url, topicPage: topic.page };
}

/** 手札の行ごとの札の枚数（上から）。5 × 2 は [5, 5]、割れた並びは [9, 1]。段の数だけでは両者を区別できない。 */
async function cardHandRowSizes(page: Page): Promise<number[]> {
  const tops = await page.locator('.card-hand .card').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
  expect(tops.length).toBe(10);
  const counts = new Map<number, number>();
  for (const top of tops) counts.set(top, (counts.get(top) ?? 0) + 1);
  return [...counts.entries()].sort(([a], [b]) => a - b).map(([, n]) => n);
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

test.describe('poker のルームは広い画面で読む面と操作の面を並べる', () => {
  test('Given 幅 1920・長い説明 / When ルームを開く / Then 器は 1536px で、読む面が左・操作の面が右に揃い、ページは伸びず本文が札の中でスクロールする', async ({ page, openPeer }) => {
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
    // 手札は操作の面の幅で決まる（#348 D9）。1920 では約 53rem あるので、お題を開いていても 1 行に並ぶ
    expect(await cardHandRowSizes(page), '1920 の開いた状態の手札は 1 行').toEqual([10]);
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

  test('Given 幅 1280・お題が無い / When ルームを開く / Then 脇に記録があり、操作の面は右の列にある', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await createPokerRoom(page, 'layout-no-topic');
    // 記録は既定で切れていて、脇は記録を入れたときに出る（#427・設計 D）
    await turnRecordingOn(page);
    // 脇は記録がある間は在る（お題が無くても記録を持つ）。札の包みは無い
    expect(await page.locator('.room-side').count()).toBe(1);
    expect(await page.locator('.room-topic-side').count()).toBe(0);
    const log = page.locator('.room-log--side');
    await expect(log).toBeVisible();
    await expect(log.getByRole('heading', { name: '見積もりの記録' })).toBeVisible();
    await expect(log.getByText('開票すると、ここに残ります')).toBeVisible();
    // 操作の面は脇の右の列。中央に寄せない（46rem に絞らず、列の幅いっぱい）
    const side = await boxOf(page, '.ui-workspace-side');
    const main = await boxOf(page, '.ui-workspace-main');
    expect(side.x + side.width).toBeLessThanOrEqual(main.x);
    expect(side.y).toBeCloseTo(main.y, 0);
    //   （1280 の列は脇 0.75fr・操作の面 1fr で約 41rem。かつての 46rem の中央寄せはもう無い）
    expect(main.width).toBeGreaterThanOrEqual(MAIN_MIN);
    const inner = await pageBox(page);
    expect(Math.abs(main.x + main.width - inner.innerRight), '操作の面の右端が器の内側の右端に揃う').toBeLessThanOrEqual(2);
    // 足の記録は 64rem 以上では描かれない
    await expect(page.locator('.room-log--foot')).toBeHidden();
    // 手札は列の幅を使って 1 段に並ぶ
    const tops = await page.locator('.card-hand .card').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
    expect(tops.length).toBe(10);
    expect(new Set(tops).size).toBe(1);
  });

  test('Given 幅 1280・高さ 800・お題あり・記録する・6 束 / When ルームを開く / Then お題の札と記録の札は左端がそろい、記録のスクロールバーは札の右端に寄り、お題は札の外へはみ出さない（#427）', async ({ page, openPeer }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    // 実測した場面: 短い本文でも、脇の高さの中で札が縮み、本文が記録の札の裏へはみ出していた
    await openPokerWithTopic(page, openPeer);
    await page.getByRole('button', { name: '記録する' }).click();
    for (let i = 0; i < 6; i += 1) {
      await chooseCard(page, '5');
      await page.getByRole('button', { name: '次のアイテムへ' }).click();
    }
    const log = page.locator('.room-log--side');
    await expect(log.locator('.estimate-group')).toHaveCount(6);
    // お題の見出しと記録の見出しの左端: 札の左右・中身の幅がそろう
    const topicHead = await boxOf(page, '.room-topic-side .topic-head h2');
    const logHead = await boxOf(page, '.room-log--side h2');
    expect(Math.abs(topicHead.x - logHead.x), '見出しの左端がずれている').toBeLessThanOrEqual(1);
    const cardBox = await boxOf(page, '.room-topic-side > .ui-reader');
    const logBox = await boxOf(page, '.room-log--side');
    expect(Math.abs(cardBox.x - logBox.x), '札の左端がずれている').toBeLessThanOrEqual(1);
    expect(Math.abs(cardBox.x + cardBox.width - (logBox.x + logBox.width)), '札の右端がずれている').toBeLessThanOrEqual(1);
    // 記録の本文: 右端は札の枠の内側の右端（枠 1px）から 2px 以内。スクロールバーは札の右端に出る
    const m = await page.locator('.room-log--side').evaluate((el) => {
      const card = el.getBoundingClientRect();
      const border = parseFloat(getComputedStyle(el).borderRightWidth);
      const body = el.querySelector('.estimate-log-body')!;
      const b = body.getBoundingClientRect();
      const sel = el.querySelector('.estimate-group-head select')!.getBoundingClientRect();
      return {
        cardInnerRight: card.right - border,
        bodyRight: b.right,
        scrollable: body.scrollHeight > body.clientHeight,
        selectRight: sel.right,
        scrollRangeRight: b.left + body.clientWidth,
      };
    });
    expect(m.scrollable, '記録が溢れていない（前提が崩れている）').toBe(true);
    expect(Math.abs(m.cardInnerRight - m.bodyRight), '記録の本文の右端が札の内側の右端から離れている').toBeLessThanOrEqual(2);
    expect(m.scrollRangeRight - m.selectRight, 'ポイントの欄がスクロールバーに近すぎる').toBeGreaterThanOrEqual(16);
    // お題の札の中身が札の外へはみ出さない（描かれている子の下端が札の下端以内。溢れるなら本文が札の中でスクロールする）
    const spill = await page.locator('.room-topic-side > .ui-reader').evaluate((el) => {
      const card = el.getBoundingClientRect();
      const worst = Math.max(...[...el.children]
        .filter((k) => getComputedStyle(k).display !== 'none')
        .map((k) => k.getBoundingClientRect().bottom - card.bottom));
      return { worst, scroll: el.scrollHeight - el.clientHeight };
    });
    expect(spill.worst, 'お題の中身が札の下へはみ出している').toBeLessThanOrEqual(1);
    expect(spill.scroll, 'お題の札が内側で溢れている').toBeLessThanOrEqual(1);
    // 記録の見出しが画面の中に見える
    expect(logHead.y, '記録の見出しが画面の外').toBeGreaterThanOrEqual(0);
    expect(logHead.y + logHead.height, '記録の見出しが画面の外').toBeLessThanOrEqual(800);
    await expect(log.getByRole('heading', { name: '見積もりの記録' })).toBeInViewport();
  });

  test('Given 幅 1280・高さ 700・長いお題・記録する / When ルームを開く / Then 記録の見出しが画面に見え、札と重ならない（#427）', async ({ page, openPeer }) => {
    await page.setViewportSize({ width: 1280, height: 700 });
    await openPokerWithTopic(page, openPeer, LONG_BODY);
    await page.getByRole('button', { name: '記録する' }).click();
    const heading = page.locator('.room-log--side').getByRole('heading', { name: '見積もりの記録' });
    await expect(heading).toBeInViewport();
    const card = await boxOf(page, '.room-topic-side');
    const h = await heading.boundingBox();
    expect(h!.y, '記録の見出しが札の下端に食い込んでいる').toBeGreaterThanOrEqual(card.y + card.height - 1);
    const body = await page.locator('.room-topic-side .ui-reader-body').evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }));
    expect(body.scroll, '本文が札の中で溢れていない（前提が崩れている）').toBeGreaterThan(body.client + 1);
  });

  test('Given 幅 1280・記録しない / When 「記録する」を押す / Then 押した状態と押さない状態で見た目が違う（#427）', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await createPokerRoom(page, 'layout-toggle');
    const toggle = page.getByRole('button', { name: '記録する' });
    const look = () => toggle.evaluate((el) => { const s = getComputedStyle(el); return `${s.backgroundColor}|${s.boxShadow}`; });
    const off = await look();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(await look(), '押した状態が押さない状態と同じ見た目').not.toBe(off);
  });

  test('Given 幅 1280・記録しない・お題を隠した / When ルームを開く / Then 左に空の列を残さず、操作の面は 46rem で中央に寄る（#427）', async ({ page, openPeer }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openPokerWithTopic(page, openPeer);
    await page.getByRole('button', { name: 'お題を隠す' }).click();
    await expect(page.getByRole('button', { name: 'お題を見る' })).toBeVisible();
    await expect.poll(async () => Math.round((await boxOf(page, '.ui-workspace-main')).width), '操作の面が 46rem に落ち着かない').toBe(46 * REM);
    const main = await boxOf(page, '.ui-workspace-main');
    const inner = await pageBox(page);
    const left = main.x - (inner.innerRight - inner.inner);
    const right = inner.innerRight - (main.x + main.width);
    expect(Math.abs(left - right), '操作の面が中央に寄っていない').toBeLessThanOrEqual(2);
  });

  test('Given 幅 1280・記録しない・お題あり / When 「お題を隠す」を押す / Then 隠した直後から閉じ切るまで、閉じかけの札は操作の面（手札）に重ならない（#427・v4.1.0 の規則）', async ({ page, openPeer }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openPokerWithTopic(page, openPeer);
    const overlap = async (): Promise<number> => {
      // 2 つの箱を別々に測ると、その間に移り変わりが進んで見かけの重なりが出る。1 回の評価で同じ瞬間に測る
      return page.evaluate(() => {
        const side = document.querySelector('.room-topic-side')?.getBoundingClientRect();
        const main = document.querySelector('.ui-workspace-main')?.getBoundingClientRect();
        if (side === undefined || main === undefined) throw new Error('札か操作の面が描かれていない（判定が空振りする）');
        return side.right - main.left; // 正なら札の包みの右端が操作の面へ食い込んでいる
      });
    };
    expect(await overlap(), '開いているとき、札と操作の面が重なっている').toBeLessThanOrEqual(1);
    await page.getByRole('button', { name: 'お題を隠す' }).click();
    expect(await overlap(), '隠した直後に、閉じかけの札が操作の面に重なっている').toBeLessThanOrEqual(1);
    await page.waitForTimeout(400);
    expect(await overlap(), '0.4 秒後に、閉じかけの札が操作の面に重なっている').toBeLessThanOrEqual(1);
    // 閉じ切った後は札の包みの幅が 0 に向かい（列は 2 本のまま）、操作の面は 46rem で中央に落ち着く
    expect((await boxOf(page, '.room-topic-side')).width, '閉じた札の包みの幅が 0 にならない').toBeLessThanOrEqual(1);
    expect(Math.round((await boxOf(page, '.ui-workspace-main')).width)).toBe(46 * REM);
  });

  test('Given 幅 1280・記録しない・お題が無い / When ルームを開く / Then 脇も空の列も無く、操作の面は 46rem で中央に寄る（#427）', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await createPokerRoom(page, 'layout-no-side');
    expect(await page.locator('.room-side').count(), '脇が描かれている').toBe(0);
    const main = await boxOf(page, '.ui-workspace-main');
    const inner = await pageBox(page);
    expect(main.width, '操作の面は 46rem').toBeCloseTo(46 * REM, 0);
    const left = main.x - (inner.innerRight - inner.inner);
    const right = inner.innerRight - (main.x + main.width);
    expect(Math.abs(left - right), '操作の面が中央に寄っていない').toBeLessThanOrEqual(2);
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
    // 手札の並びは操作の面の幅で決まる（#348 D9）。1280 の開いた状態の操作の面は約 41.1rem
    //   （(1280 - 器の余白 96 - 間隔 32) / 1.75）で、10 枚が 1 行に収まる幅（38.95rem）を超えるので 1 行。
    //   脇の有無で決める誤り（#348 より前の規則）だと、ここが 5 × 2 になる
    expect(await cardHandRowSizes(page), '1280 の開いた状態の手札は 1 行').toEqual([10]);
    //   閉じても（札だけが畳まれ、操作の面の幅は同じ）同じ 1 行で、出し入れで手札が組み替わらない
    await page.getByRole('button', { name: 'お題を隠す' }).click();
    await expect(page.locator('.room-topic-side')).toHaveAttribute('data-state', 'closed');
    expect(await cardHandRowSizes(page), '1280 の閉じた状態の手札は 1 行').toEqual([10]);
    // 1100 の開いた状態は操作の面が約 35rem で 10 枚が収まらない。9 + 1 に割れず 5 × 2 に揃う（コンテナクエリが効いている）
    await page.setViewportSize({ width: 1100, height: 900 });
    await page.getByRole('button', { name: 'お題を見る' }).click();
    await expect.poll(() => cardHandRowSizes(page), '1100 の開いた状態の手札は 5 × 2').toEqual([5, 5]);
  });

  // 隠す・見せる・下ろす・掲げ直すを 1 つのルームで測る。以前は同期サーバーのルーム枠（100）を E2E 全件でちょうど使い切っていたので、
  // 1 つにまとめた（#348）。#387 で E2E の枠は広げたが、動いている検査なのでほどかない
  test('Given 幅 1280・お題を開いている / When 「お題を隠す」「お題を見る」を押し、お題が下ろされ、掲げ直される / Then 札だけが畳まれて記録の上端が脇の上端に寄り、操作の面は動かず、閉じた札は高さ 0・Tab の行き先にならない', async ({ page, openPeer }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const { topicPage } = await openPokerWithTopicTool(page, openPeer, LONG_BODY);
    await turnRecordingOn(page);
    const topic = page.locator('.room-topic-side');
    const logHeading = page.locator('.room-log--side').getByRole('heading', { name: '見積もりの記録' });
    const logTop = async () => (await logHeading.boundingBox())!.y;

    // 開いている間: 記録は札の下にある
    const mainOpen = await boxOf(page, '.ui-workspace-main');
    const sideBox = await boxOf(page, '.ui-workspace-side');
    const cardOpen = await boxOf(page, '.room-topic-side');
    const openLogTop = await logTop();
    expect(openLogTop, '開いた状態で記録の見出しが札の下端より上にある').toBeGreaterThanOrEqual(cardOpen.y + cardOpen.height - 1);

    // 隠す: 札だけが畳まれる
    await page.getByRole('button', { name: 'お題を隠す' }).click();
    await expect(topic).toHaveAttribute('data-state', 'closed');
    await expect.poll(() => topic.evaluate((el) => el.getBoundingClientRect().height), '閉じた札が高さ 0 にならない').toBeLessThanOrEqual(1);
    await expect.poll(() => topic.evaluate((el) => getComputedStyle(el).visibility), '閉じた札が隠れない').toBe('hidden');
    // 記録の上端が脇の上端に寄る（札のあった所へ繰り上がる）
    await expect.poll(async () => Math.abs((await logTop()) - sideBox.y), '記録の上端が脇の上端に寄らない').toBeLessThanOrEqual(48);
    expect(await logTop()).toBeLessThan(openLogTop);
    // 操作の面は動かない（x・幅とも同じ。列は動かない）
    const mainClosed = await boxOf(page, '.ui-workspace-main');
    expect(mainClosed.x, '隠すと操作の面の左端が動いた').toBeCloseTo(mainOpen.x, 0);
    expect(mainClosed.width, '隠すと操作の面の幅が変わった').toBeCloseTo(mainOpen.width, 0);

    // 読み上げからも外れ、aria-controls の指し先は残る。押したボタンにフォーカスが残る
    await expect(page.getByRole('region', { name: 'お題', exact: true })).toHaveCount(0);
    await expect(page.locator('#poker-topic-card'), 'aria-controls の指し先が消えた').toHaveCount(1);
    const show = page.getByRole('button', { name: 'お題を見る' });
    await expect(show).toHaveAttribute('aria-expanded', 'false');
    await expect(show, '押したボタンからフォーカスが落ちた').toBeFocused();

    // Tab: 閉じた札（見えない）へフォーカスが入らない。記録の領域は脇に残る
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press('Tab');
      expect(
        await page.evaluate(() => document.activeElement?.closest('.room-topic-side') ?? null),
        `Tab ${i + 1} 回目で閉じた札にフォーカスが入った`,
      ).toBeNull();
    }
    await show.focus();

    // 見せる: 札が戻り、記録は札の下へ、操作の面は動かない
    await show.click();
    await expect(topic).toHaveAttribute('data-state', 'open');
    await expect(page.getByRole('region', { name: 'お題', exact: true })).toBeVisible();
    await settleWorkspace(page);
    const mainReopened = await boxOf(page, '.ui-workspace-main');
    expect(mainReopened.x).toBeCloseTo(mainOpen.x, 0);
    expect(mainReopened.width).toBeCloseTo(mainOpen.width, 0);

    // 下ろす: 札の包みは DOM から外れる（お題の中身が無いので残せない）が、脇と記録は残り、操作の面は動かない
    await topicPage.getByRole('button', { name: '場から下げる' }).click();
    await expect(topic).toHaveCount(0);
    await settleWorkspace(page);
    await expect(page.locator('.room-side')).toHaveCount(1);
    await expect(logHeading).toBeVisible();
    const mainNoTopic = await boxOf(page, '.ui-workspace-main');
    expect(mainNoTopic.x, 'お題が下ろされて操作の面が動いた').toBeCloseTo(mainOpen.x, 0);
    expect(mainNoTopic.width, 'お題が下ろされて操作の面の幅が変わった').toBeCloseTo(mainOpen.width, 0);

    // 掲げ直す: 札の包みが足され、記録は札の下に戻る。操作の面は動かない
    await setTopic(topicPage, 'FizzBuzz2', '次のお題');
    await expect(page.getByRole('region', { name: 'お題', exact: true })).toBeVisible();
    await settleWorkspace(page);
    const mainRaised = await boxOf(page, '.ui-workspace-main');
    expect(mainRaised.x, 'お題が掲げ直されて操作の面が動いた').toBeCloseTo(mainOpen.x, 0);
    expect(mainRaised.width).toBeCloseTo(mainOpen.width, 0);

    // 64rem 未満（幅 900）: 脇の記録は描かず、足の記録を手札・結果の下に出す。隠すと札は即座に消え、操作の面の幅は変わらない
    await page.setViewportSize({ width: 900, height: 900 });
    await settleWorkspace(page);
    await expect(page.locator('.room-log--side')).toBeHidden();
    await expect(page.locator('.room-log--foot')).toBeVisible();
    const hand = await boxOf(page, '.card-hand');
    const foot = await boxOf(page, '.room-log--foot');
    expect(foot.y, '足の記録が手札より下にない').toBeGreaterThanOrEqual(hand.y + hand.height - 1);
    const narrowBefore = (await boxOf(page, '.room-main')).width;
    await page.getByRole('button', { name: 'お題を隠す' }).click();
    await expect(page.getByRole('button', { name: 'お題を見る' })).toBeVisible();
    await expect(topic, '64rem 未満で閉じた札が描かれている').toBeHidden();
    expect((await boxOf(page, '.room-main')).width, '64rem 未満で隠して操作の面の幅が変わった').toBeCloseTo(narrowBefore, 0);
  });

  test('Given 幅 1280・高さ 700・長い説明 / When ルームを開く / Then 札と記録は重ならず、本文は札の中でスクロールする', async ({ page, openPeer }) => {
    await page.setViewportSize({ width: 1280, height: 700 });
    await openPokerWithTopic(page, openPeer, LONG_BODY);
    await turnRecordingOn(page);
    const card = await boxOf(page, '.room-topic-side');
    const heading = await page.locator('.room-log--side').getByRole('heading', { name: '見積もりの記録' }).boundingBox();
    expect(heading, '記録の見出しが描かれていない').not.toBeNull();
    expect(heading!.y, '記録の見出しが札の下端に食い込んでいる').toBeGreaterThanOrEqual(card.y + card.height - 1);
    // 本文は札の中でスクロールする（札が本文の長さまで伸びない）
    const body = await page.locator('.room-topic-side .ui-reader-body').evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight })).catch(() => null);
    if (body === null) throw new Error('札の本文の領域が見つからない');
    expect(body.scroll, '本文が札の中で溢れていない（前提が崩れている）').toBeGreaterThan(body.client + 1);
    // 脇は画面からはみ出さない
    const side = await boxOf(page, '.ui-workspace-side');
    expect(side.y + side.height).toBeLessThanOrEqual(700 + 0.5);
  });

  test('Given 幅 320・長い説明・長い名前の参加者 / When ルームを開く / Then 横に溢れず、お題 → 操作の面の順に積み、本文は 3 行で切れる', async ({ page, openPeer }) => {
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
    const { height, lineHeight } = await page.locator('.ui-reader-preview').evaluate((el) => ({
      height: el.getBoundingClientRect().height,
      lineHeight: parseFloat(getComputedStyle(el).lineHeight),
    }));
    expect(height).toBeLessThanOrEqual(lineHeight * 3.5);
  });
});

test.describe('お題ツールの部屋は読む面を右に持つ', () => {
  test('Given 幅 1920 / When 部屋を開く / Then 器は 1536px で、操作の面の右に読む面が並び、読む面の右端は器の内側の右端に揃う', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 900 });
    await openTopicTool(page, 'layout-topic-wide');
    const box = await pageBox(page);
    expect(box.outer).toBe(96 * REM);
    const reader = await boxOf(page, '.ui-reader');
    const main = await boxOf(page, '.ui-workspace-main');
    expect(main.x + main.width).toBeLessThanOrEqual(reader.x);
    expect(reader.x + reader.width).toBeCloseTo(box.innerRight, 0);
    expect(reader.y).toBeCloseTo(main.y, 0);
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

  test('Given 幅 320 / When 部屋を開く / Then 横に溢れず、場のお題 → 書く → 作るの順に積み、下に空きを残さない', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await openTopicTool(page, 'layout-topic-narrow');
    await expectNoHorizontalOverflow(page);
    const side = await boxOf(page, '.ui-workspace-side');
    const main = await boxOf(page, '.ui-workspace-main');
    const workspace = await boxOf(page, '.ui-workspace');
    expect(side.y + side.height).toBeLessThanOrEqual(main.y);
    expect(main.x).toBeCloseTo(side.x, 0);
    expect(workspace.y + workspace.height).toBeCloseTo(main.y + main.height, 0);
  });
});

test.describe('玄関の器', () => {
  test('Given 幅 1280 / When 名乗る画面を開く / Then 器は 640px（読む・入力する）', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await expect(page.getByLabel('あなたの名前')).toBeVisible();
    expect((await pageBox(page)).outer).toBe(40 * REM);
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
  test('Given 幅 320 のロビー（参加者 2 人） / When 幅 1920・1280 のロビー・セッション・長いお題・幅 390・まとめ（1920・1280・768・320）と開く / Then ロビーは脇が右・22rem で先頭がお題、セッションの脇は上端が揃い、お題は脇の先頭でタイマーは最初の画面に収まり、器はロビー・セッション・まとめで変わらず、まとめは 64rem 以上で 2 列・未満で 1 列', async ({ page, openPeer }) => {
    // 以前は同期サーバーのルーム枠が逼迫していたので、timer は 1 室で画面の流れの順に全てを見る（#387 で枠は広げたが、動いている検査なのでほどかない）
    // （ロビー → セッション → お題の読む面 → まとめ。前の段階を戻す必要がある検査は置かない）。
    const TIMER_PAGE = 'div.ui-page.stage-inner';
    // Given 幅 320 のロビー。ホスト + ドライバーで加わる 1 人（以前はルームの枠が逼迫していたので、timer は 1 室で全ての画面を順に見る）
    await page.setViewportSize({ width: 320, height: 640 });
    const code = await createTimerRoom(page, 'layout-timer');
    const guest = await openPeer('layout-timer-guest');
    // 区切りのない 30 字の名前。名前が行の幅を使い切ると、操作が次の行へ折り返す（行の flex-wrap）ので、折り返しが無いと 320 で溢れる
    const guestName = 'W'.repeat(30);
    await joinAsDriver(guest.page, code, guestName);
    await expect(page.getByRole('listitem').filter({ hasText: guestName })).toBeVisible();
    await expect(page.getByLabel('パスフレーズ', { exact: true })).toBeVisible();

    // Then 320: ロビーは横に溢れない（B1）。「設定」の字の折れは buttons.spec.ts が全ての部品のボタンで 4 つの幅で見る
    await expectNoHorizontalOverflow(page);

    // When 幅 1280（お題も掲げる）。段の判定は幅 1920 を先に測る（お題の有無で器の段は変わらない）
    await page.setViewportSize({ width: 1920, height: 1080 });
    expect((await pageBox(page, TIMER_PAGE)).outer).toBe(96 * REM);
    await page.setViewportSize({ width: 1280, height: 900 });
    expect((await pageBox(page, TIMER_PAGE)).inner).toBeGreaterThanOrEqual(72 * REM);
    const tool = await openPeer('layout-timer-tool');
    await joinTopicTool(tool.page, `/?room=${encodeURIComponent(code)}`, 'layout-timer-t');
    await setTopic(tool.page, 'FizzBuzz', LINKED_LONG_BODY);
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
    // 本文の領域から Tab で、本文の中のリンクに着く（64rem 以上）
    await expectWideTabReachesBodyLink(page.locator('section.timer-topic .ui-reader-body'));
    const longHeight = await page.evaluate(() => document.documentElement.scrollHeight);

    // When 80 段落の説明に差し替える
    await setTopic(tool.page, 'FizzBuzz', `${LINKED_LONG_BODY}\n\n${LONG_BODY.replaceAll('行目', '行目（続き）')}`);
    await expect(card).toContainText('40 行目（続き）の説明です。');
    // Then ページの高さは説明の長さで伸びない（40 段落と 80 段落で 1px 以内）
    const longerHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(Math.abs(longerHeight - longHeight)).toBeLessThanOrEqual(1);

    // When 幅 390
    await page.setViewportSize({ width: 390, height: 844 });
    // Then 札は 3 行で切れ、タイマーは最初の画面に収まる
    const clamp = await page.locator('.ui-reader-preview').first().evaluate((el) => ({
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

    // 切った本文の中のリンクには Tab が止まらず、「続きを読む」とシートの中のリンクには止まる（#316 PR 4）
    await expectNarrowTabSkipsPreviewLink(page, card);

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

    // 最後にまとめ。完成にすると戻れないので末尾に置く。まとめは完了のあと幅を変えても出続けるので、同じルームで 4 つの幅を測る（#352）
    await page.setViewportSize({ width: 1920, height: 1080 });
    // L1 の基準: セッションの器の外寸と、上の帯の位置と幅（段の名前や 96rem の直値とは比べない。跳ねないことだけを見る）
    const frameBefore = { page: (await pageBox(page, TIMER_PAGE)).outer, strip: await boxOf(page, '.app-status-strip') };
    await page.getByRole('button', { name: /完成!/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: '完成として記録する' }).click();
    await expect(page.locator('.summary')).toBeVisible();
    // ドライバー別の札が無いと 2 列の検査が空振りする（ゲストはドライバーで加わっている）
    await expect(page.locator('.summary-drivers')).toBeVisible();

    // Then L1（1920）: 完了の前後で器と帯が動かない
    const frameAfter = { page: (await pageBox(page, TIMER_PAGE)).outer, strip: await boxOf(page, '.app-status-strip') };
    expect(frameAfter.page, '完了で器の幅が変わった').toBeCloseTo(frameBefore.page, 0);
    expect(frameAfter.strip.x, '完了で帯の左端が動いた').toBeCloseTo(frameBefore.strip.x, 0);
    expect(frameAfter.strip.width, '完了で帯の幅が変わった').toBeCloseTo(frameBefore.strip.width, 0);

    // Then L2・L3・L4・L5（1920・1280）: 64rem 以上は 2 列。題と帯は上でまたがり、左に統計（縦に積む）・右にドライバー別。中身は器の内側の中央に 64rem 以下
    for (const width of [1920, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const summary = await boxOf(page, '.summary');
      const stats = await boxOf(page, '.summary-stats');
      const drivers = await boxOf(page, '.summary-drivers');
      const banner = await boxOf(page, '.summary-banner');
      expect(stats.x + stats.width, `${String(width)}: 統計がドライバー別の左に無い`).toBeLessThanOrEqual(drivers.x + 0.5);
      expect(Math.abs(stats.y - drivers.y), `${String(width)}: 統計とドライバー別の上端が揃わない`).toBeLessThanOrEqual(1);
      expect(banner.x, `${String(width)}: 達成の帯が 2 列にまたがらない（左）`).toBeLessThanOrEqual(stats.x + 0.5);
      expect(banner.x + banner.width, `${String(width)}: 達成の帯が 2 列にまたがらない（右）`).toBeGreaterThanOrEqual(drivers.x + drivers.width - 0.5);
      expect(summary.width, `${String(width)}: 中身が 64rem を超える`).toBeLessThanOrEqual(64 * REM + 0.5);
      const frame = await pageBox(page, TIMER_PAGE);
      const innerLeft = frame.innerRight - frame.inner;
      const leftGap = summary.x - innerLeft;
      const rightGap = frame.innerRight - (summary.x + summary.width);
      expect(Math.abs(leftGap - rightGap), `${String(width)}: 中身が器の内側の中央に無い`).toBeLessThanOrEqual(1);
      await expectStatCards(page, 'stacked', `まとめ（${String(width)}）`);
    }

    // Then（768）: 1 列（ドライバー別は統計の下）・中身は 40rem 以下・統計の札は横に 3 枚
    await page.setViewportSize({ width: 768, height: 1024 });
    const mStats = await boxOf(page, '.summary-stats');
    const mDrivers = await boxOf(page, '.summary-drivers');
    expect(mDrivers.y, '768: ドライバー別が統計の下に無い').toBeGreaterThanOrEqual(mStats.y + mStats.height - 0.5);
    expect((await boxOf(page, '.summary')).width, '768: 中身が 40rem を超える').toBeLessThanOrEqual(40 * REM + 0.5);
    await expectStatCards(page, 'row', 'まとめ（768）');

    // Then（640・中の段の下端）: 札は横に 3 枚のまま、値は札の内側に収まる
    await page.setViewportSize({ width: 640, height: 1024 });
    await expectStatCards(page, 'row', 'まとめ（640）');

    // Then L5・L4・L6（320）: 統計の札は縦に積み、数字は札に収まり、横に溢れない
    await page.setViewportSize({ width: 320, height: 640 });
    await expectStatCards(page, 'stacked', 'まとめ（320）');
    await expectNoHorizontalOverflow(page);
  });
});
