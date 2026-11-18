import { expect, test } from '../fixtures/test';
import { expectScreenAcrossWidths } from '../support/a11y';
import { createRoom, currentDriverRow, joinAsDriver, lobbyRotationRow } from '../support/timer';

test('完了画面と保存済み履歴から同じ Markdown をコピーできる（#408）', async ({ page, context, openPeer }) => {
  const host = 'Markdown Host';
  const guest = 'Markdown Guest';
  const code = await createRoom(page, host);
  const peer = await openPeer('timer-markdown-guest');
  await joinAsDriver(peer.page, code, guest);
  await expect(lobbyRotationRow(page, host, 1)).toHaveCount(1);
  await expect(lobbyRotationRow(page, guest, 2)).toHaveCount(1);

  await page.getByRole('button', { name: 'セッションを開始' }).click();
  await expect(currentDriverRow(page)).toContainText(host);
  await page.getByRole('button', { name: 'スキップ', exact: true }).click();
  await expect(currentDriverRow(page)).toContainText(guest);
  await page.getByRole('button', { name: '完成!', exact: true }).click();
  await page.getByRole('button', { name: '完成として記録する' }).click();

  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(page.url()).origin });
  // 履歴からのコピーが空振りしても、完了画面でコピーした値が残っていると通ってしまう。
  // 両方の操作の前にクリップボードを別の値にしておく。
  const prepareClipboard = () => page.evaluate(() => navigator.clipboard.writeText('コピー前'));
  const readClipboard = () => page.evaluate(() => navigator.clipboard.readText());

  const completeCopy = page.getByRole('button', { name: 'Markdown をコピー', exact: true });
  await expect(completeCopy).toBeVisible();
  await expectScreenAcrossWidths(page, 'timer 完了画面', 3, '.summary');
  await prepareClipboard();
  await completeCopy.click();
  await expect(page.getByText('コピーしました', { exact: true })).toBeVisible();
  const markdown = await readClipboard();
  expect(markdown.split('\n')).toEqual([
    'セッションまとめ',
    '',
    '- お題：お題なし',
    expect.stringMatching(/^- 所要時間：\d+分\d{2}秒$/),
    '- 交代回数：1回',
    '- 周回数：0周',
    '- 参加者（2人）',
    '  - 「Markdown Host」（担当1回）',
    '  - 「Markdown Guest」（担当0回）',
  ]);

  await page.goto('/');
  await page.getByRole('link', { name: '記録を見る' }).click();
  const historyCopy = page.getByRole('button', { name: /Markdown をコピー.*お題なし/ });
  await expect(historyCopy).toBeVisible();
  await expectScreenAcrossWidths(page, 'timer 履歴の記録', 3, '.history');
  await prepareClipboard();
  await historyCopy.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('コピーしました', { exact: true })).toBeVisible();
  expect(await readClipboard()).toBe(markdown);
});
