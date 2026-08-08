/**
 * timer のドライバー交代（@core #9）。
 *
 * **名前で判定してはいけない。** 名簿は役割に関係なく全員の名前を常時表示するので、
 * 「新ドライバーの名前が見えること」は交代がまったく起きていなくても最初から真になる。
 * 見るのは印そのものの位置と、それが両方の画面で同じに見えること。
 */
import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures/test';
import {
  createRoom,
  currentDriverRow,
  driverRoster,
  joinAsDriver,
  lobbyRotationRow,
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
      await expect(
        previous.getByRole('img', { name: '現在のドライバー' }),
        `${label}の画面で旧ドライバーの印が残っている`,
      ).toHaveCount(0);
    }
  });
});

/** 判定は必ず両方の文脈で行う。落ちたときにどちらの画面かが分かるよう名前を添える。 */
function screens(host: Page, guest: Page): readonly (readonly [string, Page])[] {
  return [
    ['作成者', host],
    ['参加者', guest],
  ] as const;
}
