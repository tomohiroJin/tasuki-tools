/**
 * ボタンと操作の並び（#316 PR 2・設計正本 D4〜D6・E6〜E8）。
 *
 * **タグを付けない（`local` 専用）。** 本番のルーム枠を消費して確かめる種類のものではない。
 *
 * 見るもの:
 * - E6 素のボタンが無い: 全ての `<button>` が部品（`.ui-button`）か、画面固有で許した一覧のどれかを持つ。
 * - E7 主は 1 つだけ: 操作の並び（`.ui-actions`）の中の主（`--secondary` / `--quiet` を持たない `.ui-button`）は 1 つ以下で、あれば最後。
 * - E8 下端の帯: 40rem 未満で `.ui-actions--dock` が画面の下端に接し、最下部では中身の下に出る。40rem 以上は流れの中。
 * - E4・E5 当たりとはみ出し: D9 の 4 種の操作（`button`・`a[href]`・`summary`・`[role="tab"]`。`.ui-button` に限らない。ラジオなどの入力は射程の外）の
 *   押せる範囲（絶対配置の擬似要素の広がりを含む）が 44×44 以上で、突けば操作自身に当たり、画面の横の範囲に収まり、
 *   どの 2 つも重ならず、部品のボタンの字が折れず、ページが横に溢れない。320・768・1280・1920 の 4 つの幅で見る（`expectScreenAcrossWidths`・#316 PR 4）。
 *
 * **測る前に、測る対象が描かれたことを待つ。** 描かれる前に「素のボタンが 0 件」「帯が無い」を測ると、
 * 壊れていても緑になる。各画面で「その画面にしか無いボタン」が見えるのを待ってから測り、
 * 測ったボタンの数の下限も固定する。
 */
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../fixtures/test';
import { expectFieldsAtLeast16px, expectFocusVisibleOnTab, expectReadable, expectScreenAcrossWidths, expectTouchTargets, scanContrast } from '../support/a11y';
import { loadSampleAndStart, openAgendaFromHub } from '../support/agenda';
import { chooseCard, turnRecordingOn } from '../support/poker';
import { addRouletteGuest, expectCardNameNotCovered, openRouletteFromHub, spinButton } from '../support/roulette';
import { openTopicTool, setTopic } from '../support/topic';
import { createRoom as createTimerRoom } from '../support/timer';

/**
 * 画面固有の理由で `.ui-button` を持たない `<button>` の許可一覧（クラスの選択子）。
 * - `.card`: poker の手札（札の形をした投票の選択肢。ボタンの形ではない）
 * - `.topic-tab`: お題ツールの読む面のタブ（`role="tab"`）
 * - `.tab`: timer のセッション／ルームのタブ（`role="tab"`）
 * - `.roster-panel-mini-button`: timer の名簿の行の小さな操作（見た目を保ち、当たりだけ 44px に広げる）
 * - `.notify-hint-close`・`.notify-settings-trigger`: timer の通知のヒントの閉じる・ステータスの「通知」（ボタンの形をしない操作）
 * - `.session-config-interval`: timer の交代間隔の選択肢（排他の選択肢の札。ボタンの形をした操作ではない）
 * - `.notify-settings-switch-on`・`.notify-settings-switch-off`: timer の通知の ON/OFF（`role="switch"` のスイッチ）
 * - `.notify-settings-preview`: timer の通知音の「試聴」（設定の行の中の小さな文字の操作で、画面の操作の並びに入らない）
 */
const BARE_ALLOWED = [
  '.card', '.topic-tab', '.tab', '.roster-panel-mini-button', '.notify-hint-close', '.notify-settings-trigger',
  '.session-config-interval', '.notify-settings-switch-on', '.notify-settings-switch-off', '.notify-settings-preview',
];

/** 画面に描かれた（箱を持つ）ボタンを集め、素のもの・並びごとの主・当たりを返す。 */
async function scanButtons(page: Page, hitScope = 'body') {
  return page.evaluate(([allowed, scope]) => {
    const visible = (el: Element) => el.getClientRects().length > 0 && el.getBoundingClientRect().width > 0;
    const name = (el: Element) => (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 24);

    const bare = Array.from(document.querySelectorAll('button'))
      .filter((b) => !b.classList.contains('ui-button') && !allowed.some((sel) => b.matches(sel)))
      .map((b) => `${name(b)}（class="${b.className}"）`);

    const isPrimary = (el: Element) => !el.classList.contains('ui-button--secondary') && !el.classList.contains('ui-button--quiet') && !el.classList.contains('ui-button--danger');
    const groups = Array.from(document.querySelectorAll('.ui-actions')).map((group) => {
      // 入れ子の並び（timer は確認ダイアログを「終える区画」の DOM の中に描く）のボタンは、内側の並びだけに数える
      const buttons = Array.from(group.querySelectorAll('.ui-button')).filter((b) => b.closest('.ui-actions') === group);
      const primaries = buttons.filter(isPrimary);
      const last = buttons[buttons.length - 1];
      return {
        names: buttons.map(name),
        primaries: primaries.map(name),
        primaryIsLast: primaries.length === 0 || primaries[0] === last,
      };
    });

    // 当たり: 見た目の箱。::before が絶対配置なら、その広がりを含める（--sm の上下 +4px）
    const hits = Array.from(document.querySelectorAll(`${scope} .ui-button`))
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
  }, [BARE_ALLOWED, hitScope] as const);
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

interface ScreenOptions {
  /** 当たりを測る操作の数の下限（既定は `minButtons`）。操作は部品のボタンのほかにタブ・リンク・名簿の小さな操作などを含む */
  minTargets?: number;
  /** 当たりを測る範囲。モーダルの確認ダイアログやポップオーバーは背景の画面の上に重なるので、その中だけで測る */
  scope?: string;
}

/** E6・E7 を今の幅で、E4・E5（当たり・字の折れ・横の溢れ）を 4 つの幅で見る。 */
async function expectScreen(page: Page, label: string, minButtons: number, options: ScreenOptions = {}): Promise<void> {
  await expectButtonContract(page, label, minButtons);
  await expectScreenAcrossWidths(page, label, options.minTargets ?? minButtons, options.scope);
}

/*
 * **ルームは画面の種類ごとに 1 つ（玄関・poker・帯 / お題ツール / timer の 3 つ）しか作らない。** 同期サーバーのルームの枠（既定 100・アイドル 30 分で解放）を E2E 全件が使い切りに近い。
 * 画面ごとにルームを作ると、全件を流したときに末尾のテストが「操作を完了できませんでした」で落ちる（実測: 6 ルーム足して 2 件落ちた）。
 * そのため、玄関・poker・帯は 1 つのルームで、お題ツールは別の 1 つで、timer も 1 つ（ロビー → セッション → 確認 → まとめの順）で、
 * 幅を変えながら続けて測る。timer は layout.spec.ts にも 1 室ある（#316 PR 3 で 6 室から 2 室に減らした。main は 1 室）。
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

    // 全員が投票すると自動で公開される（ホストの 8 で 2 人目が揃う）。公開ボタンは押さない。
    //   ポイントの選択は「記録する」を入れていて、開いた束があるときにしか出ない（#427・設計 D）ので、開票の前に入れる。
    //   記録しない帯に選択が出ないことは poker-estimate-log.spec.ts が見る
    await turnRecordingOn(page);
    await chooseCard(page, '8');
    await expect(page.getByRole('button', { name: '再投票' })).toBeVisible();
    await expectDockPinned(page, dock, 'poker（公開後）');
    await page.setViewportSize({ width: 390, height: 800 });
    await expectScreen(page, 'poker（公開後）', 3);
    const revealed = (await scanButtons(page)).groups.find((g) => g.names.includes('再投票'));
    expect(revealed?.names, '公開後の帯は「次のアイテムへ」「再投票」の順').toEqual(['次のアイテムへ', '再投票']);
    expect(revealed?.primaries).toEqual(['再投票']);
    //   帯の子の並びは「ポイント（任意）の選択 → 次のアイテムへ → 再投票」ちょうどこの順（選択は scanButtons の外なので別に測る）
    const dockChildren = await page.locator('.room-main > .ui-actions--dock > *').evaluateAll((els) =>
      els.map((el) => (el.tagName === 'SELECT' ? 'select' : (el.textContent ?? '').trim())),
    );
    expect(dockChildren, '公開後の帯の子の並び').toEqual(['select', '次のアイテムへ', '再投票']);

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

    // 同じルームでルーレット（#94 PR 3・ルームは足さない）。入る人を 2 人にするため、名前を 1 つ追加する
    await page.setViewportSize({ width: 390, height: 800 });
    await page.getByRole('link', { name: '選択画面へ戻る' }).click();
    await openRouletteFromHub(page);
    await addRouletteGuest(page, 'buttons-guest');
    await expect(spinButton(page)).toBeEnabled();
    await expectScreen(page, 'ルーレット（回す前）', ROULETTE_BUTTONS);

    // 回して止まった後（札の表・当たりの席が描かれてから測る）
    await spinButton(page).click();
    await expect(page.locator('.roulette-card.is-revealed')).toBeVisible({ timeout: 8000 });
    await expect(spinButton(page)).toBeEnabled();
    await expectScreen(page, 'ルーレット（止まった後）', ROULETTE_BUTTONS);

    // 320×640: 円盤・札・下端の帯が 1 画面に入るかが怪しい最小の画面。回して止まったあと、札の名前を突くと札に当たる
    await page.setViewportSize({ width: 320, height: 640 });
    //   利用者が下（入る人の一覧）まで読み進めたところで回す。札は画面の上へ外れているので、止まったら寄せる必要がある
    //   （先頭にいると札が最初から見え、寄せる処理を外しても緑のままになる・実測）
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    //   `click()` は押す前に自分でボタンを見える位置へ寄せてしまい、札も一緒に見えて検査が空振りする。DOM の click で押す
    await spinButton(page).evaluate((el) => (el as HTMLElement).click());
    await expect(spinButton(page)).toBeDisabled();
    await expect(spinButton(page)).toBeEnabled({ timeout: 8000 });
    await expectCardNameNotCovered(page);

    // 同じルームで進行タイマー（#429・ルームは足さない）。組む画面 → 進行中 → 映す表示を 4 つの幅で測る
    await page.setViewportSize({ width: 390, height: 800 });
    await page.getByRole('link', { name: '選択画面へ戻る' }).click();
    await openAgendaFromHub(page);
    await expect(page.getByRole('button', { name: /サンプル：KPT のふりかえり/ })).toBeVisible();
    await expectScreenAcrossWidths(page, '進行タイマー（組む）', AGENDA_BUILD_TARGETS);

    await loadSampleAndStart(page);
    await expect(page.locator('.dial-name')).toHaveText('K を出す');
    await expectScreenAcrossWidths(page, '進行タイマー（進行中）', AGENDA_RUN_TARGETS);
    //   止まった画面（進行中・1280）の文字が読める・Tab でフォーカスが見える。盤の SVG は aria-hidden で、中央の文字は HTML
    //   （`scanContrast` が測る span / p）。SVG の `<text>`（区画の番号）は対象外で、ここでは測らない
    await page.setViewportSize({ width: 1280, height: 900 });
    expectReadable(await scanContrast(page, 10), 8, []);
    await expectFocusVisibleOnTab(page);

    // 映す表示（盤と右の列だけ。帯を出してから測る（一時停止・次へ・手元の表示に戻る））
    await page.getByRole('button', { name: '映す表示', exact: true }).click();
    const exit = page.getByRole('button', { name: '手元の表示に戻る', exact: true });
    await expect(exit).toBeAttached();
    //   操作の帯は動かさないと `pointer-events: none` で隠れている（マウスで出ても 3 秒で戻る）。帯の中のボタンにフォーカスを置けば
    //   `:focus-within` で出たままになり、幅を変えても外れない。出してから測る（隠れたままだと当たりを突いても操作に当たらない）
    await exit.focus();
    await expect(exit).toBeFocused();
    await expectScreenAcrossWidths(page, '進行タイマー（映す表示）', 3);
  });
});

/** 進行タイマーの組む画面（空のとき）で測る操作の数の下限（サンプルの札・ステップを追加・戻るリンクなど。実測前の控えめな値） */
const AGENDA_BUILD_TARGETS = 3;
/** 進行タイマーの進行中の画面で測る操作の数の下限（延長 3・一時停止・次へ・映す表示・スキップなど。実測前の控えめな値） */
const AGENDA_RUN_TARGETS = 8;

/** ルーレットの画面にある部品のボタン（戻る・回す・名前を追加・招待リンクをコピー・名前を消す） */
const ROULETTE_BUTTONS = 6;

/**
 * timer の各画面（#316 PR 3・Task 4b）。ルームは 1 つ。参加者 6 人（うち 1 人は 30 字の名前）は代理追加で作る
 * （ページを増やさずに、名簿の行と操作を同じに描かせる）。
 *
 * 帯は計器のカード（`.session-driver-card`）の最後の子で、**カードの範囲の中でだけ**留まる。
 * 「完成!」は次のカードにあるので `expectFocusNotHiddenByDock`（辿った先の下端 ≤ 帯の上端）は当てはまらない。
 * そこで、Tab の一歩ごとに「辿った先の箱が帯の箱と重ならない（帯の中の操作を除く）」を見る。
 */
/** ロビーで測る操作の数の下限（交代間隔のチップ・開始・通知のカードの操作・ステータスの戻るリンクと「通知」など） */
const LOBBY_TARGETS = 8;

// 幅の広い字を 30 字、切れ目なしで並べる（名簿の名前が `overflow-wrap` で折れないと 22rem の脇から溢れる）
const LONG_NAME = 'W'.repeat(30);

/** 欄の親（行）が横に溢れず、ページも横に溢れない（欄が 100% になってボタンを押し出さない）。 */
async function expectRowFits(field: Locator, label: string): Promise<void> {
  const m = await field.evaluate((el) => {
    const row = el.parentElement!;
    const doc = document.documentElement;
    return { rowScrollW: row.scrollWidth, rowClientW: row.clientWidth, pageScrollW: doc.scrollWidth, pageClientW: doc.clientWidth };
  });
  expect(m.rowScrollW, `${label}: 行が横に溢れる（ボタンが押し出されている）`).toBeLessThanOrEqual(m.rowClientW);
  expect(m.pageScrollW, `${label}: ページが横に溢れる`).toBeLessThanOrEqual(m.pageClientW);
}

async function addProxies(page: Page, names: string[]): Promise<void> {
  for (const name of names) {
    const input = page.getByLabel('代理参加者の名前');
    // 追加フォームは「名簿に載った次の描画の後」で閉じる（RosterPanel の効果）。行が見えた直後は
    // まだ開いて見えるので、そのまま次の名前で `isVisible()` を見ると「開いている」と読んで押さず、
    // その後に閉じて `fill` が待ち続ける。毎回、閉じるのを待ってから次の名前へ進む。
    await expect(input, '代理の追加フォームが閉じていない（前の代理が名簿に届いていない）').toBeHidden();
    await page.getByRole('button', { name: '代理参加者を追加' }).click();
    await input.fill(name);
    await input.press('Enter');
    await expect(page.locator('.roster-panel-name', { hasText: name }).first(), `代理 ${name} が名簿に載らない`).toBeVisible();
    await expect(input, `代理 ${name} を載せたあとフォームが閉じない`).toBeHidden();
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
      actionsH: el.querySelector('.roster-panel-actions')?.getBoundingClientRect().height ?? 0,
    }));
    const doc = document.documentElement;
    return { lists, rows, pageScrollW: doc.scrollWidth, pageClientW: doc.clientWidth };
  });
}

/** Tab を一歩ずつ進め、辿った先が帯と重ならないことを見る。帯が留まっている間に帯の上の要素を通ったことも固定する。 */
async function expectTabNeverUnderDock(page: Page, target: string, label: string): Promise<void> {
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
}

test.describe('timer の各画面（ロビー・セッション・確認・まとめ）のボタンは部品で、押せる大きさがあり、帯は留まり、名簿は内側でスクロールしない', () => {
  test('Given 幅 390 の timer のロビー / When セッション（参加者 6 人・30 字の名前を含む。1280 と 390）・「途中で終える」の確認・まとめの順に開く / Then 素のボタンは許可したものだけで、主は 1 つ以下で最後にあり、当たりが 44px 以上で重ならず、名簿に内側のスクロールが無く行は横に溢れず、帯は計器のカードの中で留まり、終える区画の主は最後で危険は左に離れ、Tab は帯に隠れない', async ({ page }) => {
    // 以前はルームの枠が逼迫していたので、timer は 1 室で画面の流れの順に全てを見る（まとめは戻れないので最後）。#387 で枠は広げたが、動いている検査なのでほどかない。
    // ロビー: 開始ボタンが見えてから測る
    await page.setViewportSize({ width: 390, height: 800 });
    await createTimerRoom(page, 'buttons-timer');
    await expect(page.getByRole('button', { name: 'セッションを開始' })).toBeVisible();
    await expectScreen(page, 'timer ロビー（390）', 2, { minTargets: LOBBY_TARGETS });
    // 「詳細設定」（たたまれた <details>）を開いた状態。交代間隔のチップ・通知のカードのスイッチと試聴も同じ画面にある
    await page.locator('summary', { hasText: '詳細設定' }).click();
    await expect(page.locator('.session-config-toggles')).toBeVisible();
    await expectScreen(page, 'timer ロビー（詳細設定を開いた）', 2, { minTargets: LOBBY_TARGETS });
    // パスフレーズの欄（文字を入れる欄全体を測る。部品の当て忘れも拾う）
    await expect(page.getByLabel('パスフレーズ', { exact: true })).toBeVisible();
    await expectFieldsAtLeast16px(page);

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole('button', { name: 'セッションを開始' }).click();
    await expect(page.getByRole('timer')).toBeVisible();
    await addProxies(page, [LONG_NAME, 'proxy-b', 'proxy-c', 'proxy-e', 'proxy-f']);
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
    // 行の操作の行は 1 段（アイコンの操作は名前の行の右端にある）。22rem の脇で 3 段に折れると 1 行が約 180px になる
    for (const r of wide.rows) expect(r.actionsH, `名簿の行「${r.name}」の操作の行が 1 段に収まらない（${r.actionsH}px）`).toBeLessThanOrEqual(44 + 2);
    // 操作の数の下限は、部品のボタン 8 つと名簿の行の小さな操作 10 個（どちらも 1280 で必ず描かれる）
    await expectScreen(page, 'timer セッション（1280）', 8, { minTargets: 8 + 10 });
    // 40rem 以上で行の操作が 2 段に折れたとき、段の間（row-gap）で上下の当たりが重ならない。22rem の脇では今の文言が 1 段に収まり
    // 折れる場面が無いので、操作の行を狭めて折らせて測る（見た目 36px の操作の当たりは上下に 4px ずつ広がり、段の間が 8px 未満だと重なる）
    const narrow = await page.addStyleTag({ content: '.ui-workspace-side .roster-panel-actions { max-width: 9rem; margin-inline-start: auto; }' });
    const wrappedRows = await page.locator('.ui-workspace-side .roster-panel-actions').evaluateAll((els) => els.filter((el) => el.getBoundingClientRect().height > 44 + 2).length);
    expect(wrappedRows, '操作の行を狭めても段が折れない（重なりの判定が空振りする）').toBeGreaterThan(0);
    await expectTouchTargets(page, 'timer セッション（1280・行の操作を 2 段に折った）', 8 + 10);
    await narrow.evaluate((el) => (el as Element).remove());

    // 入力欄（#316 PR 4）: 代理追加・改名・共有メモの欄は 16px 以上で、脇（22rem）の行から押し出されない。1280 と 320 で見る
    const toggleProxy = page.getByRole('button', { name: '代理参加者を追加' });
    const proxyInput = page.getByLabel('代理参加者の名前');
    await toggleProxy.click();
    await expect(proxyInput).toBeVisible();
    await expectFieldsAtLeast16px(page);
    await expectRowFits(proxyInput, '代理追加の行');
    const selfRow = page.locator('.ui-workspace-side .roster-panel-row').filter({ hasText: 'buttons-timer' });
    await selfRow.getByRole('button', { name: /を改名$/ }).click();
    const renameInput = page.getByLabel(/の新しい名前$/);
    await expect(renameInput).toBeVisible();
    await expectFieldsAtLeast16px(page);
    await expectRowFits(renameInput, '改名の行');
    // 代理追加と改名の欄を開いた状態（欄の脇のボタンの字の折れも、4 つの幅で見る）
    await expectScreen(page, 'timer セッション（代理追加と改名の欄を開いた）', 8, { minTargets: 8 + 10 });
    await page.setViewportSize({ width: 320, height: 900 });
    await expectRowFits(proxyInput, '代理追加の行（320）');
    await expectRowFits(renameInput, '改名の行（320）');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole('button', { name: '取消' }).click();
    await toggleProxy.click();
    await expect(proxyInput).toBeHidden();
    await page.getByRole('button', { name: '編集', exact: true }).click();
    await expect(page.getByLabel('共有メモ', { exact: true })).toBeVisible();
    await expectFieldsAtLeast16px(page);
    await expectScreen(page, 'timer セッション（共有メモの編集）', 8, { minTargets: 8 + 10 });
    await page.getByRole('button', { name: 'プレビューに戻る' }).click();

    // ステータスの「通知設定」を開いた状態。ポップオーバーは画面の上に重なるので、ポップオーバーの中で測る
    await page.getByRole('button', { name: '通知設定' }).click();
    const popover = page.getByRole('dialog', { name: '交代通知の設定' });
    await expect(popover).toBeVisible();
    await expectScreen(page, 'timer 通知設定（ポップオーバー）', 8, { minTargets: 2, scope: '[role="dialog"][aria-label="交代通知の設定"]' });
    await page.getByRole('button', { name: '通知設定' }).click();
    await expect(popover).toBeHidden();

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

    // 区切りのない 30 字の名前（次のドライバー）が「次:」の行と交代順の札で、カードの縁に切られない
    const clip = await page.locator('.session-driver-card').evaluate((card, long) => {
      const c = card.getBoundingClientRect();
      const inner = c.right - parseFloat(getComputedStyle(card).paddingRight);
      const rights = (sel: string) => Array.from(card.querySelectorAll(sel))
        .filter((e) => e.textContent?.includes(long))
        .map((e) => e.getBoundingClientRect().right);
      return { inner, next: rights('.session-next-name'), chips: rights('.rotation-lineup-name') };
    }, LONG_NAME);
    expect(clip.next.length, '「次:」の名前が 30 字の名前でない').toBe(1);
    expect(clip.chips.length, '交代順の札に 30 字の名前が無い').toBe(1);
    for (const right of [...clip.next, ...clip.chips]) expect(right, `390: 長い名前がカードの縁（${clip.inner}）で切れる`).toBeLessThanOrEqual(clip.inner + 0.5);

    // timer は要素層（`reset.css`）を読まないので、帯の逃がし余白（`scroll-padding-block-end`）は timer の `base.css` が持つ。
    // 帯は計器のカードの中で留まり、カードには帯より上に隠れうる操作対象が無いので、Tab の行き先が帯の下に潜る場面はこの配置では作れない（下の一歩ごとの検査は予防）。
    // 余白そのものは値で固定する（要素層と同じ 6rem・40rem 未満だけ）。
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingBottom), '390: scroll-padding-block-end が 6rem でない').toBe('96px');

    // Tab は「完成!」まで帯に隠れない
    await expectTabNeverUnderDock(page, '完成!', 'timer セッション（390）');

    // 40rem 以上は流れの中
    await page.setViewportSize({ width: 1280, height: 900 });
    expect((await measureDock(dock)).position, '40rem 以上で帯が流れの中に戻っていない').toBe('static');
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingBottom), '1280: scroll-padding は 40rem 以上に掛けない').not.toBe('96px');

    // セッション（390・高い画面）: 計器の帯の主（一時停止）と終える区画の「完成!」が見えてから測る
    await page.setViewportSize({ width: 390, height: 800 });
    await expect(page.getByRole('button', { name: '一時停止', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '完成!', exact: true })).toBeVisible();
    await expectScreen(page, 'timer セッション（390）', 6, { minTargets: 6 + 10 });

    // 「ルーム」のタブ（招待・パスフレーズ）
    await page.getByRole('tab', { name: 'ルーム' }).click();
    await expect(page.getByRole('tab', { name: 'ルーム' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.session-room')).toBeVisible();
    await expectScreen(page, 'timer ルームのタブ（390）', 2);
    await page.getByRole('tab', { name: 'セッション' }).click();
    await expect(page.getByRole('button', { name: '完成!', exact: true })).toBeVisible();

    // 確認ダイアログ（「途中で終える」）: 取消と確定が見えてから測る。測ったら取り消す
    await page.getByRole('button', { name: '途中で終える' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: '終える（記録なし）' })).toBeVisible();
    // 最小数は当たりを測るダイアログの中のボタン数（取消と確定の 2 つ）。背景の画面のボタンは別に数える
    await expectScreen(page, 'timer 確認ダイアログ（390）', 2, { scope: '[role="dialog"]' });
    expect((await scanButtons(page)).uiButtons, '確認ダイアログ: 背景の画面のボタンが描かれていない').toBeGreaterThanOrEqual(8);
    expect((await scanButtons(page, '[role="dialog"]')).hits, '確認ダイアログの当たりは取消と確定の 2 つ').toHaveLength(2);
    await dialog.getByRole('button', { name: 'キャンセル' }).click();
    await expect(dialog).toBeHidden();

    // まとめ: 完成! → 確認 → まとめ画面（新しいセッション）が見えてから測る
    await page.getByRole('button', { name: '完成!', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '完成として記録する' }).click();
    await expect(page.locator('.summary')).toBeVisible();
    await expect(page.getByRole('button', { name: /新しいセッション/ })).toBeVisible();
    await expectScreen(page, 'timer まとめ（390）', 1);
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
