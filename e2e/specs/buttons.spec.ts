/**
 * ボタンと操作の並び（#316 PR 2・設計正本 D4〜D6・E6〜E8）。
 *
 * **タグを付けない（`local` 専用）。** 本番のルーム枠を消費して確かめる種類のものではない。
 *
 * 見るもの:
 * - E6 素のボタンが無い: 全ての `<button>` が部品（`.ui-button`）か、画面固有で許した一覧のどれかを持つ。
 * - E7 主は 1 つだけ: 操作の並び（`.ui-actions`）の中の主（`--secondary` / `--quiet` を持たない `.ui-button`）は 1 つ以下で、あれば最後。
 * - E8 下端の帯: 40rem 未満で `.ui-actions--dock` が画面の下端に接し、最下部では中身の下に出る。40rem 以上は流れの中。
 * - 当たり: `.ui-button` の押せる範囲（`--sm` は擬似要素の広がりを含む）が 44×44 以上で、隣の当たりと重ならない。
 *
 * **測る前に、測る対象が描かれたことを待つ。** 描かれる前に「素のボタンが 0 件」「帯が無い」を測ると、
 * 壊れていても緑になる。各画面で「その画面にしか無いボタン」が見えるのを待ってから測り、
 * 測ったボタンの数の下限も固定する。
 */
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../fixtures/test';
import { chooseCard } from '../support/poker';
import { openTopicTool, setTopic } from '../support/topic';
import { createRoom as createTimerRoom } from '../support/timer';

/**
 * 画面固有の理由で `.ui-button` を持たない `<button>` の許可一覧（クラスの選択子）。
 * - `.card`: poker の手札（札の形をした投票の選択肢。ボタンの形ではない）
 * - `.topic-tab`: お題ツールの読む面のタブ（`role="tab"`）
 * - `.tab`: timer のセッション／ルームのタブ（`role="tab"`）
 * - `.roster-panel-mini-button`: timer の名簿の行の小さな操作（見た目を保ち、当たりだけ 44px に広げる・Task 4b で別に測る）
 * - `.notify-hint-close`・`.notify-settings-trigger`: timer の通知のヒントの閉じる・ステータスの「通知」（ボタンの形をしない操作）
 */
const BARE_ALLOWED = ['.card', '.topic-tab', '.tab', '.roster-panel-mini-button', '.notify-hint-close', '.notify-settings-trigger'];

interface Rect { left: number; top: number; width: number; height: number }

/** 画面に描かれた（箱を持つ）ボタンを集め、素のもの・並びごとの主・当たりを返す。 */
async function scanButtons(page: Page) {
  return page.evaluate((allowed) => {
    const visible = (el: Element) => el.getClientRects().length > 0 && el.getBoundingClientRect().width > 0;
    const name = (el: Element) => (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 24);

    const bare = Array.from(document.querySelectorAll('button'))
      .filter((b) => !b.classList.contains('ui-button') && !allowed.some((sel) => b.matches(sel)))
      .map((b) => `${name(b)}（class="${b.className}"）`);

    const isPrimary = (el: Element) => !el.classList.contains('ui-button--secondary') && !el.classList.contains('ui-button--quiet') && !el.classList.contains('ui-button--danger');
    const groups = Array.from(document.querySelectorAll('.ui-actions')).map((group) => {
      const buttons = Array.from(group.querySelectorAll('.ui-button'));
      const primaries = buttons.filter(isPrimary);
      const last = buttons[buttons.length - 1];
      return {
        names: buttons.map(name),
        primaries: primaries.map(name),
        primaryIsLast: primaries.length === 0 || primaries[0] === last,
      };
    });

    // 当たり: 見た目の箱。::before が絶対配置なら、その広がりを含める（--sm の上下 +4px）
    const hits = Array.from(document.querySelectorAll('.ui-button'))
      .filter(visible)
      .map((el) => {
        const r = el.getBoundingClientRect();
        const rect = { left: r.left, top: r.top, width: r.width, height: r.height };
        const pseudo = getComputedStyle(el, '::before');
        if (pseudo.content !== 'none' && pseudo.position === 'absolute') {
          const cs = getComputedStyle(el);
          rect.left = r.left + parseFloat(cs.borderLeftWidth) + parseFloat(pseudo.left);
          rect.top = r.top + parseFloat(cs.borderTopWidth) + parseFloat(pseudo.top);
          rect.width = parseFloat(pseudo.width);
          rect.height = parseFloat(pseudo.height);
        }
        return { name: name(el), rect };
      });

    return { bare, groups, hits, uiButtons: document.querySelectorAll('.ui-button').length };
  }, BARE_ALLOWED);
}

/** E6・E7: 素のボタンが無く、並びごとの主が 1 つ以下で最後にある。`minButtons` は測ったボタンの数の下限。 */
async function expectButtonContract(page: Page, label: string, minButtons: number): Promise<void> {
  const scan = await scanButtons(page);
  expect(scan.uiButtons, `${label}: 部品のボタンが少ない（測る対象が描かれる前に測っていないか）`).toBeGreaterThanOrEqual(minButtons);
  expect(scan.bare, `${label}: 部品も許可もない素のボタン`).toEqual([]);
  for (const g of scan.groups) {
    expect(g.primaries.length, `${label}: 並び（${g.names.join(' / ')}）の主が 2 つ以上: ${g.primaries.join(' / ')}`).toBeLessThanOrEqual(1);
    expect(g.primaryIsLast, `${label}: 並び（${g.names.join(' / ')}）の主が最後にない`).toBe(true);
  }
}

/** 当たりが 44×44 以上で、どの 2 つも重ならない。 */
async function expectHitTargets(page: Page, label: string, minButtons: number): Promise<void> {
  const { hits } = await scanButtons(page);
  expect(hits.length, `${label}: 描かれたボタンが少ない（判定が空振りする）`).toBeGreaterThanOrEqual(minButtons);
  for (const h of hits) {
    expect(h.rect.width, `${label}: ${h.name} の当たりの幅`).toBeGreaterThanOrEqual(44 - 0.01);
    expect(h.rect.height, `${label}: ${h.name} の当たりの高さ`).toBeGreaterThanOrEqual(44 - 0.01);
  }
  const overlap = (a: Rect, b: Rect) =>
    Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left) > 0.5 &&
    Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top) > 0.5;
  for (let i = 0; i < hits.length; i += 1) {
    for (let j = i + 1; j < hits.length; j += 1) {
      const a = hits[i]!;
      const b = hits[j]!;
      expect(overlap(a.rect, b.rect), `${label}: ${a.name} と ${b.name} の当たりが重なる`).toBe(false);
    }
  }
}

async function expectScreen(page: Page, label: string, minButtons: number): Promise<void> {
  await expectButtonContract(page, label, minButtons);
  await expectHitTargets(page, label, minButtons);
}

/*
 * **ルームは 2 つしか作らない。** 同期サーバーのルームの枠（既定 100・アイドル 30 分で解放）を E2E 全件が使い切りに近い。
 * 画面ごとにルームを作ると、全件を流したときに末尾のテストが「操作を完了できませんでした」で落ちる（実測: 6 ルーム足して 2 件落ちた）。
 * そのため、玄関・poker・帯は 1 つのルームで、お題ツールは別の 1 つで、幅を変えながら続けて測る。
 */

/** 帯の箱と、帯の外にある中身の最下端、画面の高さ・スクロール位置を測る。 */
async function measureDock(dock: Locator) {
  return dock.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const parent = el.parentElement!;
    let contentBottom = -Infinity;
    for (const other of Array.from(parent.querySelectorAll('*'))) {
      if (el.contains(other) || other === el) continue;
      const o = other.getBoundingClientRect();
      if (o.width > 0 && o.height > 0) contentBottom = Math.max(contentBottom, o.bottom);
    }
    return { top: r.top, bottom: r.bottom, contentBottom, position: getComputedStyle(el).position, viewport: innerHeight };
  });
}

async function scrollToBottom(page: Page): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
}

/** 40rem 未満: 先頭では画面の下端に接し、最下部では中身の下に出る。 */
async function expectDockPinned(page: Page, dock: Locator, label: string, anchor?: Locator): Promise<void> {
  // 帯は自分の親の範囲の中でだけ留まる。親が画面の下にあるなら、まず親の頭を画面に入れる
  if (anchor === undefined) await page.evaluate(() => window.scrollTo(0, 0));
  else await anchor.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  const top = await measureDock(dock);
  expect(top.position, `${label}: 帯が sticky でない`).toBe('sticky');
  expect(top.bottom, `${label}: 先頭で帯が画面の下端に接していない`).toBeCloseTo(top.viewport, 0);
  expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight), `${label}: ページが画面より短く、留まる様子を測れない`).toBe(true);

  await scrollToBottom(page);
  const end = await measureDock(dock);
  expect(end.contentBottom, `${label}: 最下部で中身が帯に隠れる`).toBeLessThanOrEqual(end.top + 0.5);
  expect(end.bottom, `${label}: 最下部で帯が画面から出ている`).toBeLessThanOrEqual(end.viewport + 0.5);
}

/**
 * 帯が Tab で辿った先を隠さない（WCAG 2.4.11）。先頭から Tab で `name` のボタンまで進み、帯と重ならないことを見る。
 * 手札の最後の札は帯のすぐ上に来るので、`scroll-padding` が無いと帯の下に丸ごと隠れる（実測 69px 中 69px）。
 */
async function expectFocusNotHiddenByDock(page: Page, dock: Locator, name: string, label: string): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('body').focus();
  let reached = false;
  for (let i = 0; i < 60 && !reached; i += 1) {
    await page.keyboard.press('Tab');
    reached = await page.evaluate((n) => document.activeElement?.textContent?.trim() === n, name);
  }
  expect(reached, `${label}: Tab で「${name}」に届かない`).toBe(true);
  const focused = await page.evaluate(() => document.activeElement!.getBoundingClientRect().bottom);
  const { top } = await measureDock(dock);
  expect(focused, `${label}: Tab で辿った「${name}」が帯の下に隠れる`).toBeLessThanOrEqual(top + 0.5);
}

test.describe('玄関と poker のボタンは部品で、押せる大きさがあり、下端の帯が留まる', () => {
  test('Given 幅 390 / When 名乗る・道具を選ぶ・参加を名乗る・投票中・公開後の画面を開く / Then 素のボタンは手札だけで、主は 1 つ以下で最後にあり、当たりが 44px 以上で重ならず、低い画面では帯が下端に接する', async ({ page, openPeer }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'ルームを作る' })).toBeVisible();
    await expectScreen(page, '玄関（名乗る）', 1);

    await page.getByLabel('あなたの名前').fill('buttons-p');
    await page.getByRole('button', { name: 'ルームを作る' }).click();
    await expect(page.getByRole('list', { name: 'ツール' })).toBeVisible();
    await expect(page.getByRole('button', { name: '参加用 URL をコピー' })).toBeVisible();
    await expectScreen(page, '玄関（道具選び）', 2);
    expect((await scanButtons(page)).groups.some((g) => g.names.includes('参加用 URL をコピー')), '玄関（道具選び）: 招待の操作の並びが描かれていない').toBe(true);
    const url = await page.getByLabel('参加用 URL').inputValue();

    const guest = await openPeer('buttons-p2');
    await guest.page.setViewportSize({ width: 390, height: 800 });
    await guest.page.goto(url);
    await expect(guest.page.getByRole('button', { name: '参加する' })).toBeVisible();
    await expectScreen(guest.page, '玄関（参加を名乗る）', 1);
    await guest.page.getByLabel('あなたの名前').fill('buttons-p2');
    await guest.page.getByRole('button', { name: '参加する' }).click();
    await guest.page.getByRole('list', { name: 'ツール' }).getByRole('link', { name: /Planning Poker/ }).click();
    await expect(guest.page.getByRole('heading', { name: 'プランニングポーカー' })).toBeVisible();

    await page.getByRole('list', { name: 'ツール' }).getByRole('link', { name: /Planning Poker/ }).click();
    await expect(page.getByRole('heading', { name: 'プランニングポーカー' })).toBeVisible();
    // 2 人が席に着いてから投票させる（先に 1 人だけで投票すると、その 1 人で揃って自動で公開される）
    await expect(page.getByText('参加者（2人）')).toBeVisible();
    await chooseCard(guest.page, '5');

    // 手札が描かれ、投票中の帯の主が見えてから測る
    await expect(page.getByRole('button', { name: '票を公開する' })).toBeVisible();
    await expect(page.getByRole('button', { name: '8', exact: true })).toBeVisible();
    await expectScreen(page, 'poker（投票中）', 3);
    expect((await scanButtons(page)).groups.some((g) => g.names.includes('票を公開する'))).toBe(true);

    // 帯（40rem 未満・低い画面）
    const dock = page.locator('.room-main > .ui-actions--dock');
    await expect(dock).toBeVisible();
    await page.setViewportSize({ width: 390, height: 460 });
    await expectDockPinned(page, dock, 'poker（投票中）');
    // 帯が Tab の行き先を隠さない。手札が帯のすぐ上で折り返す幅（320）で測る（390 では隠れる局面が出ない）
    await page.setViewportSize({ width: 320, height: 568 });
    await expectFocusNotHiddenByDock(page, dock, '☕', 'poker（投票中・320）');
    await page.setViewportSize({ width: 390, height: 460 });

    // 全員が投票すると自動で公開される（ホストの 8 で 2 人目が揃う）。公開ボタンは押さない
    await chooseCard(page, '8');
    await expect(page.getByRole('button', { name: '再投票' })).toBeVisible();
    await expectDockPinned(page, dock, 'poker（公開後）');
    await page.setViewportSize({ width: 390, height: 800 });
    await expectScreen(page, 'poker（公開後）', 3);
    const revealed = (await scanButtons(page)).groups.find((g) => g.names.includes('再投票'));
    expect(revealed?.names, '公開後の帯は「次のラウンドへ」「再投票」の順').toEqual(['次のラウンドへ', '再投票']);
    expect(revealed?.primaries).toEqual(['再投票']);

    // 40rem 以上では帯は流れの中にあり、画面に貼りつかない
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.getByRole('button', { name: '再投票' })).toBeVisible();
    expect((await measureDock(dock)).position, '40rem 以上で帯が流れの中に戻っていない').toBe('static');
  });
});

test.describe('お題ツールのボタンは部品で、押せる大きさがあり、「場に出す」の帯が留まる', () => {
  test('Given 幅 390 / When お題なし・作る欄を開いた・場のお題・下書きの状態を開く / Then 素のボタンはタブだけで、主は 1 つ以下で、当たりが 44px 以上で重ならず、低い画面では帯が下端に接する', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 460 });
    await openTopicTool(page, 'buttons-t');
    await expect(page.getByRole('button', { name: '場に出す' })).toBeVisible();
    await expectDockPinned(page, page.locator('.ui-actions--dock'), 'お題ツール', page.getByLabel('タイトル'));

    await page.setViewportSize({ width: 390, height: 800 });
    await expectScreen(page, 'お題ツール（お題なし）', 2);
    expect((await scanButtons(page)).groups.some((g) => g.names.includes('場に出す')), 'お題ツール: 場に出すの並びが描かれていない').toBe(true);

    // 作る欄（たたまれた <details>）を開く。開いて言語・難易度・作るボタンが見えるのを待つ
    await page.getByRole('region', { name: '定型や AI で作る' }).locator('summary').click();
    await expect(page.getByRole('button', { name: '定型から選ぶ' })).toBeVisible();
    await expectScreen(page, 'お題ツール（作る欄を開いた）', 3);

    await setTopic(page, 'FizzBuzz', '3 のときは Fizz を出す');
    await expect(page.getByRole('button', { name: '場から下げる' })).toBeVisible();
    await expectScreen(page, 'お題ツール（場のお題）', 4);
    const current = (await scanButtons(page)).groups.find((g) => g.names.includes('場から下げる'));
    expect(current, '場のお題の足の並びが描かれていない').toBeDefined();

    await page.getByRole('tab', { name: '下書き' }).click();
    await expect(page.getByRole('tab', { name: '下書き' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.topic-foot-note')).toBeVisible();
    await expectScreen(page, 'お題ツール（下書き）', 3);
  });
});

/**
 * timer のセッション（#316 PR 3・Task 4b）。ルームは 1 つ。参加者 6 人（うち 1 人は 30 字の名前）は代理追加で作る
 * （ページを増やさずに、名簿の行と操作を同じに描かせる）。
 *
 * 帯は計器のカード（`.session-driver-card`）の最後の子で、**カードの範囲の中でだけ**留まる。
 * 「完成!」は次のカードにあるので `expectFocusNotHiddenByDock`（辿った先の下端 ≤ 帯の上端）は当てはまらない。
 * そこで、Tab の一歩ごとに「辿った先の箱が帯の箱と重ならない（帯の中の操作を除く）」を見る。
 */
// 幅の広い字を 30 字、切れ目なしで並べる（名簿の名前が `overflow-wrap` で折れないと 22rem の脇から溢れる）
const LONG_NAME = 'W'.repeat(30);

async function addProxies(page: Page, names: string[]): Promise<void> {
  for (const name of names) {
    const input = page.getByLabel('代理参加者の名前');
    if (!(await input.isVisible())) await page.getByRole('button', { name: '代理参加者を追加' }).click();
    await input.fill(name);
    await input.press('Enter');
    await expect(page.locator('.roster-panel-name', { hasText: name }).first(), `代理 ${name} が名簿に載らない`).toBeVisible();
  }
}

/** 名簿の行の小さな操作（`.roster-panel-mini-button`）の当たり（擬似要素の広がりを含む）が 44×44 以上で、重ならない。 */
async function expectMiniHitTargets(page: Page, label: string): Promise<void> {
  const hits = await page.evaluate(() => Array.from(document.querySelectorAll('.roster-panel-mini-button'))
    .filter((el) => el.getBoundingClientRect().width > 0)
    .map((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const p = getComputedStyle(el, '::before');
      const hit = p.content !== 'none' && p.position === 'absolute'
        ? { left: r.left + parseFloat(cs.borderLeftWidth) + parseFloat(p.left), top: r.top + parseFloat(cs.borderTopWidth) + parseFloat(p.top), width: parseFloat(p.width), height: parseFloat(p.height) }
        : { left: r.left, top: r.top, width: r.width, height: r.height };
      return { name: (el.getAttribute('aria-label') ?? el.textContent ?? '').slice(0, 20), hit };
    }));
  expect(hits.length, `${label}: 名簿の小さな操作が描かれていない`).toBeGreaterThanOrEqual(10);
  for (const h of hits) {
    // 0.05px の余裕は Chromium のレイアウトの丸め（1/64px 単位。実測 43.984）
    expect(Math.min(h.hit.width, h.hit.height) >= 44 - 0.05, `${label}: ${h.name} の当たり ${h.hit.width}x${h.hit.height}`).toBe(true);
  }
  const overlap = (a: Rect, b: Rect) =>
    Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left) > 0.5 &&
    Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top) > 0.5;
  for (let i = 0; i < hits.length; i += 1) {
    for (let j = i + 1; j < hits.length; j += 1) {
      expect(overlap(hits[i]!.hit, hits[j]!.hit), `${label}: ${hits[i]!.name} と ${hits[j]!.name} の当たりが重なる`).toBe(false);
    }
  }
}

/** 名簿の内側のスクロールと、行ごとの横溢れ、ページの横溢れを測る。 */
async function measureRoster(page: Page) {
  return page.evaluate(() => {
    const lists = Array.from(document.querySelectorAll('.roster-panel-list')).map((el) => ({
      scrollH: el.scrollHeight, clientH: el.clientHeight, overflowY: getComputedStyle(el).overflowY,
    }));
    const rows = Array.from(document.querySelectorAll('.ui-workspace-side .roster-panel-row')).map((el) => ({
      name: (el.querySelector('.roster-panel-name')?.textContent ?? '').slice(0, 12), scrollW: el.scrollWidth, clientW: el.clientWidth,
    }));
    const doc = document.documentElement;
    return { lists, rows, pageScrollW: doc.scrollWidth, pageClientW: doc.clientWidth };
  });
}

/** Tab を一歩ずつ進め、辿った先が帯と重ならないことを見る。帯が留まっている間に帯の上の要素を通ったことも固定する。 */
async function expectTabNeverUnderDock(page: Page, dock: Locator, target: string, label: string): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, 0));
  // Tab の起点を頁の左上へ戻す（`body.focus()` では起点が前のフォーカスに残り、先頭の要素を飛ばして帯から始まる）
  await page.mouse.click(1, 1);
  let reached = false;
  let sawAboveWhilePinned = 0;
  const trace: string[] = [];
  for (let i = 0; i < 80 && !reached; i += 1) {
    await page.keyboard.press('Tab');
    const m = await page.evaluate(() => {
      const f = document.activeElement!;
      const d = document.querySelector('.ui-actions--dock')!;
      const fr = f.getBoundingClientRect();
      const dr = d.getBoundingClientRect();
      return {
        text: (f.textContent ?? '').trim(),
        inDock: d.contains(f),
        fTop: fr.top, fBottom: fr.bottom, fLeft: fr.left, fRight: fr.right,
        dTop: dr.top, dBottom: dr.bottom, dLeft: dr.left, dRight: dr.right,
        viewport: innerHeight,
      };
    });
    trace.push(`${m.text.slice(0, 8)}|f${Math.round(m.fBottom)}|d${Math.round(m.dTop)}-${Math.round(m.dBottom)}|vh${m.viewport}`);
    if (!m.inDock) {
      const overlapV = Math.min(m.fBottom, m.dBottom) - Math.max(m.fTop, m.dTop);
      const overlapH = Math.min(m.fRight, m.dRight) - Math.max(m.fLeft, m.dLeft);
      expect(overlapV > 0.5 && overlapH > 0.5, `${label}: Tab で辿った「${m.text}」が帯に隠れる（縦 ${overlapV.toFixed(1)}px）`).toBe(false);
      if (m.fBottom <= m.dTop + 0.5 && Math.abs(m.dBottom - m.viewport) <= 1) sawAboveWhilePinned += 1;
    }
    reached = m.text === target;
  }
  expect(reached, `${label}: Tab で「${target}」に届かない`).toBe(true);
  expect(sawAboveWhilePinned, `${label}: 帯が留まっている間に帯の上の要素を通っていない（判定が空振りする）\n${trace.join('\n')}`).toBeGreaterThan(0);
  void dock;
}

test.describe('timer のセッションの操作は下端の帯と終える区画で、名簿は内側でスクロールしない', () => {
  test('Given 参加者 6 人（30 字の名前を含む）のセッション / When 幅 1280 と 390 で開く / Then 名簿に内側のスクロールが無く行は横に溢れず、帯は計器のカードの中で留まり、終える区画の主は最後で危険は左に離れ、Tab は帯に隠れない', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await createTimerRoom(page, 'buttons-timer');
    await page.getByRole('button', { name: 'セッションを開始' }).click();
    await expect(page.getByRole('timer')).toBeVisible();
    await addProxies(page, ['proxy-b', 'proxy-c', LONG_NAME, 'proxy-e', 'proxy-f']);
    await expect(page.locator('.ui-workspace-side .roster-panel-row'), '名簿は 6 人').toHaveCount(6);

    // Then 1280（脇 22rem）: 内側のスクロールが無く、行は横に溢れない
    const wide = await measureRoster(page);
    expect(wide.lists.length, '名簿の一覧が描かれていない').toBeGreaterThan(0);
    for (const l of wide.lists) {
      expect(l.scrollH, `名簿の一覧に内側のスクロールがある（overflow-y: ${l.overflowY}）`).toBeLessThanOrEqual(l.clientH);
    }
    expect(wide.rows.length).toBe(6);
    for (const r of wide.rows) expect(r.scrollW, `名簿の行「${r.name}」が横に溢れる`).toBeLessThanOrEqual(r.clientW);
    expect(wide.pageScrollW, '1280: ページが横に溢れる').toBeLessThanOrEqual(wide.pageClientW);
    await expectScreen(page, 'timer セッション（1280）', 8);
    await expectMiniHitTargets(page, 'timer セッション（1280）');

    // 終える区画: 主は最後（完成!）、危険の 2 つは .ui-actions-start に入って左に離れる
    const end = (await scanButtons(page)).groups.find((g) => g.names.includes('完成!'));
    expect(end?.names, '終える区画の並びは「途中で終える」「最初から」「完成!」').toEqual(['途中で終える', '最初から', '完成!']);
    expect(end?.primaries).toEqual(['完成!']);
    const endBox = await page.getByRole('group', { name: 'セッションを終える' }).evaluate((el) => {
      const r = (e: Element) => e.getBoundingClientRect();
      const start = el.querySelector('.ui-actions-start');
      const complete = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === '完成!')!;
      return {
        isActions: el.classList.contains('ui-actions'),
        dangersInStart: start !== null && start.querySelectorAll('.ui-button--danger').length === 2,
        startLeft: start ? r(start).left : -1, groupLeft: r(el).left, completeRight: r(complete).right, groupRight: r(el).right,
      };
    });
    expect(endBox.isActions, '終える区画が .ui-actions でない').toBe(true);
    expect(endBox.dangersInStart, '危険の 2 つが .ui-actions-start に入っていない').toBe(true);
    expect(Math.abs(endBox.startLeft - endBox.groupLeft), '危険が左端に離れていない').toBeLessThanOrEqual(1);
    expect(Math.abs(endBox.groupRight - endBox.completeRight), '完成! が右端でない').toBeLessThanOrEqual(1);

    // 390: 操作は下端の帯。順は時間リセット → スキップ → 一時停止（主が最後）
    await page.setViewportSize({ width: 390, height: 460 });
    const dock = page.locator('.session-driver-card > .ui-actions--dock');
    await expect(dock, '操作の並びが .ui-actions--dock でない').toBeVisible();
    const ops = (await scanButtons(page)).groups.find((g) => g.names.includes('一時停止'));
    expect(ops?.names, '操作の並びは「時間リセット」「スキップ」「一時停止」').toEqual(['時間リセット', 'スキップ', '一時停止']);
    expect(ops?.primaries).toEqual(['一時停止']);
    await expect(page.locator('.session-driver-card')).toBeVisible();
    await expectTimerDockPinned(page, dock);
    expect((await measureRoster(page)).pageScrollW, '390: ページが横に溢れる').toBeLessThanOrEqual(390);
    await expectMiniHitTargets(page, 'timer セッション（390）');

    // timer は要素層（`reset.css`）を読まないので、帯の逃がし余白（`scroll-padding-block-end`）は timer の `base.css` が持つ。
    // 帯は計器のカードの中で留まるため、Tab の行き先が帯の下に潜る場面はこの配置では作れない（下の一歩ごとの検査は予防）。
    // 余白そのものは値で固定する（要素層と同じ 6rem・40rem 未満だけ）。
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingBottom), '390: scroll-padding-block-end が 6rem でない').toBe('96px');

    // Tab は「完成!」まで帯に隠れない
    await expectTabNeverUnderDock(page, dock, '完成!', 'timer セッション（390）');

    // 40rem 以上は流れの中
    await page.setViewportSize({ width: 1280, height: 900 });
    expect((await measureDock(dock)).position, '40rem 以上で帯が流れの中に戻っていない').toBe('static');
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingBottom), '1280: scroll-padding は 40rem 以上に掛けない').not.toBe('96px');
  });
});

/** 帯が計器のカードの中で留まる: 先頭で下端に接し、最下部ではカードの中身（円盤・統計）の下に出る。 */
async function expectTimerDockPinned(page: Page, dock: Locator): Promise<void> {
  await page.locator('.session-driver-card').evaluate((el) => el.scrollIntoView({ block: 'start' }));
  const top = await measureDock(dock);
  expect(top.position, '帯が sticky でない').toBe('sticky');
  expect(top.bottom, '先頭で帯が画面の下端に接していない').toBeCloseTo(top.viewport, 0);
  await scrollToBottom(page);
  const end = await page.evaluate(() => {
    const d = document.querySelector('.ui-actions--dock')!.getBoundingClientRect();
    const body = document.querySelector('.session-driver-body')!.getBoundingClientRect();
    return { dockTop: d.top, dockBottom: d.bottom, bodyBottom: body.bottom, viewport: innerHeight };
  });
  expect(end.bodyBottom, '最下部で計器の中身が帯に隠れる').toBeLessThanOrEqual(end.dockTop + 0.5);
  expect(end.dockBottom, '最下部で帯が画面から出ている').toBeLessThanOrEqual(end.viewport + 0.5);
}
