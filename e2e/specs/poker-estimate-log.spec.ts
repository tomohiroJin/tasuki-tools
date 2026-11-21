/**
 * poker の見積もりの記録（#93）。
 *
 * **タグを付けない（`local` 専用）。** 見るのは画面の積まれ方で、本番の煙には要らない。
 * 記録は 64rem 以上では脇（`.room-log--side`）に出る。2 つの画面はどちらも 1280 で開く。
 */
import { expect, test } from '../fixtures/test';
import type { Locator, Page } from '@playwright/test';
import { chooseCard, createRoom, joinRoom, resultsSection, turnRecordingOn } from '../support/poker';
import { joinTopicTool, setTopic } from '../support/topic';

const HOST = 'log-a';
const GUEST = 'log-b';
const ITEM = 'PROJ-120';

/** 脇の記録（束の並びは新しい順）。 */
function sideLog(page: Page): Locator {
  return page.locator('.room-log--side');
}

function groups(page: Page): Locator {
  return sideLog(page).locator('.estimate-group');
}

/** 記録の上の題（束の見出しの中の名前は含めない）。 */
function currentTitle(page: Page): Locator {
  return page.locator('.estimate-item:not(.estimate-item--inline) .estimate-item-title');
}

/** 「いま見積もっているもの」を入れ直す（題名のボタン → 入力 → Enter）。 */
async function setItem(page: Page, item: string): Promise<void> {
  await currentTitle(page).click();
  const input = page.getByRole('textbox', { name: 'いま見積もっているもの' });
  await input.fill(item);
  await input.press('Enter');
  await expect(currentTitle(page)).toHaveText(item);
}

/** 2 人が同じ札を選び、結果が出るまで待つ。 */
async function bothVote(a: Page, b: Page, cardA: string, cardB: string): Promise<void> {
  await chooseCard(a, cardA);
  await chooseCard(b, cardB);
  await expect(resultsSection(a)).toBeVisible();
  await expect(resultsSection(b)).toBeVisible();
}

async function openTwo(
  page: Page,
  openPeer: (label: string) => Promise<{ page: Page }>,
  label: string,
  recording = true,
): Promise<Page> {
  await page.setViewportSize({ width: 1280, height: 900 });
  const roomUrl = await createRoom(page, HOST);
  const guest = await openPeer(label);
  await guest.page.setViewportSize({ width: 1280, height: 900 });
  await joinRoom(guest.page, roomUrl, GUEST);
  await expect(page.getByRole('heading', { name: '参加者（2人）' })).toBeVisible();
  await expect(guest.page.getByRole('heading', { name: '参加者（2人）' })).toBeVisible();
  // 記録は既定で切れている（#427）。ここで入れる
  if (recording) {
    await turnRecordingOn(page);
    await expect(sideLog(guest.page)).toBeVisible();
  }
  return guest.page;
}

test.describe('poker は見積もりを記録に残す', () => {
  test('Given 新しいルーム / When 開票する / Then 記録の欄・いま見積もっているもの・ポイントの欄が無い（記録は既定で切れている・#427）', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await createRoom(page, HOST);
    await expect(page.getByRole('button', { name: '記録する' })).toHaveAttribute('aria-pressed', 'false');
    // 1 人なので投票すると自動で公開される
    await chooseCard(page, '5');
    await expect(resultsSection(page)).toBeVisible();
    await expect(page.getByRole('heading', { name: '見積もりの記録' }), '記録の欄').toHaveCount(0);
    await expect(page.locator('.estimate-group'), '束').toHaveCount(0);
    await expect(page.locator('.estimate-item-title'), 'いま見積もっているもの').toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'ポイント（任意）' }), 'ポイントの欄').toHaveCount(0);
  });

  test('Given 2 人のルーム / When 1 人目が「記録する」を押す / Then 2 人目の画面にも記録の欄が出て、押した状態になる（ルーム全員に効く・#427）', async ({ page, openPeer }) => {
    const guest = await openTwo(page, openPeer, 'log-guest-toggle', false);
    await expect(sideLog(guest), '押す前は 2 人目にも欄が無い').toHaveCount(0);
    await turnRecordingOn(page);
    await expect(sideLog(guest).getByRole('heading', { name: '見積もりの記録' })).toBeVisible();
    await expect(guest.getByRole('button', { name: '記録する' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('Given 名前が空の束 / When 再投票して閉じ、名前を入れて空に戻す / Then 両画面とコピーで同じ番号を保つ（#637）', async ({ page, context, openPeer }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const guest = await openTwo(page, openPeer, 'log-guest-rename');
    for (const target of [page, guest]) {
      await expect(currentTitle(target)).toHaveAccessibleName('見積もり 1');
      await expect(currentTitle(target)).toHaveAttribute('data-auto-title', '');
    }
    await bothVote(page, guest, '5', '5');
    await guest.getByRole('button', { name: '再投票' }).click();
    await expect(resultsSection(page)).toHaveCount(0);
    await expect(currentTitle(page)).toHaveText('見積もり 1');
    await bothVote(page, guest, '5', '5');
    for (const target of [page, guest]) {
      const opened = groups(target).first();
      await expect(opened.locator('.estimate-group-item')).toHaveText('見積もり 1');
      await expect(opened.locator('.estimate-entry-attempt')).toHaveText(['2 回め', '1 回め']);
    }
    await page.getByRole('button', { name: '次のアイテムへ' }).click();
    await expect(resultsSection(guest)).toHaveCount(0);

    const guestHeading = groups(guest).first().locator('.estimate-group-item');
    await guestHeading.getByRole('button', { name: '見積もり 1' }).click();
    const input = guest.getByRole('textbox', { name: 'アイテム名を変える' });
    await input.fill('PROJ-999');
    await input.press('Enter');
    await expect(guestHeading.locator('.estimate-item-title'), '押した本人の見出し').toHaveText('PROJ-999');
    await expect(groups(page).first().locator('.estimate-group-item .estimate-item-title'), '1 人目の画面の見出し').toHaveText('PROJ-999');

    await guestHeading.getByRole('button', { name: 'PROJ-999' }).click();
    await input.clear();
    await input.press('Enter');
    for (const target of [page, guest]) {
      await expect(groups(target).first().getByRole('button', { name: '見積もり 1' })).toBeVisible();
      await expect(groups(target).first().getByRole('combobox')).toHaveAccessibleName('見積もり 1 ポイントを変える');
      await expect(currentTitle(target)).toHaveText('見積もり 2');
    }
    const copy = sideLog(page).getByRole('button', { name: '記録をコピー' });
    const copyBefore = await copy.boundingBox();
    expect(copyBefore).not.toBeNull();
    await copy.click();
    await expect(sideLog(page).getByRole('status')).toHaveText('コピーしました');
    expect(await copy.boundingBox()).toEqual(copyBefore);
    const markdown = await page.evaluate(() => navigator.clipboard.readText());
    expect(markdown.split('\n')).toContain('### 見積もり 1');
  });

  test('Given 2 人のルーム / When 名前のあるアイテムを再投票し、次を名前なしで開票する / Then 両画面に見積もり 2 と PROJ-120 の記録が出る', async ({ page, openPeer }) => {
    const guest = await openTwo(page, openPeer, 'log-guest-1');

    // 前: 記録はまだ空
    await expect(sideLog(page).getByText('開票すると、ここに残ります')).toBeVisible();

    // When: アイテム名（片方が入れると両方に出る）→ 割れる → 再投票 → そろう → 次のアイテムへ（点数 5）
    await setItem(page, ITEM);
    await expect(currentTitle(guest)).toHaveText(ITEM);
    // 開票の瞬間に操作の面が跳ばない（spec §2）: 最初の開票の前後で `.room-main` の x・y・幅が同じ
    const mainBefore = await page.locator('.room-main').boundingBox();
    expect(mainBefore, '操作の面が描かれていない').not.toBeNull();
    await bothVote(page, guest, '5', '8');
    const mainAfter = await page.locator('.room-main').boundingBox();
    expect(mainAfter!.x, '開票で操作の面の x が動いた').toBeCloseTo(mainBefore!.x, 0);
    expect(mainAfter!.y, '開票で操作の面の y が動いた').toBeCloseTo(mainBefore!.y, 0);
    expect(mainAfter!.width, '開票で操作の面の幅が変わった').toBeCloseTo(mainBefore!.width, 0);
    await guest.getByRole('button', { name: '再投票' }).click();
    await expect(resultsSection(page)).toHaveCount(0);
    await bothVote(page, guest, '5', '5');
    await guest.getByRole('combobox', { name: 'ポイント（任意）' }).selectOption('5');
    await guest.getByRole('button', { name: '次のアイテムへ' }).click();
    await expect(resultsSection(page)).toHaveCount(0);
    await expect(currentTitle(page)).toHaveText('見積もり 2');

    // When: 名前なしのままもう 1 件開票する（そろって 3）
    await bothVote(page, guest, '3', '3');

    // Then: どちらの画面も、新しい束が上で、同じ中身
    for (const [label, target] of [['作成者', page], ['参加者', guest]] as const) {
      const gs = groups(target);
      await expect(gs, `${label}の画面: 束は 2 つ`).toHaveCount(2);
      const newest = gs.nth(0);
      await expect(newest.locator('.estimate-group-item'), `${label}: 上は見積もり 2`).toHaveText('見積もり 2');
      await expect(newest.getByText('見積もり中', { exact: true }), `${label}: 上は見積もり中`).toBeVisible();
      await expect(newest.locator('.estimate-entry'), `${label}: 名前なしの束は 1 回`).toHaveCount(1);
      await expect(newest.locator('.estimate-entry-attempt').first()).toHaveText('1 回め');
      await expect(newest.locator('.estimate-entry-counts').first()).toHaveText('3×2');

      const older = gs.nth(1);
      await expect(older.locator('.estimate-group-item .estimate-item-title'), `${label}: 下は ${ITEM}`).toHaveText(ITEM);
      await expect(older.getByRole('combobox', { name: 'ポイントを変える' }), `${label}: 点数は 5`).toHaveValue('5');
      const entries = older.locator('.estimate-entry');
      await expect(entries, `${label}: ${ITEM} は 2 回`).toHaveCount(2);
      await expect(entries.nth(0).locator('.estimate-entry-attempt'), `${label}: 新しい回が上`).toHaveText('2 回め');
      await expect(entries.nth(0).locator('.estimate-entry-counts')).toHaveText('5×2');
      await expect(entries.nth(1).locator('.estimate-entry-attempt')).toHaveText('1 回め');
      await expect(entries.nth(1).locator('.estimate-entry-counts')).toHaveText('5×1 8×1');
    }
  });

  test('Given 記録が 1 件ある / When 記録を切って開票した後に再開する / Then 次の記録は見積もり 2 になる', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await createRoom(page, HOST);
    await turnRecordingOn(page);
    await chooseCard(page, '5');
    await expect(groups(page).first().locator('.estimate-group-item')).toHaveText('見積もり 1');
    await page.getByRole('button', { name: '次のアイテムへ' }).click();
    const recording = page.getByRole('button', { name: '記録する' });
    await recording.click();
    await expect(recording).toHaveAttribute('aria-pressed', 'false');
    await chooseCard(page, '3');
    await expect(resultsSection(page)).toBeVisible();
    await page.getByRole('button', { name: '次のアイテムへ' }).click();
    await turnRecordingOn(page);
    await expect(currentTitle(page)).toHaveText('見積もり 2');
    await chooseCard(page, '8');
    const recorded = groups(page);
    await expect(recorded).toHaveCount(2);
    await expect(recorded.first().locator('.estimate-group-item')).toHaveText('見積もり 2');
    await expect(recorded.last().getByRole('button', { name: '見積もり 1' })).toBeVisible();
  });

  test('Given 閉じた束 / When 2 人目が記録の欄でポイントを 8 に変える / Then 1 人目の画面も 8 になる', async ({ page, openPeer }) => {
    const guest = await openTwo(page, openPeer, 'log-guest-2');
    await setItem(page, ITEM);
    await bothVote(page, guest, '5', '5');
    await page.getByRole('button', { name: '次のアイテムへ' }).click();
    await expect(resultsSection(guest)).toHaveCount(0);

    const hostSelect = groups(page).first().getByRole('combobox', { name: 'ポイントを変える' });
    const guestSelect = groups(guest).first().getByRole('combobox', { name: 'ポイントを変える' });
    await expect(hostSelect, '最初はポイントなし').toHaveValue('');

    await guestSelect.selectOption('8');
    await expect(hostSelect, '1 人目の画面にも 8 が届く').toHaveValue('8');
    await expect(guestSelect).toHaveValue('8');

    // 空へ戻すこともできる
    await guestSelect.selectOption('');
    await expect(hostSelect).toHaveValue('');
  });

  test('Given 記録が 1 件ある / When 3 人目が後から入る / Then 同じ記録が見える', async ({ page, openPeer }) => {
    const guest = await openTwo(page, openPeer, 'log-guest-3');
    await setItem(page, ITEM);
    await bothVote(page, guest, '5', '8');
    const roomUrl = await page.locator('.ui-invite-url').first().innerText();

    const late = await openPeer('log-late');
    await late.page.setViewportSize({ width: 1280, height: 900 });
    await joinRoom(late.page, roomUrl, 'log-c');
    const group = groups(late.page);
    await expect(group, '後から入っても束が見える').toHaveCount(1);
    await expect(group.first().locator('.estimate-group-item')).toHaveText(ITEM);
    await expect(group.first().getByText('見積もり中', { exact: true })).toBeVisible();
    await expect(group.first().locator('.estimate-entry-attempt').first()).toHaveText('1 回め');
    await expect(group.first().locator('.estimate-entry-counts').first()).toHaveText('5×1 8×1');
  });

  test('Given 幅 390 / When 1 件開票する / Then 記録は手札・結果より下の足に出る', async ({ page, openPeer }) => {
    const guest = await openTwo(page, openPeer, 'log-guest-4');
    await page.setViewportSize({ width: 390, height: 844 });
    await setItem(page, ITEM);
    await bothVote(page, guest, '5', '8');
    await expect(sideLog(page)).toBeHidden();
    const foot = page.locator('.room-log--foot');
    await expect(foot.locator('.estimate-group')).toHaveCount(1);
    const results = await resultsSection(page).boundingBox();
    const box = await foot.boundingBox();
    expect(results).not.toBeNull();
    expect(box).not.toBeNull();
    expect(box!.y, '足の記録が結果より下にある').toBeGreaterThanOrEqual(results!.y + results!.height - 1);
  });

  test('Given コピー API を使えない幅 390 の画面 / When 記録のシートからコピー / Then すべての題がクリップボードに入る', async ({ page, context }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await createRoom(page, HOST);
    await turnRecordingOn(page);
    for (const card of ['2', '3', '5', '8']) {
      await chooseCard(page, card);
      await expect(resultsSection(page)).toBeVisible();
      await page.getByRole('button', { name: '次のアイテムへ' }).click();
      await expect(resultsSection(page)).toHaveCount(0);
    }

    await page.getByRole('button', { name: '記録をすべて見る' }).click();
    const drawer = page.getByRole('dialog', { name: '見積もりの記録' });
    await page.evaluate(async () => {
      const clipboard = navigator.clipboard;
      await clipboard.writeText('前のコピー');
      Object.defineProperty(navigator, 'clipboard', {
        value: { readText: clipboard.readText.bind(clipboard) },
      });
    });
    const copy = drawer.getByRole('button', { name: '記録をコピー' });
    await copy.click();
    await expect(drawer.getByRole('status')).toHaveText('コピーしました');
    const markdown = await page.evaluate(() => navigator.clipboard.readText());
    expect(markdown.split('\n').filter((line) => line.startsWith('### '))).toEqual([
      '### 見積もり 4', '### 見積もり 3', '### 見積もり 2', '### 見積もり 1',
    ]);
  });

  /** Clipboard API も従来のコピー（execCommand）も失敗する画面にする。 */
  async function breakCopy(page: Page): Promise<void> {
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('denied')) } });
      document.execCommand = () => false;
    });
  }

  /** 記録を `cards` の数だけ閉じた束で作る（1 枚ごとに開票して次のアイテムへ）。 */
  async function recordItems(page: Page, cards: readonly string[]): Promise<void> {
    await createRoom(page, HOST);
    await recordInto(page, cards);
  }

  /** 作ったルームで記録を入れ、`cards` の数だけ閉じた束を作る。 */
  async function recordInto(page: Page, cards: readonly string[]): Promise<void> {
    await turnRecordingOn(page);
    for (const card of cards) {
      await chooseCard(page, card);
      await expect(resultsSection(page)).toBeVisible();
      await page.getByRole('button', { name: '次のアイテムへ' }).click();
      await expect(resultsSection(page)).toHaveCount(0);
    }
  }

  /** 二つの箱が交わる面積（px²）。交わらなければ 0。知らせは pointer-events: none なので、箱どうしで測る。 */
  async function overlapArea(a: Locator, b: Locator): Promise<number> {
    const boxA = await a.boundingBox();
    const boxB = await b.boundingBox();
    if (!boxA || !boxB) throw new Error('箱が測れない');
    const w = Math.min(boxA.x + boxA.width, boxB.x + boxB.width) - Math.max(boxA.x, boxB.x);
    const h = Math.min(boxA.y + boxA.height, boxB.y + boxB.height) - Math.max(boxA.y, boxB.y);
    return Math.max(0, w) * Math.max(0, h);
  }

  /**
   * 失敗の後、目に見える知らせと手動コピーの欄が、記録の本体の頭に出る。
   * 欄は rows の分の高さを保ち、知らせと重ならず、記録の札（`scope`）の外へはみ出さない。
   * 脇では本体がスクロールするので、欄までスクロールしてから、本体の箱・札の箱の中に収まることを測る。
   */
  async function expectManualFieldInCard(scope: Locator): Promise<void> {
    await scope.getByRole('button', { name: '記録をコピー' }).click();
    // 読み上げ用の知らせ（見た目は隠す）は見出しの行に残る
    await expect(scope.getByRole('status')).toHaveText('コピーできません');
    const body = scope.locator('.estimate-log-body');
    const message = body.getByText('コピーできません', { exact: true });
    await expect(message).toBeVisible();
    const field = body.getByRole('textbox', { name: '手動コピー用の Markdown' });
    await expect(field).toBeVisible();
    expect(await overlapArea(message, field)).toBe(0);
    const fieldBox = await field.boundingBox();
    const bodyBox = await body.boundingBox();
    const cardBox = await scope.boundingBox();
    if (!fieldBox || !bodyBox || !cardBox) throw new Error('箱が測れない');
    // rows={5} に見合う高さ（脇で縮んで 1 行しか見えない、が起きない）
    const lineHeight = await field.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.2);
    expect(fieldBox.height).toBeGreaterThanOrEqual(lineHeight * 5);
    // 字は 16px を下回らない（iOS Safari は 16px 未満の欄にフォーカスすると画面を拡大する）
    expect(await field.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    // 本体が潰れない（脇で札が低くなると、本体は欄より低くなってよいが、欄の大半が見える高さは残る）
    expect(bodyBox.height).toBeGreaterThanOrEqual(lineHeight * 3);
    // 欄の見える部分（本体の箱で切った分）は札の中に収まる（1px の丸めは許す）。
    // シートは札の外（ダイアログ）がスクロールするので、本体の箱と札の箱は直接は比べない
    const visibleTop = Math.max(fieldBox.y, bodyBox.y);
    const visibleBottom = Math.min(fieldBox.y + fieldBox.height, bodyBox.y + bodyBox.height);
    expect(fieldBox.y).toBeGreaterThanOrEqual(bodyBox.y - 1);
    expect(visibleTop).toBeGreaterThanOrEqual(cardBox.y - 1);
    expect(visibleBottom).toBeLessThanOrEqual(cardBox.y + cardBox.height + 1);
  }

  /** 押す前と失敗の後で、「記録をコピー」と見出しの行が動かない（x・y・見出しの行の高さ。誤差 1px）。 */
  async function expectCopyButtonStays(scope: Locator): Promise<void> {
    const button = scope.getByRole('button', { name: '記録をコピー' });
    const head = scope.locator('.ui-section-head').first();
    // 押すと Playwright がボタンを画面へスクロールするので、ページの座標（スクロール量を足した値）で測る
    const measure = async () => ({
      button: await button.evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY }; }),
      head: await head.evaluate((el) => el.getBoundingClientRect().height),
    });
    const before = await measure();
    await button.click();
    await expect(scope.getByRole('status')).toHaveText('コピーできません');
    await expect(scope.getByRole('textbox', { name: '手動コピー用の Markdown' })).toBeVisible();
    const after = await measure();
    expect(Math.abs(after.button.x - before.button.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.button.y - before.button.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.head - before.head)).toBeLessThanOrEqual(1);
  }

  /** お題を掲げた同じルームで、記録を作る（お題の札が上に来て、脇の記録の札が低くなる）。 */
  async function recordWithTopic(page: Page, openPeer: (label: string) => Promise<{ page: Page }>, cards: readonly string[]): Promise<void> {
    const url = await createRoom(page, HOST);
    const topic = await openPeer('log-topic');
    await joinTopicTool(topic.page, url, 'log-t');
    await setTopic(topic.page, 'FizzBuzz', Array.from({ length: 30 }, (_, i) => `本文の行 ${i + 1}`).join('\n\n'));
    await expect(page.getByRole('region', { name: 'お題', exact: true })).toBeVisible();
    await recordInto(page, cards);
  }

  test('Given コピーが両方失敗する 1280 の画面 / When 脇の記録からコピー / Then Markdown を選べる欄が出て、押す前は出ない（#653）', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await recordItems(page, ['2', '3']);
    await breakCopy(page);
    const log = sideLog(page);
    await expect(log.getByRole('textbox', { name: '手動コピー用の Markdown' })).toHaveCount(0);
    await log.getByRole('button', { name: '記録をコピー' }).click();
    await expect(log.getByRole('status')).toHaveText('コピーできません');
    const field = log.getByRole('textbox', { name: '手動コピー用の Markdown' });
    await expect(field).toBeVisible();
    const value = await field.inputValue();
    expect(value.split('\n').filter((line) => line.startsWith('### '))).toEqual(['### 見積もり 2', '### 見積もり 1']);
    await field.focus();
    const selected = await field.evaluate((el) => (el as HTMLTextAreaElement).value.slice((el as HTMLTextAreaElement).selectionStart, (el as HTMLTextAreaElement).selectionEnd));
    expect(selected).toBe(value);
  });

  test('Given コピーが成功する 1280 の画面 / When 脇の記録からコピー / Then 「コピーしました」だけで、Markdown の欄は出ない（#653）', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await recordItems(page, ['2', '3']);
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.resolve() } });
    });
    const log = sideLog(page);
    await log.getByRole('button', { name: '記録をコピー' }).click();
    await expect(log.getByRole('status')).toHaveText('コピーしました');
    await expect(log.getByRole('textbox', { name: '手動コピー用の Markdown' })).toHaveCount(0);
  });

  test('Given コピーが両方失敗する 1280×700・10 束の画面 / When 脇の記録からコピー / Then 知らせが欄に重ならず、欄は縮まず札の中に収まる（#653）', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 700 });
    await recordItems(page, ['1', '2', '3', '5', '8', '13', '1', '2', '3', '5']);
    await breakCopy(page);
    await expectManualFieldInCard(sideLog(page));
  });

  // お題の札が上に来て脇の記録の札が低くなる。欄が札の下へはみ出し、記録の一覧が高さ 0 になった（#653 のレビュー・2 回目）
  for (const { height, cards } of [
    { height: 700, cards: ['1', '2', '3', '5', '8', '13', '1', '2', '3', '5'] },
    { height: 800, cards: ['2', '3'] },
  ]) {
    test(`Given お題を開いた 1280×${height}・${cards.length} 束でコピーが両方失敗する / When 脇の記録からコピー / Then 知らせが欄に重ならず、欄は札の中に収まり、記録の一覧は潰れない（#653）`, async ({ page, openPeer }) => {
      await page.setViewportSize({ width: 1280, height });
      await recordWithTopic(page, openPeer, cards);
      await breakCopy(page);
      // 本体が 0 に潰れれば、欄が本体の箱に収まらず落ちる
      await expectManualFieldInCard(sideLog(page));
    });
  }

  /** 要素の見える高さ（px）。本体（スクロールする箱）で切る。scrollIntoView は呼ばない。 */
  async function visibleHeightInBody(body: Locator, target: Locator): Promise<number> {
    const bodyBox = await body.boundingBox();
    const box = await target.boundingBox();
    if (!bodyBox || !box) throw new Error('箱が測れない');
    return Math.max(0, Math.min(box.y + box.height, bodyBox.y + bodyBox.height) - Math.max(box.y, bodyBox.y));
  }

  // 本体を少しでもスクロールしてから押すと、頭に入った欄の分だけ位置が送られて、失敗が見えなかった（#653 のレビュー・3 回目）
  for (const { height, cards, topic } of [
    { height: 700, cards: ['1', '2', '3', '5', '8', '13', '1', '2', '3', '5'], topic: false },
    { height: 800, cards: ['1', '2', '3', '5', '8', '13', '1', '2', '3', '5'], topic: true },
  ]) {
    for (const scrollTop of [1, 200]) {
      test(`Given 脇の記録の本体を ${scrollTop}px スクロールした 1280×${height}${topic ? '・お題あり' : ''} / When コピーが両方失敗する / Then スクロールせずに、失敗の文と欄が本体の中に見える（#653）`, async ({ page, openPeer }) => {
        await page.setViewportSize({ width: 1280, height });
        if (topic) await recordWithTopic(page, openPeer, cards);
        else await recordItems(page, cards);
        await breakCopy(page);
        const log = sideLog(page);
        const body = log.locator('.estimate-log-body');
        await body.evaluate((el, by) => { el.scrollTop = by; }, scrollTop);
        expect(await body.evaluate((el) => el.scrollTop), '押す前に本体がスクロールしている').toBeGreaterThan(0);
        await log.getByRole('button', { name: '記録をコピー' }).click();
        await expect(log.getByRole('status')).toHaveText('コピーできません');
        const message = body.getByText('コピーできません', { exact: true });
        const field = body.getByRole('textbox', { name: '手動コピー用の Markdown' });
        await expect(field).toBeVisible();
        const lineHeight = await field.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.2);
        const seenMessage = await visibleHeightInBody(body, message);
        const seenField = await visibleHeightInBody(body, field);
        const messageLine = await message.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.2);
        expect(seenMessage, `文の見える高さ ${seenMessage}px`).toBeGreaterThanOrEqual(messageLine);
        expect(seenField, `欄の見える高さ ${seenField}px`).toBeGreaterThanOrEqual(lineHeight);
      });
    }
  }

  // 失敗のまま本体をスクロールして押し直すと、state が変わらず効果が動かず、失敗が見えなかった（#653 のレビュー・4 回目）
  test('Given 失敗した後に脇の記録の本体をスクロールした 1280×700・10 束 / When もう一度（3 回目も）コピーする / Then スクロールせずに、失敗の文と欄が本体の中に見える（#653）', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 700 });
    await recordItems(page, ['1', '2', '3', '5', '8', '13', '1', '2', '3', '5']);
    await breakCopy(page);
    const log = sideLog(page);
    const body = log.locator('.estimate-log-body');
    const message = body.getByText('コピーできません', { exact: true });
    const field = body.getByRole('textbox', { name: '手動コピー用の Markdown' });
    for (const round of [1, 2, 3]) {
      if (round > 1) {
        await body.evaluate((el) => { el.scrollTop = 200; });
        expect(await body.evaluate((el) => el.scrollTop), `${round} 回目の前に本体がスクロールしている`).toBeGreaterThan(0);
      }
      await log.getByRole('button', { name: '記録をコピー' }).click();
      await expect(log.getByRole('status')).toHaveText('コピーできません');
      await expect(field).toBeVisible();
      const lineHeight = await field.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.2);
      const messageLine = await message.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.2);
      const seenMessage = await visibleHeightInBody(body, message);
      const seenField = await visibleHeightInBody(body, field);
      expect(seenMessage, `${round} 回目: 文の見える高さ ${seenMessage}px`).toBeGreaterThanOrEqual(messageLine);
      expect(seenField, `${round} 回目: 欄の見える高さ ${seenField}px`).toBeGreaterThanOrEqual(lineHeight);
    }
  });

  for (const width of [390, 1025, 1280]) {
    test(`Given コピーが両方失敗する幅 ${width} の画面 / When 記録をコピー / Then 「記録をコピー」と見出しの行は押す前と同じ位置にある（#653）`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await recordItems(page, ['2', '3']);
      await breakCopy(page);
      await expectCopyButtonStays(width >= 1024 ? sideLog(page) : page.locator('.room-log--foot'));
    });
  }

  test('Given コピーが両方失敗する幅 390 の画面 / When 足の記録からコピー / Then 知らせが欄に重ならない（#653）', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await recordItems(page, ['2', '3']);
    await breakCopy(page);
    await expectManualFieldInCard(page.locator('.room-log--foot'));
  });

  test('Given コピーが両方失敗する幅 390 の画面 / When 記録のシートからコピー / Then 知らせが欄に重ならない（#653）', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await recordItems(page, ['2', '3', '5', '8']);
    await page.getByRole('button', { name: '記録をすべて見る' }).click();
    const drawer = page.getByRole('dialog', { name: '見積もりの記録' });
    await breakCopy(page);
    await expectManualFieldInCard(drawer);
  });

  test('Given コピーが両方失敗する幅 390 の画面 / When 記録のシートからコピー / Then シートの中に Markdown を選べる欄が出る（#653）', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    // シートの入口（記録をすべて見る）は、足に出す数（FOOT_LOG_LIMIT = 3）より多いときだけ出る
    await recordItems(page, ['2', '3', '5', '8']);
    await page.getByRole('button', { name: '記録をすべて見る' }).click();
    const drawer = page.getByRole('dialog', { name: '見積もりの記録' });
    await breakCopy(page);
    await drawer.getByRole('button', { name: '記録をコピー' }).click();
    await expect(drawer.getByRole('status')).toHaveText('コピーできません');
    const field = drawer.getByRole('textbox', { name: '手動コピー用の Markdown' });
    await expect(field).toBeVisible();
    // 足の 3 束だけでなく、シートが持つ全部の束が入る
    expect((await field.inputValue()).split('\n').filter((line) => line.startsWith('### '))).toEqual([
      '### 見積もり 4', '### 見積もり 3', '### 見積もり 2', '### 見積もり 1',
    ]);
  });

  test('Given 幅 1280・高さ 700 / When 開票と次のアイテムへを 10 回くり返す / Then 手札も脇も画面に収まり、記録は脇の中でスクロールする', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 700 });
    await createRoom(page, HOST);
    await turnRecordingOn(page);
    // 1 人なので投票すると自動で公開される
    for (let i = 0; i < 10; i += 1) {
      await chooseCard(page, '5');
      await expect(resultsSection(page)).toBeVisible();
      await page.getByRole('button', { name: '次のアイテムへ' }).click();
      await expect(resultsSection(page)).toHaveCount(0);
    }
    await expect(groups(page)).toHaveCount(10);
    const hand = await page.locator('.card-hand').boundingBox();
    expect(hand, '手札が描かれていない').not.toBeNull();
    expect(hand!.y + hand!.height, '束が積まれて手札が画面の下へ押し出された').toBeLessThanOrEqual(700);
    const side = await page.locator('.room-side').boundingBox();
    expect(side!.y + side!.height, '脇が画面の下へはみ出した').toBeLessThanOrEqual(700);
    const body = await page.locator('.room-log--side .estimate-log-body').evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }));
    expect(body.scroll, '記録が脇の中で溢れていない（10 束で前提が崩れている）').toBeGreaterThan(body.client);
  });
});
