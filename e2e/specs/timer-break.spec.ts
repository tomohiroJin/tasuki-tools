/**
 * timer の休憩（#402）。タグは付けない（新しい E2E のタグは足さない）。
 *
 * 休憩に入ると全員の画面が覆われ、残り時間が止まる。終えると休憩に入る前の残りから再開する。
 */
import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures/test';
import { createRoom, joinAsDriver, lobbyRotationRow } from '../support/timer';

const HOST = 'e2e-a';
const GUEST = 'e2e-b';

/** ロビーの詳細設定を開き、休憩の条件を「経過時間」にする。 */
async function chooseElapsedBreak(page: Page): Promise<void> {
  await page.getByText('詳細設定').click();
  await page.getByRole('group', { name: '休憩の条件' }).getByRole('button', { name: '経過時間' }).click();
}

/** 「残り時間 m:ss」を秒にする。 */
function secondsOf(label: string | null): number {
  const match = /(\d+):(\d{2})/.exec(label ?? '');
  expect(match, `残り時間の aria-label を読めない（${label}）`).not.toBeNull();
  return Number(match![1]) * 60 + Number(match![2]);
}

/** 判定は必ず両方の文脈で行う。落ちたときにどちらの画面かが分かるよう名前を添える。 */
function screens(host: Page, guest: Page): readonly (readonly [string, Page])[] {
  return [
    ['作成者', host],
    ['参加者', guest],
  ] as const;
}

test.describe('timer の休憩は全員の画面で時計を止め、元の残りから再開する', () => {
  test('Given 経過時間の休憩を設定した 2 人のセッション / When 一人が休憩して終える / Then 両方が覆われ、残りが減らず、元の残りから走り出す', async ({
    page,
    openPeer,
  }) => {
    // Given
    const code = await createRoom(page, HOST);
    const guest = await openPeer('timer-guest');
    await joinAsDriver(guest.page, code, GUEST);
    await expect(lobbyRotationRow(page, GUEST, 2)).toHaveCount(1);
    await chooseElapsedBreak(page);
    // 詳細設定の開閉は画面ごとの状態なので、参加者の画面でも開いて、設定が届いたことを見る
    await guest.page.getByText('詳細設定').click();
    await expect(
      guest.page.getByRole('group', { name: '休憩の条件' }).getByRole('button', { name: '経過時間' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'セッションを開始' }).click();

    // When: 休憩する
    const before = await page.getByRole('timer').getAttribute('aria-label');
    await page.getByRole('button', { name: /休憩する/ }).click();

    // Then その1: 両方の画面が覆われ、覆いの下に残り時間が描かれていない
    for (const [label, target] of screens(page, guest.page)) {
      await expect(target.getByRole('dialog', { name: '休憩中' }), `${label}の画面`).toBeVisible();
      await expect(target.getByRole('timer'), `${label}の画面に残り時間が残っている`).toHaveCount(0);
    }

    // Then その2: 3 秒待って、休憩を終える。残りは休憩に入る前と一致する。
    // `waitForTimeout` を使うのは待ちの代わりではなく、**休憩中に時間が経っても残りが減らない**
    // ことを見るため（時間が経たないと、止まっていなくても緑になる）
    await page.waitForTimeout(3000);
    await guest.page.getByRole('button', { name: '休憩を終える' }).click();
    for (const [label, target] of screens(page, guest.page)) {
      await expect(target.getByRole('dialog', { name: '休憩中' }), `${label}の画面`).toHaveCount(0);
      await expect(target.getByRole('timer'), `${label}の画面`).toBeVisible();
    }
    const after = await page.getByRole('timer').getAttribute('aria-label');
    // -1 は「減っていない」の意味（休憩に入る前と終えた後の描画の差 1 秒まで）。
    // 止まっていなければ 3 秒以上減るので、この判定は赤になる
    expect(secondsOf(after) - secondsOf(before)).toBeGreaterThanOrEqual(-1);
  });

  test('Given 条件なしのルーム / When セッションを開く / Then 「休憩する」は出ない', async ({ page }) => {
    // Given
    await createRoom(page, HOST);

    // When
    await page.getByRole('button', { name: 'セッションを開始' }).click();
    await expect(page.getByRole('timer')).toBeVisible();

    // Then
    await expect(page.getByRole('button', { name: /休憩する/ })).toHaveCount(0);
  });

  test('Given 600px 幅の休憩ありのセッション / When 「休憩する」を見る / Then 他の要素に隠れず押せる', async ({ page }) => {
    // Given: 操作帯が折り返す幅（40rem 未満）
    await page.setViewportSize({ width: 600, height: 900 });
    await createRoom(page, HOST);
    await chooseElapsedBreak(page);
    await page.getByRole('button', { name: 'セッションを開始' }).click();
    const button = page.getByRole('button', { name: /休憩する/ });
    await expect(button).toBeVisible();

    // When / Then: ボタンの中心を突いて、当たるのがボタン自身（またはその中身）であること
    await button.scrollIntoViewIfNeeded();
    const hit = await button.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return top !== null && el.contains(top);
    });
    expect(hit, '「休憩する」が他の要素に隠れている').toBe(true);
    await button.click();
    await expect(page.getByRole('dialog', { name: '休憩中' })).toBeVisible();
  });
});
