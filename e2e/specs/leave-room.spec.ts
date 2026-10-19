/**
 * ルームを抜ける経路の E2E（Issue #290・Task 6）。
 *
 * #290 で「ルームを離れる」経路を直したが、退出を通る E2E はこれまで 1 本も無かった。
 * #249 では「E2E を実物の入口へ移して初めて露出した」欠陥があったため、ここで最初の
 * 1 本を足す。
 *
 * 通すのは #290 で直した振る舞いのうち次の 2 つ（セッション終了後の遷移は範囲外）。
 *
 * 1. 輪の最後の席を持つ人（＝作成者）でも「ルームから抜ける」が成立する。
 *    以前はサーバーが拒否し、押しても何も起きなかった。いまは見学者が繰り上がる
 * 2. 抜けた人は `/?room=<コード>&left=self` へ送られ、玄関で「ルームから抜けました。」
 *    の告知を見る（`packages/room-core/src/departure.ts` が綴りの正本）
 */
import { expect, test } from '../fixtures/test';
import { createRoom, joinViaHub, lobbyRotationRow } from '../support/timer';

const HOST = 'e2e-leave-alice';
const GUEST = 'e2e-leave-bob';

test.describe('timer のロビーからルームを抜けると、玄関で告知が出て、見学者が輪へ繰り上がる', () => {
  test('Given 作成者と見学のままの参加者 / When 作成者がロビーで「ルームから抜ける」を押す / Then 作成者は玄関へ移って退出の告知を見て、参加者が輪へ繰り上がる', async ({
    page,
    openPeer,
  }) => {
    // Given: 作成者（Alice）がルームを作り、timer のロビーに居る。
    //        輪の最後（かつ唯一）の1人でもある —— ここが #290 前は抜けられなかった状態
    const code = await createRoom(page, HOST);
    await expect(lobbyRotationRow(page, HOST, 1), '作成者は輪の1番目').toHaveCount(1);

    // Given: 参加用 URL から2人目（Bob）が名乗る。**「ドライバーに加わる」は押さない**
    //        （見学のまま、というのが既定であり、直る前に不具合が出ていた状態）
    const guest = await openPeer('leave-room-guest');
    await joinViaHub(guest.page, code, GUEST);
    await expect(
      guest.page.getByRole('button', { name: 'ドライバーに加わる' }),
      '見学のまま（輪に加わっていない）',
    ).toBeVisible();

    // When: 作成者がロビーの自分の行にある「ルームから抜ける」を押す
    await page.getByRole('button', { name: 'ルームから抜ける' }).click();

    // Then その1: 作成者は玄関（`/`）へ移る。
    //             **告知を見る前に、玄関に着いたことを先に待つ。** timer のロビーには
    //             ステータス帯を含む `role="status"` が複数あるので、遷移前に告知を
    //             当てにいくと strict mode 違反で落ちる（負荷で実際に踏んだ）
    await expect
      .poll(() => new URL(page.url()).pathname, { message: '退出後の行き先のパス' })
      .toBe('/');

    // Then その2: 退出の告知を読み上げ可能な形で見る。
    //             文言は `departureNoticeFor('self')` と一字一句同じであることまで見る
    //             （`toContain` ではなく厳密一致 —— 部分一致だと「退出しました」との
    //             取り違えを見逃す）
    await expect(page.getByRole('status'), '玄関の退出告知').toHaveText('ルームから抜けました。');

    // Then その3: URL は玄関のルームを指したまま（`room=` は残り、`left=` は読み終えて落ちる）
    expect(new URL(page.url()).searchParams.get('room'), '退出後も運ばれるルームコード').toBe(
      code,
    );
    // **`replaceState` は描画後の effect で行われる**ので、同期的に読むと
    // 未反映のまま読んでしまう競合がある（実測）。出現待ちと同じく `.poll` で待つ
    await expect
      .poll(
        () => new URL(page.url()).searchParams.get('left'),
        { message: '読み終えた退出の印は URL から落ちている' },
      )
      .toBeNull();

    // Then その4: Bob の画面で、Bob が輪（ドライバー）の1番目へ繰り上がっている。
    //             以前はここが起きず、輪は空のまま取り残されていた
    await expect(
      lobbyRotationRow(guest.page, GUEST, 1),
      '見学者が輪の1番目へ繰り上がる',
    ).toHaveCount(1);
    await expect(
      guest.page.getByRole('button', { name: 'ドライバーに加わる' }),
      '繰り上がった後は「ドライバーに加わる」が残っていない',
    ).toHaveCount(0);
  });
});

/**
 * 別のツール・別のタブで外された人の全タブが、操作できる画面に取り残されない（#427・設計 A）。
 *
 * サーバーは外した人の**全接続**へ `REMOVED_FROM_ROOM` を送る。実画面で、timer から外された人の
 * poker は「参加者（0人）」の操作できる画面に、ハブは名簿の画面に取り残されていた。
 * 同じ人（同じ端末）の 5 つのタブを開き、どれも玄関で退出の告知を見て名乗り直せることを確かめる
 * （ルームは生きているので、行き先は作成画面ではなく参加画面である）。
 */
test.describe('timer で外された人の、ほかのツールとハブのタブ', () => {
  test('Given 外される人がハブ・poker・timer・topic・roulette を開いている / When 別の人が timer から外す / Then どのタブも玄関の参加画面で外された告知を見る', async ({
    page,
    openPeer,
  }) => {
    const code = await createRoom(page, HOST);

    // 外される人（Bob）。timer を開いた最初のタブのほかに、同じ端末（同じ文脈）でタブを足す。
    const bob = await openPeer('removed-bob');
    await joinViaHub(bob.page, code, GUEST);
    await expect(bob.page.getByRole('button', { name: 'ドライバーに加わる' })).toBeVisible();

    const tabs = {
      hub: await bob.page.context().newPage(),
      poker: await bob.page.context().newPage(),
      topic: await bob.page.context().newPage(),
      roulette: await bob.page.context().newPage(),
    };
    const q = `?room=${encodeURIComponent(code)}`;
    await tabs.hub.goto(`/${q}`);
    await tabs.poker.goto(`/poker/${q}`);
    await tabs.topic.goto(`/topic/${q}`);
    await tabs.roulette.goto(`/roulette/${q}`);
    // 開いたタブが「操作できる画面」であることを先に確かめる（外される前の対照）
    await expect(tabs.hub.getByRole('list', { name: 'ツール' })).toBeVisible();
    await expect(tabs.poker.getByRole('heading', { name: 'プランニングポーカー' })).toBeVisible();
    await expect(tabs.poker.getByRole('heading', { name: /参加者（1人）/ })).toBeVisible();
    await expect(tabs.topic.getByRole('heading', { level: 1, name: 'お題', exact: true })).toBeVisible();
    await expect(tabs.roulette.getByRole('heading', { level: 1, name: '進行役ルーレット', exact: true })).toBeVisible();

    // When: Alice が timer のロビーから Bob を外す
    await page.getByRole('button', { name: `${GUEST} を退出させる` }).click();
    await page.getByRole('button', { name: '退出させる', exact: true }).click();

    // Then: Bob の timer を含む 5 つのタブすべてが玄関の参加画面で、退出の告知を見る
    const all = { timer: bob.page, ...tabs };
    for (const [label, tab] of Object.entries(all)) {
      await expect
        .poll(() => new URL(tab.url()).pathname, { message: `${label} のタブの行き先のパス` })
        .toBe('/');
      await expect(tab.getByRole('status'), `${label} のタブの告知`).toHaveText(
        'ルームから退出しました。再参加するには名前を入力してください。',
      );
      await expect(tab.getByRole('button', { name: '参加する' }), `${label} のタブは名乗り直す参加画面`).toBeVisible();
    }
  });
});
