/**
 * 玄関 LP のシナリオ。
 *
 * - `@core #7` — 実ブラウザで描画されること。`@smoke` は HTTP しか見ないので、
 *   **資材が 200 で返っていても JS が例外で止まっていれば気づけない**。
 *   ここが `production` で LP を実ブラウザで開く唯一の経路。
 * - タグ無し #10 — 札を選ぶと各ツールが開くこと（`local` 専用の回帰）。
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

/**
 * 玄関から各ツールへ移動できること（#10・タグ無し = `local` 専用）。
 *
 * **行き先の URL だけを見てはいけない。** 断片は `try_files {path} /index.html` を
 * 持つので、配信が壊れていても包括フォールバック（LP）が 200 を返し続ける。
 * URL は変わるのに中身は LP のまま、という形で素通りする。
 * **そのアプリにしか無いものが見えること**まで確かめる。
 */
test.describe('玄関の札から各ツールへ移動できる', () => {
  const TOOLS = [
    // 「ルームを作る」（timer）と「ルームを作成」（poker）は 1 文字違いだが、
    // それぞれのアプリにしか無い。取り違えたらここで落ちる。
    { card: 'TDD Mob Pro Timer', path: '/timer/', landmark: 'ルームを作る' },
    { card: 'Planning Poker', path: '/poker/', landmark: 'ルームを作成' },
  ] as const;

  for (const tool of TOOLS) {
    test(`Given 玄関 / When ${tool.card} の札を選ぶ / Then ${tool.path} が開く`, async ({
      page,
    }) => {
      // Given: 玄関に札が並んでいる
      await page.goto('/');
      const card = page
        .getByRole('list', { name: 'ツール' })
        .getByRole('link', { name: new RegExp(tool.card) });
      await expect(card).toHaveCount(1);

      // When: 札を選ぶ
      await card.click();

      // Then その1: そのツールの公開パスへ移動している。
      //             `toContain` は使わない。`/timer/` は `/poker/` を含まないが、
      //             接頭辞の判定は入れ子で恒真になりうる（実測済み・routing.spec.ts 参照）
      await expect
        .poll(() => new URL(page.url()).pathname, { message: `${tool.card} の行き先` })
        .toBe(tool.path);

      // Then その2: **そのアプリが実際に描画されている。**
      //             LP へ縮退していれば、この目印は無い
      await expect(page.getByRole('button', { name: tool.landmark })).toBeVisible();
    });
  }
});
