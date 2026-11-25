/**
 * timer のランダム交代（#660）。タグは付けない（`local` 専用。3 人の輪を組む）。
 *
 * 交代のたびに次のドライバーがランダムに決まる。**画面の「次: 〈名前〉」に出た人と、実際に替わる人が、
 * 全員の画面で同じ**ことを見る。抽選の規則（1 周で全員が 1 回ずつ・続けて同じ人にしない）は単体が見る
 * （`packages/timer-core/test/random-rotation.test.ts`）。ここは実画面と実サーバーを通した経路を見る。
 */
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../fixtures/test';
import { createRoom, currentDriverRow, joinAsDriver, lobbyRotationRow } from '../support/timer';

const NAMES = ['e2e-a', 'e2e-b', 'e2e-c'] as const;

/** セッション画面の「次: 〈名前〉」の名前。 */
function nextName(target: Page): Locator {
  return target.locator('.session-next .session-next-name');
}

/** セッション画面の交代の帯で、その人の行に付いた「番が回らない理由」の印。 */
function skipReasonOf(target: Page, name: string): Locator {
  return target
    .locator('.rotation-lineup-row')
    .filter({ has: target.locator('.rotation-lineup-name', { hasText: name }) })
    .locator('.rotation-lineup-skip-reason');
}

test.describe('timer のランダム交代は、予告した人へ替わる', () => {
  test('Given 3 人の輪でランダム交代を選んだ / When 交代を繰り返す / Then 全員の画面で、予告した人が次の運転者になる', async ({
    page,
    openPeer,
  }) => {
    // Given: A が作り、B・C が輪に加わる。順番まで待つ（名前だけだと輪に入る前に開始してしまう）
    const code = await createRoom(page, NAMES[0]);
    const second = await openPeer('timer-random-b');
    await joinAsDriver(second.page, code, NAMES[1]);
    const third = await openPeer('timer-random-c');
    await joinAsDriver(third.page, code, NAMES[2]);
    await expect(lobbyRotationRow(page, NAMES[0], 1)).toHaveCount(1);
    await expect(lobbyRotationRow(page, NAMES[1], 2)).toHaveCount(1);
    await expect(lobbyRotationRow(page, NAMES[2], 3)).toHaveCount(1);

    // Given: 詳細設定でランダム交代を選ぶ。**他の人の画面に届いたことまで待つ**（届く前に開始すると輪の順で始まりうる）
    await page.locator('summary', { hasText: '詳細設定' }).click();
    //   チェックはサーバーの往復で変わるので、`check()`（その場で変わることを求める）ではなく押して待つ
    const randomToggle = page.getByRole('checkbox', { name: /交代先をランダムに決める/ });
    await randomToggle.click();
    await expect(randomToggle).toBeChecked();
    await third.page.locator('summary', { hasText: '詳細設定' }).click();
    await expect(third.page.getByRole('checkbox', { name: /交代先をランダムに決める/ })).toBeChecked();

    await page.getByRole('button', { name: 'セッションを開始' }).click();

    const all = [
      ['A', page],
      ['B', second.page],
      ['C', third.page],
    ] as const;

    /**
     * 全員の画面が `driver` を運転者として映すのを待ち、そこに出た予告（全員で同じ人）を返す。
     *
     * 交代の直後の古い画面は、予告に新しい運転者の名前を出している（予告した人へ替わるので）。
     * 「予告が運転者と違う名前になった」ことで、新しい snapshot を映したと分かる。
     *
     * **時計が走っていること（「一時停止」のボタンが出ている）も待つ。** 開始は `phase.set` → `START` の順に届き、
     * サーバーは START で引く順を作り直す。間の snapshot（セッション画面・時計は止まったまま）の予告は、
     * 開始のあとの予告と違う人になりうる。そこで読むと、画面ごとに違う予告を掴む。
     */
    async function forecastWhileDriving(driver: string): Promise<string> {
      const seen: string[] = [];
      for (const [label, target] of all) {
        await expect(target.getByRole('button', { name: '一時停止', exact: true }), `${label}の画面の時計が走っていない`).toBeVisible();
        await expect(currentDriverRow(target), `${label}の画面の運転者`).toHaveCount(1);
        await expect(currentDriverRow(target), `${label}の画面の運転者`).toContainText(driver);
        await expect(nextName(target), `${label}の画面の予告が運転者のまま`).not.toHaveText(driver);
        await expect(target.locator('.session-next-mode'), `${label}の画面にモードの名前が無い`).toHaveText('ランダム');
        seen.push((await nextName(target).innerText()).trim());
      }
      expect(new Set(seen).size, `画面ごとに予告が違う（${seen.join('・')}）`).toBe(1);
      expect(NAMES as readonly string[], `予告が輪の人でない（${seen[0]!}）`).toContain(seen[0]!);
      return seen[0]!;
    }

    // Then: 開始の運転者は A。予告した人へ替わることを、2 周ぶん（6 回）繰り返して見る
    const drivers: string[] = [NAMES[0]];
    let forecast = await forecastWhileDriving(NAMES[0]);
    for (let n = 0; n < 6; n++) {
      // 押す人は毎回変える（誰が押しても、サーバーが決めた同じ人へ替わる）
      await all[n % 3]![1].getByRole('button', { name: 'スキップ', exact: true }).click();
      drivers.push(forecast);
      forecast = await forecastWhileDriving(forecast);
    }

    // 同じ人が続けて運転していない
    drivers.forEach((name, i) => {
      if (i > 0) expect(name, `${String(i)} 回目の交代で同じ人が続いた`).not.toBe(drivers[i - 1]);
    });
    // 開始の運転者から 3 人ごとに区切った 1 周は、全員が 1 回ずつ
    for (const round of [drivers.slice(0, 3), drivers.slice(3, 6)]) {
      expect([...round].sort(), `1 周が全員の並べ替えでない（${round.join('・')}）`).toEqual([...NAMES].sort());
    }
  });

  test('Given 予告した人が一時離脱した / When 交代する / Then 全員の画面で予告が別の人へ移り、その人へ替わる', async ({
    page,
    openPeer,
  }) => {
    // Given: 3 人の輪でランダム交代を選んで開始する
    const code = await createRoom(page, NAMES[0]);
    const second = await openPeer('timer-random-repick-b');
    await joinAsDriver(second.page, code, NAMES[1]);
    const third = await openPeer('timer-random-repick-c');
    await joinAsDriver(third.page, code, NAMES[2]);
    await expect(lobbyRotationRow(page, NAMES[0], 1)).toHaveCount(1);
    await expect(lobbyRotationRow(page, NAMES[1], 2)).toHaveCount(1);
    await expect(lobbyRotationRow(page, NAMES[2], 3)).toHaveCount(1);
    await page.locator('summary', { hasText: '詳細設定' }).click();
    const randomToggle = page.getByRole('checkbox', { name: /交代先をランダムに決める/ });
    await randomToggle.click();
    await expect(randomToggle).toBeChecked();
    await third.page.locator('summary', { hasText: '詳細設定' }).click();
    await expect(third.page.getByRole('checkbox', { name: /交代先をランダムに決める/ })).toBeChecked();
    await page.getByRole('button', { name: 'セッションを開始' }).click();

    const pages = { [NAMES[0]]: page, [NAMES[1]]: second.page, [NAMES[2]]: third.page } as const;
    await expect(currentDriverRow(page)).toContainText(NAMES[0]);
    // 時計が走り出すまで待つ（開始の前の snapshot の予告は、開始で引く順を作り直すと変わりうる）
    await expect(page.getByRole('button', { name: '一時停止', exact: true })).toBeVisible();
    // 予告は B か C。出るまで待ってから読む
    await expect(nextName(page)).toHaveText(new RegExp(`^(${NAMES[1]}|${NAMES[2]})$`));
    const first = (await nextName(page).innerText()).trim() as (typeof NAMES)[1] | (typeof NAMES)[2];
    const other = first === NAMES[1] ? NAMES[2] : NAMES[1];

    // When: 予告された人が自分で一時離脱する
    await pages[first].getByRole('button', { name: '一時離脱', exact: true }).click();

    // Then その1: 全員の画面で、予告がもう 1 人へ移る
    for (const [name, target] of Object.entries(pages)) {
      await expect(skipReasonOf(target, first), `${name}の画面`).toHaveText('離脱中');
      await expect(nextName(target), `${name}の画面の予告`).toHaveText(other);
    }

    // When: 交代する
    await page.getByRole('button', { name: 'スキップ', exact: true }).click();

    // Then その2: 全員の画面で、移った先の人が運転者になる（一時離脱した人ではない）
    for (const [name, target] of Object.entries(pages)) {
      await expect(currentDriverRow(target), `${name}の画面`).toHaveCount(1);
      await expect(currentDriverRow(target), `${name}の画面`).toContainText(other);
    }
  });
});
