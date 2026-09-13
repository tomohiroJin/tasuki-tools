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

    // Then その2: **ルームを作る画面である**（#95 S5a で玄関がハブになった）。
    //             札は選択画面に移ったので、ここには出ない
    await expect(page.getByLabel('ルーム名')).toBeVisible();
    await expect(page.getByLabel('あなたの名前')).toBeVisible();
    await expect(page.getByRole('button', { name: 'ルームを作る' })).toBeVisible();

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
test.describe('選択画面の札から各ツールへ移動できる', () => {
  const TOOLS = [
    // **目印はそのアプリにしか無いものを選ぶ。** LP へ縮退していたら見えない。
    //
    // timer は `?room=` を解し、**ハブで名乗った人はそのままロビーに入る** ——
    // 復帰の組の鍵（`tasuki:resume:<ルームコード>`）をハブと timer で揃えたからである
    // （#95 S4b の形・D12）。したがって目印は名乗りの画面ではなくロビーのものになる。
    //
    // poker は `?room=` をまだ解さないので入口の画面が出る（S5b・#248 で直す）。
    { card: 'TDD Mob Pro Timer', path: '/timer/', landmark: 'セッションを開始' },
    { card: 'Planning Poker', path: '/poker/', landmark: 'ルームを作成' },
  ] as const;

  for (const tool of TOOLS) {
    test(`Given 選択画面 / When ${tool.card} の札を選ぶ / Then ${tool.path} が開く`, async ({
      page,
    }) => {
      // Given: ハブでルームを作ると、札が並ぶ選択画面になる（#95 S5a）
      await page.goto('/');
      await page.getByLabel('ルーム名').fill('玄関の回帰');
      await page.getByLabel('あなたの名前').fill('あや');
      await page.getByRole('button', { name: 'ルームを作る' }).click();
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

/**
 * ハブの往復（#95 S5a・#247 の R1 / R2 / R3 / R4 / R6）。
 *
 * **ここでしか見られないのは「2 人が同じ名簿を見ていること」と「ツールを行き来しても
 * 名簿と状態が保たれること」である。** 単体テストは片方の画面しか持たず、
 * サーバーの実 WS テストは画面を持たない。
 *
 * `openPeer` で**別の文脈**を開くこと。同じ文脈の 2 枚目は `localStorage` を共有するので、
 * S4b の復帰が働いて同一人物として戻り、2 人に見えない（fixtures/test.ts の注記）。
 */
test.describe('ハブでルームを作り、名乗って、道具を行き来できる', () => {
  test('Given 作成者と参加者 / When 参加用 URL から名乗って timer を往復する / Then 名簿が揃い、状態が残る', async ({
    page,
    openPeer,
  }) => {
    // Given: 作成者がルームを作る（R1）
    await page.goto('/');
    await page.getByLabel('ルーム名').fill('往復のルーム');
    await page.getByLabel('あなたの名前').fill('あや');
    await page.getByRole('button', { name: 'ルームを作る' }).click();

    // **参加用 URL は画面に出ているものを読む。** `page.url()` を使うと、
    // 生成が壊れていても自分の居場所が返るだけで緑になる（#76 F-1 と同じ罠）
    const invite = page.getByLabel('参加用 URL');
    await expect(invite, '選択画面の参加用 URL').toBeVisible();
    const inviteUrl = await invite.inputValue();
    expect(new URL(inviteUrl).pathname, `参加用 URL（${inviteUrl}）`).toBe('/');

    // When: 別の人がその URL から名乗る（R2）
    const guest = await openPeer('hub-guest');
    await guest.page.goto(inviteUrl);
    await guest.page.getByLabel('あなたの名前').fill('いずみ');
    await guest.page.getByRole('button', { name: '参加する' }).click();

    // Then その1: **双方の一覧に相手が出る**（R3）。片方だけ見ると、
    //             自分の操作の結果と配信を区別できない
    const hostRoster = page.getByRole('list', { name: '参加者' });
    const guestRoster = guest.page.getByRole('list', { name: '参加者' });
    await expect(hostRoster).toContainText('いずみ');
    await expect(guestRoster).toContainText('あや');

    // When: 参加者が timer を選ぶ（R4）
    await guest.page
      .getByRole('list', { name: 'ツール' })
      .getByRole('link', { name: /TDD Mob Pro Timer/ })
      .click();

    // Then その2: timer が開き、ルームコードを引き継いでいる
    await expect
      .poll(() => new URL(guest.page.url()).pathname, { message: 'timer の行き先' })
      .toBe('/timer/');
    expect(new URL(guest.page.url()).searchParams.get('room'), 'timer へ渡った room').not.toBeNull();

    // Then その3: **選択画面に居る作成者は、timer の一覧に出ない**（R6 の裏返し）。
    //             ここが出るなら、在席での絞り込みが効いていない
    await expect(guest.page.getByText('あや', { exact: false }).first()).toBeHidden({
      timeout: 2000,
    });

    // Then その4: 作成者の選択画面では、参加者が timer に居ることが分かる
    await expect(hostRoster).toContainText('に居ます');
  });
});
