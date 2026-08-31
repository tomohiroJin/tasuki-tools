/**
 * poker のシナリオ。
 *
 * - `@core #8` — 秘匿と自動公開。**DOM だけでは足りない。** サーバーが投票中に
 *   他人の票を余剰フィールドで配信しても、UI がそれを参照しないので DOM には
 *   絶対に現れない。受信した WebSocket フレームも見る。
 * - タグ無し #13 — #76 J-1 の回帰防止（`local` 専用）。
 * - タグ無し #212 — 契約に合わない `room-state` を捨てたことの表出（`local` 専用。
 *   実ルームの枠を使ううえ、壊れたフレームは本番では作れない）。
 */
import { expect, test } from '../fixtures/test';
import type { Page } from '@playwright/test';
import {
  chooseCard,
  corruptRoomStateFrame,
  createRoom,
  joinRoom,
  participantRow,
  resultRow,
  resultsSection,
  roomStateFrames,
  showsVoted,
} from '../support/poker';
import {
  collectCards,
  describeCards,
  parseFrames,
  watchWebSocketFrames,
} from '../support/ws-frames';

const HOST = 'e2e-a';
const GUEST = 'e2e-b';

test.describe('@core poker は公開まで他人の票を配らない', () => {
  test('Given 2 人が同じルームに居る / When 片方が投票する / Then 値はどこにも届かず、全員が投票すると公開される', async ({
    page,
    openPeer,
  }) => {
    // Given: フレームの監視は最初の goto より前に始める（初回の room-state を取り逃さない）
    const frames = watchWebSocketFrames(page);

    const roomUrl = await createRoom(page, HOST);
    const guest = await openPeer('poker-guest');
    await joinRoom(guest.page, roomUrl, GUEST);

    // Given の確認: **2 人が別人として並んでいること。**
    // 同じ文脈で 2 枚開くと 2 人目が 1 人目として復帰し、
    // 「2 人居るつもりで 1 人」のまま以降がすべて緑になる
    await expect(page.getByRole('heading', { name: `参加者（2人）` })).toBeVisible();
    await expect(participantRow(page, HOST)).toHaveCount(1);
    await expect(participantRow(page, GUEST)).toHaveCount(1);

    // When: **2 人目に先に投票させる。** 自分が先に投票すると、相手が投票した瞬間に
    //       自動公開が走るため、「他人が投票済みで、まだ公開されていない」フレームが
    //       一度も届かない。それでは秘匿の検査対象が存在しなくなる
    await chooseCard(guest.page, '☕');

    // Then その1（DOM・範囲を限定して）: 投票済みであることは見えるが、値は見えない
    const guestRow = participantRow(page, GUEST);
    await expect(guestRow.getByRole('img', { name: '投票済み' })).toBeVisible();
    await expect(guestRow).not.toContainText('☕');

    // Then その2（DOM）: 結果セクションはまだ存在しない（非表示ではなく未描画）
    await expect(resultsSection(page)).toHaveCount(0);

    // Then その3（WS）: ここまでに届いたフレームを固定して調べる
    const received = [...frames.payloads];
    const parsed = parseFrames(received);
    const roomStates = roomStateFrames(received);

    // 走査先を間違えていないこと。0 通だと以降がすべて素通りする
    expect(roomStates.length, 'room-state を 1 通も受け取っていない').toBeGreaterThan(0);
    // すべて公開前であること。ここに revealed が混ざっていたら前提が崩れている
    expect(
      roomStates.map((frame) => frame.round.status).filter((status) => status !== 'voting'),
      '公開前のはずのフレームに revealed が混ざっている',
    ).toEqual([]);
    // **相手が投票済みのフレームを実際に受け取っていること。**
    // これが 0 通なら「他人の票が届いていない」は何も証明していない
    expect(
      roomStates.filter((frame) => showsVoted(frame, GUEST)).length,
      `${GUEST} が投票済みのフレームを 1 通も受け取っていない`,
    ).toBeGreaterThan(0);

    // **カードの走査は room-state に絞ってはいけない。**
    // 絞ると、サーバーが別メッセージ（クライアントが境界検証で捨てる型）で票を
    // 余分に配っても、こちらが自分でふるい落として緑になる。実際にそれで
    // 変異が素通りした。**届いたフレームは全部見る。**
    expect(parsed.length, 'JSON として読めないフレームがあり走査から漏れている').toBe(
      received.length,
    );
    for (const frame of parsed) {
      expect(describeCards(collectCards(frame)), '公開前のフレームにカードが含まれている').toBe('');
    }

    // When: 最後の 1 人が投票する
    await chooseCard(page, '5');

    // Then その4: **誰も公開操作をしていないのに**両方の画面に結果が出る。
    //             公開が実際に働くことまで見ないと、「常に何も配らない」実装でも
    //             上の秘匿の検査は緑のままになる
    for (const [label, target] of [
      ['作成者', page],
      ['参加者', guest.page],
    ] as const) {
      await expect(resultRow(target, HOST), `${label}の画面`).toContainText('5');
      await expect(resultRow(target, GUEST), `${label}の画面`).toContainText('☕');
    }
  });
});

/**
 * 消えたルームの招待リンクが行き止まりにならないこと（#13・#76 J-1 の回帰防止）。
 *
 * 壊れていた頃は、終了したルームのリンクでも参加フォームが出て、
 * **名前を入れて送信して初めて**「見つかりません」に変わった。
 * いまは参加を試みる前にルームの生死を尋ねる（`RoomPage.tsx:96-101` の `check-room`）。
 *
 * ルームは最後の参加者の接続が切れた瞬間に消える（`rooms.ts` の `dropIfEmpty`）。
 * `check-room` を送っただけの訪問者は参加者ではないので、この数に入らない。
 */
test.describe('poker の消えたルームのリンクが行き止まりにならない', () => {
  test('Given 招待リンクを受け取った人 / When ルームが消える / Then 名前を入れる前に、戻る道つきで知らされる', async ({
    page,
    openPeer,
  }) => {
    // Given: 作成者がルームを作る
    const owner = await openPeer('poker-owner');
    const roomUrl = await createRoom(owner.page, 'e2e-owner');

    // Given の確認: **生きている間は、同じリンクから実際に参加できる。**
    // 「参加フォームが出る」だけでなく参加の成立まで見るのは、下の判定を
    // 空振りさせないため。**同じ選択子（`参加する`）がここで実際に働いた**ことが、
    // あとで「参加フォームが出ない」と言える根拠になる
    const visitor = await openPeer('poker-visitor');
    await joinRoom(visitor.page, roomUrl, 'e2e-visitor');
    await expect(participantRow(visitor.page, 'e2e-owner'), '生きているルームの名簿').toHaveCount(
      1,
    );

    // When: 全員が居なくなり、ルームが消える（最後の接続が切れた瞬間に破棄される）
    await owner.page.close();
    await visitor.page.close();

    // Then その1: 後から同じリンクを開いた人は、**名前を入れる前に**消滅を知らされる。
    //             サーバーが close を処理し終える時点は制御できないので、
    //             固定時間で待たずに「そうなること」を条件にして開き直す
    const joinButton = page.getByRole('button', { name: '参加する' });
    const gone = page.getByRole('heading', { name: 'ルームが見つかりません' });
    await expect(async () => {
      await page.goto(roomUrl);
      await expect(gone).toBeVisible({ timeout: 2_000 });
    }, 'ルームが消えたことが画面に出る').toPass({ timeout: 20_000 });

    // Then その2: **戻る道がある。** これが無いと行き止まりになる
    await expect(page.getByRole('link', { name: 'トップへ戻る' }), '戻る導線').toBeVisible();

    // Then その3: 参加フォームは出ない（名前を入れさせてから落胆させない）
    await expect(joinButton, '消えたルームで参加フォームが出ている').toHaveCount(0);
  });
});


test.describe('契約に合わない room-state を捨てたことが画面から分かる', () => {
  /**
   * その接続に届く `room-state` を、指定の間だけ壊れた形へ差し替える。
   *
   * **実際に壊せた回数を数えて返す。** 契約やフレームの形が変わって
   * `corruptRoomStateFrame` が素通しへ退化すると、症状は「告知が出ない」という
   * 原因の読めない失敗になる。**壊せていないことを、壊せていないと言えるようにする。**
   */
  async function corruptFrom(
    page: Page,
    corrupting: () => boolean,
  ): Promise<{ count: () => number }> {
    let corrupted = 0;
    await page.routeWebSocket(/\/poker\/ws$/, (ws) => {
      const server = ws.connectToServer();
      ws.onMessage((message) => server.send(message));
      server.onMessage((message) => {
        const payload = typeof message === 'string' ? message : message.toString();
        const next = corrupting() ? corruptRoomStateFrame(payload) : payload;
        if (next !== payload) corrupted += 1;
        ws.send(next);
      });
    });
    return { count: () => corrupted };
  }

  /**
   * **`room-state` を捨てると画面は生きて見えたまま古い状態で固まる。**
   * 再接続もエラー表示も起きないので、利用者には「なぜか更新されない」としか分からない。
   *
   * **固まっていることを、実際に固まらせて確かめる。** 2 人目の参加は `room-state`
   * でしか届かないので、捨てている側の名簿には現れない。2 人目自身の画面で
   * 「参加は成立した」ことを確かめ、**参加が失敗しただけ**という別の説明を排除する。
   */
  test('Given ルームに居る / When 契約に合わない room-state が届く / Then 同期できていないと出て、名簿は古いまま固まる', async ({
    page,
    openPeer,
  }) => {
    // Given: 途中から room-state だけを壊せるようにしてから開く。
    // **最初から壊すとルームが一度も表示されない。** それは別の壊れ方である
    let corrupting = false;
    const corrupter = await corruptFrom(page, () => corrupting);

    const roomUrl = await createRoom(page, HOST);
    await expect(page.getByRole('heading', { name: '参加者（1人）' })).toBeVisible();
    await expect(page.getByText(/同期できていません/)).toHaveCount(0);

    // When: 以後の room-state が契約に合わなくなり、その状態で 2 人目が参加する
    corrupting = true;
    const guest = await openPeer('poker-stale-guest');
    await joinRoom(guest.page, roomUrl, GUEST);

    // Then その1: 参加そのものは成立している（2 人目の画面には 2 人が並ぶ）
    await expect(
      guest.page.getByRole('heading', { name: '参加者（2人）' }),
      '2 人目の画面の名簿',
    ).toBeVisible();

    // Then その2: 捨てている側は、それが画面から分かる
    await expect(page.getByText(/同期できていません/)).toBeVisible();

    // Then その3: **名簿は古いまま固まっている。** 描かれてはいるのに 1 人のまま
    await expect(page.getByRole('heading', { name: '参加者（1人）' })).toBeVisible();

    // Then その4: 壊し屋が実際に働いた。0 件ならここまでの判定は
    // 「まだ届いていない」と区別がつかない
    expect(corrupter.count(), '壊した room-state の数').toBeGreaterThan(0);
  });
});
