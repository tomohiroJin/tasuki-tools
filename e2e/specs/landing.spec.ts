/**
 * 玄関 LP が実ブラウザで描画されること（@core #7）。
 *
 * `@smoke` は HTTP しか見ないので、**資材が 200 で返っていても JS が例外で
 * 止まっていれば気づけない**。ここが `production` で LP を実ブラウザで開く唯一の経路。
 */
import { expect, test } from '../fixtures/test';

test.describe('@core 玄関 LP が実ブラウザで描画される', () => {
  test('Given 稼働中のサイト / When / をブラウザで開く / Then 主要な要素が見え、コンソールエラーが無い', async ({
    page,
    consoleWatcher,
  }) => {
    // Given / When: 玄関を開く
    await page.goto('/');

    // Then その1: 名乗りが出ている
    await expect(page.getByRole('heading', { level: 1, name: 'Tasuki' })).toBeVisible();

    // Then その2: 札が 2 枚あり、それぞれ名前で見分けられる。
    //             件数まで固定するのは、1 枚も出ていない／片方だけ出ている状態を
    //             「見えている」で通さないため。
    const tools = page.getByRole('list', { name: 'ツール' });
    await expect(tools.getByRole('listitem')).toHaveCount(2);
    for (const name of ['TDD Mob Pro Timer', 'Planning Poker']) {
      await expect(tools.getByRole('link', { name: new RegExp(name) })).toBeVisible();
    }

    // Then その3: コンソールにエラーが出ていない。
    //             読み出す前に読み込みが落ち着くのを待つ。固定時間の待機ではなく
    //             「通信が止まったこと」を待つので、遅い回線でも速い回線でも同じ意味になる。
    await page.waitForLoadState('networkidle');
    expect(consoleWatcher.errors.join('\n'), 'LP のコンソールエラー').toBe('');
  });
});
