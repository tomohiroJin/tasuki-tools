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

/** ロビーの詳細設定を開き、休憩の条件を「周回」「1周」「知らせるだけ」にする。 */
async function chooseSuggestEveryRound(page: Page): Promise<void> {
  await page.getByText('詳細設定').click();
  await page.getByRole('group', { name: '休憩の条件' }).getByRole('button', { name: '周回' }).click();
  await page.getByRole('group', { name: '休憩の間隔' }).getByRole('button', { name: '1周', exact: true }).click();
  await page.getByRole('group', { name: '入り方' }).getByRole('button', { name: '知らせるだけ' }).click();
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

  test('Given 600px 幅で「知らせるだけ」の帯が出ている / When 下へスクロールして操作帯の「休憩する」を上端へ寄せて見せる / Then 帯は上端に留まり、「休憩する」は帯にも他の要素にも隠れない', async ({
    page,
    openPeer,
  }) => {
    // Given: 操作帯が折り返す幅（40rem 未満）。周回 1 周・知らせるだけ・2 人なので、スキップ 2 回で帯が出る
    await page.setViewportSize({ width: 600, height: 900 });
    const code = await createRoom(page, HOST);
    const guest = await openPeer('timer-guest');
    await joinAsDriver(guest.page, code, GUEST);
    await expect(lobbyRotationRow(page, GUEST, 2)).toHaveCount(1);
    await chooseSuggestEveryRound(page);
    await page.getByRole('button', { name: 'セッションを開始' }).click();
    for (let i = 0; i < 2; i++) {
      await page.getByRole('button', { name: 'スキップ', exact: true }).click();
    }
    const band = page.getByRole('status').filter({ hasText: '休憩の時間です' });
    await expect(band).toBeVisible();

    // When: ページの下端までスクロールしてから、操作帯の「休憩する」へフォーカスを送る（Tab で辿るのと同じ送り方）
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const scrolled = await page.evaluate(() => window.scrollY);
    expect(scrolled, 'ページがスクロールしない（帯が留まるかを測れない）').toBeGreaterThan(0);
    const bandTop = await band.evaluate((el) => el.getBoundingClientRect().top);
    // 帯が上端に留まる（流れの中の要素ならスクロールで画面外＝負の位置へ出る）
    expect(bandTop, '帯がスクロールで画面の外へ出た').toBeGreaterThanOrEqual(0);
    expect(bandTop).toBeLessThan(1);
    const button = page.locator('.session-actions').getByRole('button', { name: /休憩する/ });
    // ボタンが画面の上へ外れる所までスクロールし直し、上端へ寄せて見せる（`block: 'nearest'`）。
    // Chromium はフォーカスで送ると中央へ寄せるので帯に当たらないが、Firefox・Safari は最寄りの端へ寄せる。
    // その送り方を `scrollIntoView` で再現する。帯の高さぶんの上の余白（scroll-padding）が無いと、
    // ボタンは留まった帯の下に入る
    await button.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      window.scrollTo(0, window.scrollY + rect.bottom + 200);
    });
    expect(await button.evaluate((el) => el.getBoundingClientRect().bottom), 'ボタンが画面の上へ外れていない').toBeLessThan(0);
    await button.evaluate((el) => el.scrollIntoView({ block: 'nearest' }));
    await button.focus();

    // Then: ボタンの中心を突いて、当たるのがボタン自身（またはその中身）であること
    const hit = await button.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return { inside: top !== null && el.contains(top), what: top?.className ?? null };
    });
    expect(hit.inside, `「休憩する」が他の要素（${hit.what}）に隠れている`).toBe(true);
    await button.click();
    await expect(page.getByRole('dialog', { name: '休憩中' })).toBeVisible();
  });

  test('Given 600px 幅の 2 人のセッション / When 一人が下へスクロールした画面で休憩に入る / Then もう一人の画面で接続状態と知らせが覆いより前に読め、覆いの見出しと重ならない', async ({
    page,
    openPeer,
  }) => {
    // Given
    await page.setViewportSize({ width: 600, height: 900 });
    const code = await createRoom(page, HOST);
    const guest = await openPeer('timer-guest');
    await guest.page.setViewportSize({ width: 600, height: 900 });
    await joinAsDriver(guest.page, code, GUEST);
    await expect(lobbyRotationRow(page, GUEST, 2)).toHaveCount(1);
    await chooseElapsedBreak(page);
    await page.getByRole('button', { name: 'セッションを開始' }).click();
    await expect(guest.page.getByRole('timer')).toBeVisible();
    // 下へスクロールしていても、上端の接続状態は覆いの上に出ていること
    await guest.page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));

    // When
    await page.getByRole('button', { name: /休憩する/ }).first().click();

    // Then: 覆いが出て、接続状態の帯と知らせ（バナー）がその上に描かれている
    await expect(guest.page.getByRole('dialog', { name: '休憩中' })).toBeVisible();
    const notice = guest.page.locator('.app-banner').filter({ hasText: '休憩を始めました' });
    await expect(notice).toBeVisible();
    const report = await guest.page.evaluate(() => {
      const hitsSelf = (el: Element | null): boolean => {
        if (el === null) return false;
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return top !== null && el.contains(top);
      };
      const connection = document.querySelector('[aria-label="接続状態"]');
      const banner = document.querySelector('.app-banner');
      const heading = document.querySelector('#break-overlay-heading');
      const covered = [connection, banner].map((el) => el?.getBoundingClientRect().bottom ?? Infinity);
      return {
        connection: hitsSelf(connection),
        connectionInView: (connection?.getBoundingClientRect().top ?? -1) >= 0,
        banner: hitsSelf(banner),
        heading: hitsSelf(heading),
        topsBottom: Math.max(...covered),
        headingTop: heading?.getBoundingClientRect().top ?? -1,
        overlayBackground: getComputedStyle(document.querySelector('.break-overlay')!).backgroundColor,
      };
    });
    expect(report.connectionInView, '接続状態が画面の外にある').toBe(true);
    expect(report.connection, '接続状態が覆いに隠れている').toBe(true);
    expect(report.banner, '知らせが覆いに隠れている').toBe(true);
    expect(report.heading, '覆いの見出しが上の帯に隠れている').toBe(true);
    expect(report.headingTop, '覆いの見出しが上の帯と重なる').toBeGreaterThanOrEqual(report.topsBottom);
    // 覆いの地は不透明（背後の盤面が透けない）。α を持つ色は `rgba(…, α)` / `color(… / α)` の形で返る
    expect(report.overlayBackground, '覆いの地が半透明').not.toMatch(/rgba\(|\/\s*0?\.\d/);
  });

  // 狭い幅では上端の帯（接続状態＋知らせ）が折り返して高くなる。覆いの上の空きが帯より低いと、見出しが帯の下に入る
  // （PR #416 のレビュー）。知らせのバナーが出ている間に、見出しと「休憩を終える」が自分自身に当たるかを測る。
  const LONG_HOST = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりる'; // 40 字（表示名の上限）。バナーが 320px 幅で 3 行に折り返す（#427）
  for (const [label, hostName] of [['短い名前', HOST], ['40 字の長い名前', LONG_HOST]] as const) {
    test(`Given 320px 幅の 2 人のセッション（ホストは${label}） / When 一人が休憩に入り、知らせが出ている / Then もう一人の画面で覆いの見出しと「休憩を終える」が上端の帯に隠れない`, async ({
      page,
      openPeer,
    }) => {
      // Given
      const code = await createRoom(page, hostName);
      const guest = await openPeer('timer-guest');
      await guest.page.setViewportSize({ width: 320, height: 568 });
      await joinAsDriver(guest.page, code, GUEST);
      await expect(lobbyRotationRow(page, GUEST, 2)).toHaveCount(1);
      await chooseElapsedBreak(page);
      await page.getByRole('button', { name: 'セッションを開始' }).click();
      await expect(guest.page.getByRole('timer')).toBeVisible();

      // When
      await page.getByRole('button', { name: /休憩する/ }).first().click();

      // Then
      const dialog = guest.page.getByRole('dialog', { name: '休憩中' });
      await expect(dialog).toBeVisible();
      await expect(guest.page.locator('.app-banner').filter({ hasText: '休憩を始めました' })).toBeVisible();
      // 見出しは覆いが開いたときの位置で測る（初期フォーカスが置かれる所）
      const measure = (selector: string) =>
        guest.page.evaluate((sel) => {
          const el = document.querySelector(sel);
          const bar = document.querySelector('.app-top')?.getBoundingClientRect().bottom ?? Infinity;
          if (el === null) return { hit: false, what: 'not found', top: -1, bar };
          const r = el.getBoundingClientRect();
          const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return { hit: top !== null && el.contains(top), what: top?.className ?? null, top: r.top, bar };
        }, selector);
      const heading = await measure('#break-overlay-heading');
      expect(heading.hit, `覆いの見出しが他の要素（${heading.what}）に隠れている`).toBe(true);
      expect(heading.top, '覆いの見出しが上端の帯と重なる').toBeGreaterThanOrEqual(heading.bar);
      // 「休憩を終える」は覆いの中でスクロールして見せる（Tab で辿ったときと同じく最寄りの端へ寄せる）
      const end = dialog.getByRole('button', { name: '休憩を終える' });
      await end.evaluate((el) => {
        el.setAttribute('data-e2e-end', '');
        el.scrollIntoView({ block: 'nearest' });
      });
      const endHit = await measure('[data-e2e-end]');
      expect(endHit.hit, `「休憩を終える」が他の要素（${endHit.what}）に隠れている`).toBe(true);
    });
  }
});
