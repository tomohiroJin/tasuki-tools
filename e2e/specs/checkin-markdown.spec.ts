/**
 * Check-in Cards の結果を Markdown でコピーして持ち出す（#676・設計 §16）。
 *
 * **タグを付けない（`local` 専用）。** 見るのはコピーの成功と失敗の経路・匿名の回の中身で、本番の煙には要らない。
 * ルームは 1 つだけ作る（名前つきの回 → 失敗の経路 → もう一回で欄が残らない → 匿名の回）。
 */
import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures/test';
import { chooseMethod, handCard, joinCheckinTool, openCheckinTool } from '../support/checkin';

const NAME_A = 'md-checkin-a';
const NAME_B = 'md-checkin-b';

const copyButton = (page: Page) => page.getByRole('button', { name: 'Markdown でコピー', exact: true });
const manualField = (page: Page) => page.getByRole('textbox', { name: '結果の Markdown' });

test('Given 2 人が同じ回で札を出して開いた / When 結果をコピーする / Then 名前つきは名前と答え・匿名は人数だけの Markdown が出て、失敗なら手で選べる欄が出る（#676）', async ({
  page,
  context,
  openPeer,
}) => {
  const inviteUrl = await openCheckinTool(page, NAME_A);
  const peer = await openPeer('checkin-markdown-b');
  await joinCheckinTool(peer.page, inviteUrl, NAME_B);
  const b = peer.page;
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(page.url()).origin });
  const readClipboard = () => page.evaluate(() => navigator.clipboard.readText());

  // 札を出す前は、操作が無い（開く前の中身を持ち出させない）
  await chooseMethod(page, 'チェックイン', '今日の天気');
  await expect(handCard(page, '晴れ')).toBeVisible();
  await expect(copyButton(page)).toHaveCount(0);
  await handCard(page, '晴れ').click();
  await expect(copyButton(page), '1 人出しただけ（まだ開いていない）').toHaveCount(0);

  // 名前つきで開いた: 名前と答えが出る
  await handCard(b, '雨').click();
  await expect(copyButton(page)).toBeVisible();
  await page.evaluate(() => navigator.clipboard.writeText('コピー前'));
  await copyButton(page).click();
  await expect(page.getByRole('status').filter({ hasText: 'コピーしました' })).toBeVisible();
  const named = (await readClipboard()).split('\n');
  expect(named[0]).toMatch(/^## チェックイン・チェックアウトの記録（\d{4}-\d{2}-\d{2} \d{2}:\d{2}）$/);
  // 名前が、出した札の山の下にある（どの山の下かまで見る）。晴れは A・雨は B
  const at = (line: string) => named.indexOf(line);
  expect(named).toEqual(expect.arrayContaining(['### チェックイン: 今日の天気', '公開の仕方: 名前つき']));
  expect(at('- 晴れ: 1 人')).toBeGreaterThan(-1);
  expect(named[at('- 晴れ: 1 人') + 1]).toBe(`  - ${NAME_A}`);
  expect(named[at('- 雨: 1 人') + 1]).toBe(`  - ${NAME_B}`);
  expect(named.filter((l) => l.startsWith('  - ')), '名前の行は出した 2 人だけ').toEqual([`  - ${NAME_A}`, `  - ${NAME_B}`]);

  // 失敗: どちらの経路も使えないとき、手で選べる欄に同じ文が出る
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    document.execCommand = () => false;
  });
  await copyButton(page).click();
  await expect(page.getByText('コピーできませんでした', { exact: false })).toBeVisible();
  await expect(manualField(page)).toHaveValue(named.join('\n'));
  await manualField(page).focus();
  expect(
    await manualField(page).evaluate((f: HTMLTextAreaElement) => f.value.slice(f.selectionStart, f.selectionEnd)),
    '欄に入ると全文が選ばれる',
  ).toBe(named.join('\n'));

  // 別のやり方を開いて、いまの回に戻っても、失敗の欄と見出しの日時は変わらない（時刻と欄は回ごとに 1 度・設計 §16）
  const failedText = await manualField(page).inputValue();
  await page.getByRole('button', { name: '別のやり方', exact: true }).click();
  await expect(copyButton(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'いまの回に戻る', exact: true }).click();
  await expect(manualField(page)).toHaveValue(failedText);
  expect((await manualField(page).inputValue()).split('\n')[0]).toBe(named[0]);

  // もう一回: 次の回では前の失敗の欄が残らない
  await page.getByRole('button', { name: 'もう一回', exact: true }).click();
  await expect(copyButton(page)).toHaveCount(0);
  await expect(manualField(page)).toHaveCount(0);

  // 匿名の回（ROTI）: コピーした Markdown に名前が 1 文字も無い
  await page.getByRole('button', { name: '別のやり方', exact: true }).click();
  await chooseMethod(page, 'チェックアウト', 'ROTI（時間に見合ったか）');
  await handCard(page, '4').click();
  await handCard(b, '4').click();
  await expect(copyButton(b)).toBeVisible();
  await b.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(b.url()).origin });
  await copyButton(b).click();
  await expect(b.getByRole('status').filter({ hasText: 'コピーしました' })).toBeVisible();
  const anonymous = await b.evaluate(() => navigator.clipboard.readText());
  expect(anonymous).toContain('公開の仕方: 匿名');
  expect(anonymous).toContain('- 4（得るものが多かった）: 2 人');
  expect(anonymous).not.toContain(NAME_A);
  expect(anonymous).not.toContain(NAME_B);
});
