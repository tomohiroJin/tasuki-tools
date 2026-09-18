/**
 * 玄関 LP のシナリオ。
 *
 * - `@core #7` — 実ブラウザで描画されること。`@smoke` は HTTP しか見ないので、
 *   **資材が 200 で返っていても JS が例外で止まっていれば気づけない**。
 * - `@core #274` — 見つからないルームの参加用 URL で、名乗らされずに知らされること。
 *   **入室の枠を 1 つ使う**（照会は無かったときだけ消費する。容量 60・補充 1/秒なので
 *   影響は無視できる。2026-09-18 実測）。
 * - タグ無し #10 — 札を選ぶと各ツールが開くこと（`local` 専用の回帰）。
 * - タグ無し #249 — 端末の記録への入口（`?view=history`）と、繋がらないときの玄関
 *   （`local` 専用。実ルームの枠を使い、WS を成立させない細工も要る）。
 */
import { expect, test } from '../fixtures/test';
import type { Page } from '@playwright/test';

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
    // **どちらも `?room=` を解し、ハブで名乗った人はそのまま中に入る**（#95 S5b）。
    // 復帰の組の鍵（`tasuki:resume:<ルームコード>`）を 3 つの画面で揃えたからである
    // （D12）。したがって目印は名乗りの画面ではなく、ルームの中のものになる。
    //
    // poker のルームは**この段から遅延生成される**（D8）。ハブで作ったルームには
    // ラウンドが無く、S5a までは入口の門に阻まれて入れなかった。
    { card: 'TDD Mob Pro Timer', path: '/timer/', landmark: 'セッションを開始' },
    { card: 'Planning Poker', path: '/poker/', landmark: '票を公開する' },
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
    await expect(hostRoster).toContainText('にいます');
  });
});

/**
 * 選択画面 → poker → 選択画面 → timer の往復（#95 S5b・#248 の R4 / R5）。
 *
 * **S5b でしか見られないのは「1 つのルームで両方の道具を使えること」である。**
 * S5a までハブで作ったルームは timer の状態しか持たず、poker を選ぶと入口の門に
 * 阻まれていた。ツール状態の遅延生成（D8）がその門を置き換えたことを、実画面で見る。
 *
 * 相手側の選択画面に「どの道具に居るか」が出ること（R5）も、ここでしか確かめられない
 * —— サーバーの実 WS テストは画面を持たず、単体テストは相手の画面を持たない。
 */
test.describe('選択画面から両方の道具を行き来できる（#95 S5b）', () => {
  test('Given 2 人が居るルーム / When 片方が poker と timer を往復する / Then どちらにも入れ、相手にも居場所が見える', async ({
    page,
    openPeer,
  }) => {
    // Given: 作成者がルームを作り、もう 1 人が参加用 URL から名乗る
    await page.goto('/');
    await page.getByLabel('ルーム名').fill('両方の道具');
    await page.getByLabel('あなたの名前').fill('あや');
    await page.getByRole('button', { name: 'ルームを作る' }).click();
    const invite = page.getByLabel('参加用 URL');
    await expect(invite, '選択画面の参加用 URL').toBeVisible();
    const inviteUrl = await invite.inputValue();

    const guest = await openPeer('both-tools-guest');
    await guest.page.goto(inviteUrl);
    await guest.page.getByLabel('あなたの名前').fill('いずみ');
    await guest.page.getByRole('button', { name: '参加する' }).click();
    const hostRoster = page.getByRole('list', { name: '参加者' });
    await expect(hostRoster).toContainText('いずみ');

    // When その1: 参加者が poker を選ぶ（**ラウンドはこのとき生まれる**・D8）
    await guest.page
      .getByRole('list', { name: 'ツール' })
      .getByRole('link', { name: /Planning Poker/ })
      .click();

    // Then その1: 名乗り直さずにルームの中に居る（ハブの復帰の組がそのまま効く）
    await expect
      .poll(() => new URL(guest.page.url()).pathname, { message: 'poker の行き先' })
      .toBe('/poker/');
    await expect(guest.page.getByRole('button', { name: '票を公開する' })).toBeVisible();
    await expect(guest.page.getByText('いずみ')).toBeVisible();

    // Then その2: 作成者の選択画面に、相手が poker に居ることが出る（R5）
    await expect(hostRoster).toContainText('Planning Poker にいます');

    // When その2: 選択画面へ戻り、今度は timer を選ぶ
    await guest.page.goto(inviteUrl);
    await guest.page
      .getByRole('list', { name: 'ツール' })
      .getByRole('link', { name: /TDD Mob Pro Timer/ })
      .click();

    // Then その3: timer にも名乗り直さずに入れる（同じルームが両方の状態を持つ）
    await expect
      .poll(() => new URL(guest.page.url()).pathname, { message: 'timer の行き先' })
      .toBe('/timer/');
    await expect(guest.page.getByRole('button', { name: 'セッションを開始' })).toBeVisible();

    // Then その4: 居場所の表示も追従する（poker から timer へ移ったことが相手に見える）
    await expect(hostRoster).toContainText('TDD Mob Pro Timer にいます');
    await expect(hostRoster).not.toContainText('Planning Poker にいます');
  });
});

/**
 * 端末の記録への入口（#95 S5c・#249。利用者の申し送り 2026-09-14）。
 *
 * **撤去した旧入口（timer の `Setup`）は「ルームに入っていなくても記録を見られる」
 * という性質を持っていた。** その性質を保つために、入口を玄関と選択画面の両方へ置き、
 * 行き先を `?view=history` という URL の形にした（`apps/timer-web/src/ui/entry.ts`）。
 *
 * **ここでしか見られないのは「別のアプリへ渡って戻ってくる」ことである。**
 * 玄関（`apps/landing`）と timer（`apps/timer-web`）は別バンドルで、間に Caddy の
 * 断片が挟まる。単体テストはどちらか片方の中しか見ないので、
 * **`/timer/?view=history` が実際に配信されるか**も、**戻り先が開いた元に一致するか**も
 * 確かめられない。
 *
 * **ルーム名に日本語を使う。** ルームコードにはルーム名がそのまま入る（例: `朝会モブ-a1b2`）
 * ので、`HistoryLink` の `encodeURIComponent` と `hubRoomPath` の符号化のどちらが
 * 抜けても、戻り先が別のルームになる。素の英数字だけで書くとこの経路が素通りする。
 */
test.describe('玄関と選択画面から端末の記録を見て、開いた元へ戻れる（#249）', () => {
  /** 履歴の画面。**見出しで掴む** —— 空でも記録があっても、ここだけは必ず出る。 */
  function historyHeading(page: Page) {
    return page.getByRole('heading', { name: '完了記録の履歴' });
  }

  test('Given ルームに入っていない玄関 / When 記録を見る / Then 履歴が出て、戻ると玄関へ帰る', async ({
    page,
  }) => {
    // Given: ルームを作る前の玄関（**ルームに入っていない**状態）
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'ルームを作る' })).toBeVisible();

    // When: 記録への入口をたどる
    await page.getByRole('link', { name: '記録を見る' }).click();

    // Then その1: timer の履歴が実際に描画されている。
    //             **パスまで見る** —— 玄関へ縮退していればこの見出しは無いが、
    //             行き先そのものが間違っていても気づけるように両方を固定する
    await expect
      .poll(() => new URL(page.url()).pathname, { message: '記録の行き先' })
      .toBe('/timer/');
    await expect(historyHeading(page), '履歴の見出し').toBeVisible();

    // When: 戻る
    await page.getByRole('button', { name: '戻る' }).click();

    // Then その2: **開いた元（玄関そのもの）へ帰る。** ルームコードは載らない
    await expect.poll(() => new URL(page.url()).pathname, { message: '戻り先' }).toBe('/');
    expect(new URL(page.url()).searchParams.get('room'), '戻り先に載ったルーム').toBeNull();
    await expect(page.getByRole('button', { name: 'ルームを作る' })).toBeVisible();
  });

  test('Given 選択画面 / When 記録を見る / Then 履歴が出て、戻ると同じルームの選択画面へ帰る', async ({
    page,
  }) => {
    // Given: 玄関でルームを作ると選択画面になる。**ルーム名は日本語**（符号化の経路を通す）
    await page.goto('/');
    await page.getByLabel('ルーム名').fill('記録の回帰');
    await page.getByLabel('あなたの名前').fill('あや');
    await page.getByRole('button', { name: 'ルームを作る' }).click();
    await expect(page.getByRole('list', { name: 'ツール' })).toBeVisible();
    const code = new URL(page.url()).searchParams.get('room');
    expect(code, '選択画面のルームコード').not.toBeNull();
    expect(code, 'ルーム名が日本語のままコードに入っている').toContain('記録の回帰');

    // When: 選択画面の記録への入口をたどる
    await page.getByRole('link', { name: '記録を見る' }).click();

    // Then その1: 履歴が出て、**どのルームから来たかを URL が運んでいる**
    await expect
      .poll(() => new URL(page.url()).pathname, { message: '記録の行き先' })
      .toBe('/timer/');
    expect(new URL(page.url()).searchParams.get('room'), '記録へ運ばれたルーム').toBe(code);
    await expect(historyHeading(page), '履歴の見出し').toBeVisible();

    // Then その2: **記録を見ているだけでは timer の画面にならない。**
    //             ここが出るなら入口の判定が `?room=` を先に見ている
    await expect(
      page.getByRole('button', { name: 'セッションを開始' }),
      '記録を見るだけのつもりで timer のロビーに着いている',
    ).toHaveCount(0);

    // When: 戻る
    await page.getByRole('button', { name: '戻る' }).click();

    // Then その3: **開いた元（同じルームの選択画面）へ帰る。**
    //             符号化が抜けていればコードが別物になり、ここで食い違う
    await expect.poll(() => new URL(page.url()).pathname, { message: '戻り先' }).toBe('/');
    expect(new URL(page.url()).searchParams.get('room'), '戻り先のルーム').toBe(code);

    // Then その4: 名乗り直しを求められず、選択画面がそのまま出る
    //             （復帰の組が効いている。作成画面へ落ちていれば札は無い）
    await expect(page.getByRole('list', { name: 'ツール' }), '選択画面の札').toBeVisible();
    await expect(page.getByLabel('参加用 URL'), '選択画面の参加用 URL').toBeVisible();
  });
});

/**
 * 玄関の同期サーバーへ繋がらないときの見え方（#249・#76 F-2 の回帰防止）。
 *
 * **作成と参加のフォームは #95 S5c で玄関へ集まった。** 押せないボタンはここにしか
 * 無くなったので、「繋がらないと押せない」ことを見張る場所もここになる
 * （poker 側の同じシナリオは、押せないボタンを失って「入室を待つ画面」の告知だけを見ている）。
 *
 * **サーバーは止めない。** 止めると全 worker の共有資源が消え、無関係なシナリオを
 * 巻き込む（`playwright.config.ts` は local で並列実行する）。代わりに、そのページの
 * **ハブの WS だけ**を成立させない。`connectToServer()` を呼ばないので実サーバーには
 * 一切触れず、クライアントから見た状態（一度も繋がっていない）はサーバーを
 * 落としたときと同じになる。
 */
test.describe('玄関の同期サーバーへ繋がらないことが画面から分かる（#249）', () => {
  /**
   * そのページの**ハブの WS だけ**を成立させない。
   *
   * **`?tool=` を持つ接続（timer / poker）は掴まない。** 入口は `/ws` の 1 本になり、
   * 振り分けはクエリだけで決まる（`apps/tasuki-sync/src/adapters/ws-adapter.ts` の
   * `protocolFromRequestUrl`）ので、パスだけで掴むとツール側の接続まで巻き添えになる。
   */
  async function hubSyncIsDown(page: Page): Promise<void> {
    await page.routeWebSocket(
      (url) => url.pathname === '/ws' && !url.searchParams.has('tool'),
      (ws) => {
        void ws.close();
      },
    );
  }

  /** 接続の告知。**`role` まで含めて掴む。** 読み上げに乗ることが F-2 の要件である。 */
  function unreachableAlert(page: Page) {
    return page.getByRole('alert');
  }

  test('Given ハブへ繋がらない / When 玄関を開く / Then ルームを作れないことが読み上げ可能な形で示される', async ({
    page,
  }) => {
    // Given: ハブの接続を成立させない
    await hubSyncIsDown(page);

    // When: 玄関を開く
    await page.goto('/');

    // Then その1: **読み上げに乗る形で**、繋がらないことが伝わっている
    const notice = unreachableAlert(page);
    await expect(notice, '接続できないことの告知').toHaveCount(1);
    await expect(notice).toContainText('同期サーバーに接続できません');

    // Then その2: 復旧まで何ができないかが書かれている（一時的な状態として案内しない）
    await expect(notice, '復旧まで何ができないかの説明').toContainText(
      'ルームの作成と参加はできません',
    );

    // Then その3: **押せない。** 未接続で押せると、送った command が黙って積まれるだけで
    //             画面は何も返さない（#76 F-2 の「使い物にならない」の正体）
    await expect(
      page.getByRole('button', { name: 'ルームを作る' }),
      '繋がっていないのに作成が押せる',
    ).toBeDisabled();
  });

  test('Given ハブへ繋がらない / When 参加用 URL を開く / Then 参加できないことが読み上げ可能な形で示される', async ({
    page,
    openPeer,
  }) => {
    // Given: **実在するルームの参加用 URL を用意する。** 作り話のコードで代用すると、
    //        参加画面が出る条件（`?room=` があること）しか見ないテストになる
    await page.goto('/');
    await page.getByLabel('ルーム名').fill('繋がらない玄関');
    await page.getByLabel('あなたの名前').fill('あや');
    await page.getByRole('button', { name: 'ルームを作る' }).click();
    const invite = page.getByLabel('参加用 URL');
    await expect(invite, '選択画面の参加用 URL').toBeVisible();
    const inviteUrl = await invite.inputValue();

    // Given: **別の文脈**で開く（同じ文脈の 2 枚目は復帰の組を共有して名乗りを求められない）。
    //        その文脈のハブの接続だけを成立させない
    const guest = await openPeer('hub-offline-guest');
    await hubSyncIsDown(guest.page);

    // When: 参加用 URL を開く
    await guest.page.goto(inviteUrl);

    // Then その1: 参加の画面に着いている（作成の画面ではない）
    await expect(
      guest.page.getByRole('button', { name: '参加する' }),
      '参加の画面',
    ).toBeVisible();

    // Then その2: **読み上げに乗る形で**、繋がらないことが伝わっている
    const notice = unreachableAlert(guest.page);
    await expect(notice, '接続できないことの告知').toHaveCount(1);
    await expect(notice).toContainText('同期サーバーに接続できません');
    await expect(notice, '復旧まで何ができないかの説明').toContainText(
      'ルームの作成と参加はできません',
    );

    // Then その3: **押せない**
    await expect(
      guest.page.getByRole('button', { name: '参加する' }),
      '繋がっていないのに参加が押せる',
    ).toBeDisabled();

    // Then その4: **対照。** 細工していない作成者の側は繋がったままである。
    //             **見るのは作成者自身（あや）の行である** —— 参加者は繋がれず名乗って
    //             いないので、相手の名前はここに原理的に出ない。名簿が出ていること自体が
    //             「作成者のハブ接続が生きていて roster を受け取れている」ことの証拠になる。
    //             **肯定で見る** —— 「告知が出ていない」だけでは、作成者の側も一緒に
    //             死んでいる場合と区別が付かない
    await expect(page.getByRole('list', { name: '参加者' }), '作成者自身の名簿').toContainText(
      'あや',
    );
    await expect(
      page.getByText('接続が切れました'),
      '細工していない側にまで切断の告知が出ている',
    ).toHaveCount(0);
  });
});

/**
 * 見つからないルームの参加用 URL が行き止まりにならない（#274・#76 J-1）。
 *
 * 壊れていた頃は、終了したルームのリンクでも参加フォームが出て、**名前を入れて
 * 送信して初めて**「見つかりません」に変わった。
 *
 * **ルームを消す必要はない。** 存在しなかったコードで、サーバーは同じ経路
 * （`store.get` → `undefined`）を通る。
 *
 * ⚠ **このシナリオは入室の枠を 1 つ使う。** `room.check` は資源を引く前にレート判定を
 * 通り、**無かったときだけ** `consume` する。存在しないコードを指す照会は必ず
 * `ROOM_NOT_FOUND` で終わるので、そのぶんを消費する。枠は **IP 単位**で全 worker が
 * 1 つのバケツを共有している（`timer.spec.ts` の同じ注記を参照）。
 */
test.describe('@core 見つからないルームの参加用 URL', () => {
  test('Given 存在しないルームコード / When 玄関を開く / Then 名乗らされずに知らされる', async ({
    page,
  }) => {
    // When: 在らぬコードの参加用 URL を開く
    await page.goto('/?room=zzzzzzzz');

    // Then その1: **見出しが出るのを先に待つ。** 待たずに「フォームが無い」だけを
    //             見ると、まだ描画されていない画面に対しても緑になる
    await expect(
      page.getByRole('heading', { name: 'ルームが見つかりません' }),
      '不在の知らせ',
    ).toBeVisible();

    // Then その2: **名乗らされない。** これが #274 の本体である
    // ⚠ **不在を明示する。** `toBeHidden()` は要素が存在しなくても通ってしまうので、
    // 「無い」ことそのものを見る `toHaveCount(0)` にする（最終レビュー M5）。
    await expect(page.getByLabel('あなたの名前'), '名乗りフォーム').toHaveCount(0);

    // Then その3: **戻る道がある。** これが無いと行き止まりになる
    await expect(
      page.getByRole('link', { name: '新しいルームを作る' }),
      '戻る導線',
    ).toBeVisible();
  });
});
