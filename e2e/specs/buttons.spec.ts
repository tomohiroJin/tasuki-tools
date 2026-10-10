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

/**
 * 画面固有の理由で `.ui-button` を持たない `<button>` の許可一覧（クラスの選択子）。
 * - `.card`: poker の手札（札の形をした投票の選択肢。ボタンの形ではない）
 * - `.topic-tab`: お題ツールの読む面のタブ（`role="tab"`）
 */
const BARE_ALLOWED = ['.card', '.topic-tab'];

interface Rect { left: number; top: number; width: number; height: number }

/** 画面に描かれた（箱を持つ）ボタンを集め、素のもの・並びごとの主・当たりを返す。 */
async function scanButtons(page: Page) {
  return page.evaluate((allowed) => {
    const visible = (el: Element) => el.getClientRects().length > 0 && el.getBoundingClientRect().width > 0;
    const name = (el: Element) => (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 24);

    const bare = Array.from(document.querySelectorAll('button'))
      .filter((b) => !b.classList.contains('ui-button') && !allowed.some((sel) => b.matches(sel)))
      .map((b) => `${name(b)}（class="${b.className}"）`);

    const isPrimary = (el: Element) => !el.classList.contains('ui-button--secondary') && !el.classList.contains('ui-button--quiet');
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
    await expectFocusNotHiddenByDock(page, dock, '☕', 'poker（投票中）');

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
