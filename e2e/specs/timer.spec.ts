/**
 * timer のシナリオ。
 *
 * - `@core #9` — ドライバー交代。**名前で判定してはいけない。** 名簿は役割に関係なく
 *   全員の名前を常時表示するので、「新ドライバーの名前が見えること」は交代がまったく
 *   起きていなくても最初から真になる。見るのは印そのものの位置と、それが両方の画面で
 *   同じに見えること。
 * - タグ無し #11 / #12 — #76 F-1 / F-3 の回帰防止（`local` 専用）。
 */
import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures/test';
import {
  createRoom,
  currentDriverRow,
  driverRoster,
  invitedUrlText,
  joinAsDriver,
  joinAsDriverAt,
  lobbyRotationRow,
  statusStrip,
} from '../support/timer';

const HOST = 'e2e-a';
const GUEST = 'e2e-b';

test.describe('@core timer のドライバー交代が両方の画面に届く', () => {
  test('Given 2 人が交代の輪に居る / When スキップする / Then 印が新ドライバーへ移り、旧ドライバーから消える', async ({
    page,
    openPeer,
  }) => {
    // Given: 作成者と、招待リンクから来た 2 人目
    const code = await createRoom(page, HOST);
    const guest = await openPeer('timer-guest');
    await joinAsDriver(guest.page, code, GUEST);

    // Given の確認: **2 人が別人として、交代の輪に順番付きで並んでいること。**
    // 名前だけで待つと、輪に入る前に開始してしまい 1 人だけの輪になる
    await expect(lobbyRotationRow(page, HOST, 1)).toHaveCount(1);
    await expect(lobbyRotationRow(page, GUEST, 2)).toHaveCount(1);

    await page.getByRole('button', { name: 'セッションを開始' }).click();

    // Then その1: 交代前は作成者が現ドライバー。**両方の画面で**同じに見える
    for (const [label, target] of screens(page, guest.page)) {
      await expect(currentDriverRow(target), `${label}の画面`).toHaveCount(1);
      await expect(currentDriverRow(target), `${label}の画面`).toContainText(HOST);
    }

    // When: 交代する
    await page.getByRole('button', { name: 'スキップ', exact: true }).click();

    // Then その2: 印が 2 人目の行へ移り、作成者の行からは消えている
    for (const [label, target] of screens(page, guest.page)) {
      // 印が付いた行はちょうど 1 つ。2 人が同時にドライバー表示になる分裂を排除する
      await expect(currentDriverRow(target), `${label}の画面`).toHaveCount(1);
      await expect(currentDriverRow(target), `${label}の画面`).toContainText(GUEST);
      // 旧ドライバーの行から消えていること。行を名前で特定したうえで、
      // 印が無いことだけを見る（名前が見えるかどうかは判定に使わない）
      const previous = driverRoster(target).getByRole('listitem').filter({ hasText: HOST });
      // **先に行そのものが在ることを固定する。** これが無いと、旧ドライバーの行が
      // 名簿から丸ごと消えたときに子要素も 0 件になり、下の否定が
      // 「印が無い」ではなく「行が無い」で素通りする（実測で確認した）
      await expect(previous, `${label}の画面に旧ドライバーの行が無い`).toHaveCount(1);
      await expect(
        previous.getByRole('img', { name: '現在のドライバー' }),
        `${label}の画面で旧ドライバーの印が残っている`,
      ).toHaveCount(0);
    }
  });
});

/**
 * 招待パネルに出た URL でそのまま参加できること（#11・#76 F-1 の回帰防止）。
 *
 * **「開いて参加できた」だけでは F-1 の再発を検出できない。**
 * `deploy/timer/caddy/40-timer-legacy-room.conf` が旧共有リンクを救済しており、
 * 壊れた形（`/?room=CODE`）でも 301 で `/timer/?room=CODE` へ送られてしまう。
 * つまり参加は成立し、判定は緑になる。**表示された URL の pathname そのものを
 * 固定して初めて、この壊れ方を捕まえられる。**
 *
 * 救済の 301 は古いリンクのための保険であって、いま配る招待 URL が頼るもの
 * ではない（`apps/timer-web/src/ui/room-url.ts` の冒頭コメント）。
 */
test.describe('招待パネルに表示された URL でそのまま参加できる', () => {
  test('Given ルームの作成者 / When 画面に出た URL を 2 人目が開く / Then 玄関ではなく timer に着き、参加できる', async ({
    page,
    openPeer,
  }) => {
    // Given: 作成者がルームを作り、招待パネルが出ている
    await createRoom(page, HOST);

    // When: **画面に表示されている URL 文字列を読む。**
    //       `page.url()` を使うと、生成が壊れていても自分の居場所が返るだけで緑になる
    const shown = invitedUrlText(page);
    await expect(shown, '招待パネルの参加 URL').toHaveCount(1);
    const invited = (await shown.innerText()).trim();

    // Then その1: **公開パスの上を指していること。**
    //             ここが `/` だと F-1 の再発だが、旧リンク救済の 301 に隠されて
    //             下の参加は成功してしまう。文字列そのものを見るのはこの 1 行だけで足りる
    expect(new URL(invited).pathname, `招待 URL の公開パス（${invited}）`).toBe('/timer/');

    // Then その2: その URL をそのまま開いて、実際に参加できる
    const guest = await openPeer('timer-invited');
    await joinAsDriverAt(guest.page, invited, GUEST);

    // Then その3: **2 人が別人として輪に並ぶ。** 同じ人が二重に見えているだけ、を排除する
    await expect(lobbyRotationRow(page, HOST, 1), '作成者の画面の 1 番目').toHaveCount(1);
    await expect(lobbyRotationRow(page, GUEST, 2), '作成者の画面の 2 番目').toHaveCount(1);
  });
});

/**
 * 再読込しても参加画面に戻らないこと（#12・#76 F-3 の回帰防止）。
 *
 * **作成者で試してはいけない。** 壊れ方は「復帰時に `participantId` が立たず、
 * `StatusStrip` が作成者へ縮退する」というもので（`App.tsx:686-687` の
 * `self?.displayName ?? room?.config.members[0]` / `self?.role ?? "host"`）、
 * 作成者自身で試すと縮退先と正解が一致してしまい、壊れていても緑になる。
 * **他人の名前と役割を見せられていた**のが F-3 の実害なので、2 人目で検証する。
 */
test.describe('timer を再読込しても参加画面に戻らない', () => {
  test('Given 参加済みの 2 人目 / When 再読込する / Then 参加画面に戻らず、自分の名前と役割が保たれる', async ({
    page,
    openPeer,
  }) => {
    // Given: 作成者のルームに 2 人目が参加している
    const code = await createRoom(page, HOST);
    const guest = await openPeer('timer-reload');
    await joinAsDriver(guest.page, code, GUEST);

    // Given の確認: 2 人目の画面に、2 人目自身として表示が出ている。
    // ここを固定しておくことで、下の判定が「最初からそう見えていただけ」ではなく
    // **再読込を越えて保たれた**ことの確認になる
    const strip = statusStrip(guest.page);
    await expect(strip, '2 人目のステータス表示').toHaveCount(1);
    await expect(strip).toContainText(GUEST);

    // When: 同じ page で再読込する。**新しい文脈を作ってはいけない。**
    //       復帰情報は sessionStorage にあり、文脈を変えると検証の意味が変わる
    await guest.page.reload();

    // Then その1: **参加画面に戻っていない。**
    //             ステータス表示は `mode` が `join` / `setup` のときは描画されないので
    //             （`App.tsx:819`）、見えていること自体が参加画面でない証拠になる。
    //             「参加ボタンが無い」という否定より、こちらのほうが空振りしない
    await expect(strip, '再読込後のステータス表示').toBeVisible();

    // Then その2: 自分の名前と役割が保たれている
    await expect(strip, '再読込後の表示名').toContainText(GUEST);
    await expect(strip, '再読込後の役割').toContainText('編集者');

    // Then その3: **作成者へ縮退していない。**
    //             否定は役割ラベルに当てる。名前で否定するとルームコードに
    //             作成者名が含まれる構成（ルーム名を付けた場合）で誤検出しうる
    await expect(strip, '作成者の役割へ縮退している').not.toContainText('ホスト');
  });
});

/** 判定は必ず両方の文脈で行う。落ちたときにどちらの画面かが分かるよう名前を添える。 */
function screens(host: Page, guest: Page): readonly (readonly [string, Page])[] {
  return [
    ['作成者', host],
    ['参加者', guest],
  ] as const;
}
