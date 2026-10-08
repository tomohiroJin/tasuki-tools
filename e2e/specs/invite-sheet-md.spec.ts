/**
 * 招待リンクの表示・象牙の札・Markdown の見た目（#320 PR 4）。
 *
 * **タグを付けない（`local` 専用）。** 理由は `timer-a11y.spec.ts` と同じ（見るのはスタイルの健全性）。
 *
 * **札と Markdown の判定は、写しを部品へ置き換える前でも緑になる**（写しと部品が同じ値を持つ）。守るのは
 * 「部品を当て忘れる」後退で、赤は破壊検証で見る（計画 Task 6）。招待リンクは poker の写しがお題ツールと
 * 違う値（生の色・5 段の外の大きさ）を持っていたので、置き換える前は poker だけが赤になる。
 */
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../fixtures/test';
import { expectReadable, pairKey, resolveColors, scanContrast } from '../support/a11y';
import { invitedUrlText, joinRoom } from '../support/poker';
import { currentTopic, openTopicTool, setTopic } from '../support/topic';

/** 見出し・リスト・引用・インラインコード・リンクを 1 つずつ持つ本文。書体の base 層に収まる英数字だけで書く。 */
const TITLE = 'FizzBuzz';
const BODY = ['# Rules', '', '- one', '- two', '', '> note', '', 'Use `x` and [example](https://example.com)'].join('\n');

/** トークンを画面上で解いて、その性質の計算値にする。 */
async function resolveStyle(page: Page, property: string, token: string): Promise<string> {
  return page.evaluate(
    ([prop, tok]) => {
      const probe = document.createElement('div');
      document.body.append(probe);
      probe.style.setProperty(prop, `var(${tok})`);
      const value = getComputedStyle(probe).getPropertyValue(prop);
      probe.remove();
      return value;
    },
    [property, token] as const,
  );
}

async function styleOf(locator: Locator, props: readonly string[]): Promise<Record<string, string>> {
  return locator.evaluate(
    (el, list) => Object.fromEntries(list.map((p) => [p, getComputedStyle(el).getPropertyValue(p)])),
    props,
  );
}

/** 招待リンク: URL の枠は点線の `--line-strong`・地なし・等幅、行の字は `--font-size-sm`。 */
async function expectInvite(page: Page, url: Locator, label: string): Promise<void> {
  await expect(url, label).toBeVisible();
  const [lineStrong, ivoryDim] = await resolveColors(page, ['--line-strong', '--ivory-dim']);
  const mono = await resolveStyle(page, 'font-family', '--font-mono');
  const sm = await resolveStyle(page, 'font-size', '--font-size-sm');
  expect(
    await styleOf(url, ['border-top-style', 'border-top-color', 'background-color', 'color', 'font-family']),
    `${label} の URL の枠`,
  ).toEqual({
    'border-top-style': 'dashed',
    'border-top-color': lineStrong,
    'background-color': 'rgba(0, 0, 0, 0)',
    color: ivoryDim,
    'font-family': mono,
  });
  expect((await styleOf(url.locator('..'), ['font-size']))['font-size'], `${label} の招待リンクの字の大きさ`).toBe(sm);
}

/** 札は象牙の地に `--coal` の字、中の Markdown は部品の値。`card` は札自身（Markdown を包む箱と別のとき）。 */
async function expectSheetAndMarkdown(page: Page, sheet: Locator, label: string, card?: Locator): Promise<void> {
  await expect(sheet, label).toBeVisible();
  const [ivory, coal, coalSoft] = await resolveColors(page, ['--ivory', '--coal', '--coal-soft']);
  const radius = await resolveStyle(page, 'border-top-left-radius', '--radius-lg');
  const space5 = await resolveStyle(page, 'padding-top', '--space-5');
  const base = await resolveStyle(page, 'font-size', '--font-size-base');
  const mono = await resolveStyle(page, 'font-family', '--font-mono');

  if (card === undefined) {
    expect(
      await styleOf(sheet, ['background-color', 'color', 'border-top-left-radius', 'padding-top']),
      `${label} の札`,
    ).toEqual({ 'background-color': ivory, color: coal, 'border-top-left-radius': radius, 'padding-top': space5 });
  } else {
    // poker の読む面（`.ui-reader`）はグラデーションの札。地は単色でなく `background-image` に出る
    const own = await styleOf(card, ['background-image', 'color', 'border-top-left-radius']);
    expect(own['background-image'], `${label} の読む面の地`).toContain('linear-gradient');
    expect({ color: own['color'], radius: own['border-top-left-radius'] }, `${label} の読む面`).toEqual({
      color: coal,
      radius,
    });
  }

  const link = sheet.getByRole('link', { name: 'example', exact: true });
  expect(await styleOf(link, ['color', 'text-decoration-line']), `${label} のリンク`).toEqual({
    color: coal,
    'text-decoration-line': 'underline',
  });
  expect(
    await styleOf(sheet.getByRole('heading', { level: 4, name: 'Rules' }), ['font-size', 'margin-top']),
    `${label} の見出し`,
  ).toEqual({ 'font-size': base, 'margin-top': '0px' });
  expect((await styleOf(sheet.getByRole('list'), ['padding-left']))['padding-left'], `${label} のリスト`).toBe(space5);
  expect(
    await styleOf(sheet.locator('blockquote'), ['border-left-width', 'border-left-style', 'border-left-color']),
    `${label} の引用`,
  ).toEqual({ 'border-left-width': '2px', 'border-left-style': 'solid', 'border-left-color': coalSoft });
  expect(
    await styleOf(sheet.locator('code'), ['border-top-color', 'font-family']),
    `${label} のコード`,
  ).toEqual({ 'border-top-color': coalSoft, 'font-family': mono });
}

test.describe('招待リンクの表示・象牙の札・Markdown の見た目（#320 PR 4）', () => {
  test('Given お題ツールでお題を掲げる / When 招待リンクと札を測る / Then 部品の値で、札の上の字はすべて読める', async ({ page }) => {
    // Given
    const inviteUrl = await openTopicTool(page, 'sheet-topic');
    await setTopic(page, TITLE, BODY);

    // Then その1: 招待リンク
    await expectInvite(page, page.getByText(inviteUrl, { exact: true }), 'お題ツール');
    // Then その2: 札と Markdown
    await expectSheetAndMarkdown(page, currentTopic(page).getByRole('article'), 'お題ツール');
    // Then その3: 札の上の字（`--coal` on `--ivory`）を測ったことを固定する
    const [coal, ivory] = await resolveColors(page, ['--coal', '--ivory']);
    expectReadable(await scanContrast(page, 5), 5, [pairKey(coal!, ivory!)]);
  });

  test('Given お題を掲げたルーム / When poker の読む面を測る / Then 部品の値で、札の上の字はすべて読める', async ({
    page,
    openPeer,
  }) => {
    // Given
    const inviteUrl = await openTopicTool(page, 'sheet-host');
    await setTopic(page, TITLE, BODY);
    const poker = await openPeer('sheet-poker');
    await joinRoom(poker.page, inviteUrl, 'sheet-poker');
    const topic = poker.page.getByRole('region', { name: 'お題', exact: true });
    const body = topic.getByRole('region', { name: TITLE, exact: true });

    // Then その1: 招待リンク（main の poker は半透明の黒の地・金の点線・12.8px で、ここが赤になる）
    await expectInvite(poker.page, invitedUrlText(poker.page), 'poker');
    // Then その2: 読む面（札）と、その本文の Markdown
    await expectSheetAndMarkdown(poker.page, body, 'poker', topic);
    // Then その3: 札の上の字（読む面の地はグラデーション）
    const [coal, sheen, shade] = await resolveColors(poker.page, ['--coal', '--card-sheen', '--card-shade']);
    const cardGround = `rgba(0, 0, 0, 0) + linear-gradient(160deg, ${sheen}, ${shade})`;
    expectReadable(await scanContrast(poker.page, 10), 8, [pairKey(coal!, cardGround)]);
  });

  test('Given 狭い幅の poker / When 「続きを読む」を開いて Esc で閉じる / Then シートが閉じ、フォーカスが「続きを読む」へ戻る', async ({
    page,
    openPeer,
  }) => {
    // Given
    const inviteUrl = await openTopicTool(page, 'esc-host');
    await setTopic(page, TITLE, BODY);
    const poker = await openPeer('esc-poker');
    await joinRoom(poker.page, inviteUrl, 'esc-poker');
    await poker.page.setViewportSize({ width: 390, height: 800 });
    const more = poker.page.getByRole('button', { name: '続きを読む' });
    const drawer = poker.page.getByRole('dialog', { name: TITLE });
    // When
    await more.click();
    await expect(drawer).toBeVisible();
    await poker.page.keyboard.press('Escape');
    // Then
    await expect(drawer).toBeHidden();
    await expect(more).toBeFocused();
  });

  test('Given 象牙の札の上 / When Tab で本文と「続きを読む」へフォーカスが来る / Then 輪の色は `--coal`', async ({ page, openPeer }) => {
    // Given: 本文は 64rem 以上、「続きを読む」は 64rem 未満で出るので、幅を替えて 1 つずつ測る
    const inviteUrl = await openTopicTool(page, 'ring-host');
    await setTopic(page, TITLE, BODY);
    const poker = await openPeer('ring-poker');
    await joinRoom(poker.page, inviteUrl, 'ring-poker');
    const [coal] = await resolveColors(poker.page, ['--coal']);
    const tabTo = async (target: Locator): Promise<string> => {
      for (let i = 0; i < 60; i += 1) {
        await poker.page.keyboard.press('Tab');
        if (await target.evaluate((el) => el === document.activeElement)) break;
      }
      await expect(target).toBeFocused();
      return (await styleOf(target, ['outline-color']))['outline-color']!;
    };
    // When / Then
    await poker.page.setViewportSize({ width: 1280, height: 800 });
    expect(await tabTo(poker.page.getByRole('region', { name: TITLE, exact: true })), '本文の輪').toBe(coal);
    await poker.page.setViewportSize({ width: 390, height: 800 });
    expect(await tabTo(poker.page.getByRole('button', { name: '続きを読む' })), '「続きを読む」の輪').toBe(coal);
  });
});
