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

/** 札は象牙の地に `--coal` の字、中の Markdown は部品の値。 */
async function expectSheetAndMarkdown(page: Page, sheet: Locator, label: string): Promise<void> {
  await expect(sheet, label).toBeVisible();
  const [ivory, coal, coalSoft] = await resolveColors(page, ['--ivory', '--coal', '--coal-soft']);
  const radius = await resolveStyle(page, 'border-top-left-radius', '--radius-lg');
  const space5 = await resolveStyle(page, 'padding-top', '--space-5');
  const base = await resolveStyle(page, 'font-size', '--font-size-base');
  const mono = await resolveStyle(page, 'font-family', '--font-mono');

  expect(
    await styleOf(sheet, ['background-color', 'color', 'border-top-left-radius', 'padding-top']),
    `${label} の札`,
  ).toEqual({ 'background-color': ivory, color: coal, 'border-top-left-radius': radius, 'padding-top': space5 });

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

  test('Given お題を掲げたルーム / When poker で説明を開いて測る / Then 部品の値で、札の上の字はすべて読める', async ({
    page,
    openPeer,
  }) => {
    // Given
    const inviteUrl = await openTopicTool(page, 'sheet-host');
    await setTopic(page, TITLE, BODY);
    const poker = await openPeer('sheet-poker');
    await joinRoom(poker.page, inviteUrl, 'sheet-poker');
    const topic = poker.page.getByRole('region', { name: 'お題', exact: true });
    await topic.getByText('説明を見る', { exact: true }).click();

    // Then その1: 招待リンク（main の poker は半透明の黒の地・金の点線・12.8px で、ここが赤になる）
    await expectInvite(poker.page, invitedUrlText(poker.page), 'poker');
    // Then その2: 札と Markdown（札は説明の中の、Markdown を包む箱）
    await expectSheetAndMarkdown(poker.page, topic.locator('details > div'), 'poker');
    // Then その3
    const [coal, ivory] = await resolveColors(poker.page, ['--coal', '--ivory']);
    expectReadable(await scanContrast(poker.page, 10), 8, [pairKey(coal!, ivory!)]);
  });
});
