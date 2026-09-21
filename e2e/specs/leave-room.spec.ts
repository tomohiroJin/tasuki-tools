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

    // Then その1: 作成者は玄関（`/`）へ移り、退出の告知を読み上げ可能な形で見る。
    //             文言は `departureNoticeFor('self')` と一字一句同じであることまで見る
    //             （`toContain` ではなく厳密一致 —— 部分一致だと「退出しました」との
    //             取り違えを見逃す）
    await expect(page.getByRole('status'), '玄関の退出告知').toHaveText('ルームから抜けました。');

    // Then その2: URL は玄関のルームを指したまま（`room=` は残り、`left=` は読み終えて落ちる）
    await expect
      .poll(() => new URL(page.url()).pathname, { message: '退出後の行き先のパス' })
      .toBe('/');
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

    // Then その3: Bob の画面で、Bob が輪（ドライバー）の1番目へ繰り上がっている。
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
