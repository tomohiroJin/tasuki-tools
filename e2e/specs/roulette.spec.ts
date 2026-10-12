/**
 * 進行役ルーレット（#94 PR 2）。
 *
 * - `@core` — 全員の画面で同じ人に止まること。**本番にルーレットが入った後の `pnpm e2e:prod` が見る前提**で、
 *   配布の前の本番に当てると落ちる（`/roulette/` がまだ無い。`deploy/roulette/NOTES.md`）。
 *   タグは describe のタイトルの先頭に置く（`e2e/tests/spec-tags.test.ts`）。
 *
 * **ルームを作るのはこの 1 本だけ**（E2E 全件はルーム枠 100 にぎりぎり）。配信と転送の確認も同じ本の
 * 頭に入れて、本数もルームも増やさない。見た目・a11y の検査は PR 3 で既存のテストへ相乗りさせる。
 *
 * 入る人は 2 人だけにする。**2 人のときは当たりが必ず交互になる**（spec §5.1）ので、
 * サーバーが一周の規則で引いていることを、乱数に頼らず決定的に確かめられる。
 */
import { expect, test } from '../fixtures/test';
import { joinRouletteTool, openRouletteTool, roulettePhrase, spinButton } from '../support/roulette';

const NAME_A = 'e2e-roulette-a';
const NAME_B = 'e2e-roulette-b';
/** 回転の長さ（`SPIN_DURATION_MS`）。これを過ぎるまで、回している側の画面は結果を言わない。 */
const SPIN_MS = 4000;
const RESULT = /^次の進行役は (.+) さんです$/;

/**
 * @requirements #94 E7 E17 E19
 */
test.describe('@core ルーレットは全員の画面で同じ人に止まる', () => {
  test('Given 2 人が同じルームでルーレットを開く / When 3 回回す / Then 毎回同じ人に止まり、2 人なので X → Y → X と交互になる', async ({
    page,
    request,
    openPeer,
    consoleWatcher,
  }) => {
    // Given その0: 配信と転送（ブラウザを開く前に HTTP だけで確かめる。落ちたら Caddy 断片・base が壊れている）
    const served = await request.get('/roulette/');
    expect(served.status(), '/roulette/ の応答').toBe(200);
    const assetRefs = [...(await served.text()).matchAll(/(?:src|href)="([^"]+)"/g)]
      .map((m) => m[1] ?? '')
      .filter((ref) => ref.includes('/assets/'));
    //   玄関（包括フォールバック）が 200 で返っても、資材の接頭辞でルーレットの HTML だと分かる
    expect(assetRefs.length, '資材の参照が 1 つも無い（空振りの判定を避ける）').toBeGreaterThan(0);
    for (const ref of assetRefs) expect(ref.startsWith('/roulette/assets/'), ref).toBe(true);
    const redirected = await request.get('/roulette', { maxRedirects: 0 });
    expect(redirected.status()).toBe(301);
    expect(redirected.headers()['location']).toBe('/roulette/');

    // Given その1: A が玄関でルームを作ってルーレットを開き、B が別の文脈で招待 URL から入る。
    //   B は動きを減らす設定（回さずに結果を出す経路も同じテストで通す）
    const inviteUrl = await openRouletteTool(page, NAME_A);
    const peer = await openPeer('roulette-b');
    await peer.page.emulateMedia({ reducedMotion: 'reduce' });
    await joinRouletteTool(peer.page, inviteUrl, NAME_B);
    //   両方の画面に 2 人が揃うまで待つ（揃う前に回すと 1 人で「2 人から回せます」になる）
    await expect(page.getByRole('checkbox')).toHaveCount(2);
    await expect(peer.page.getByRole('checkbox')).toHaveCount(2);

    // When / Then: 3 回回す
    const winners: string[] = [];
    for (let round = 1; round <= 3; round += 1) {
      // A は前の回転が終わっていれば押せる（最初の回は回す前）
      await expect(spinButton(page)).toBeEnabled();
      await spinButton(page).click();

      // その1: B は動きを減らす設定なので、回転を待たず 1 秒以内に結果が出る
      await expect(roulettePhrase(peer.page), `${round} 回目: B の一言`).toHaveText(RESULT, { timeout: 1000 });
      const winnerOnB = RESULT.exec((await roulettePhrase(peer.page).textContent()) ?? '')?.[1];
      expect(winnerOnB, `${round} 回目: B に出た名前`).toBeTruthy();

      // その2: そのとき A は回している最中で、**当たりの名前をまだ言わない**
      await expect(roulettePhrase(page), `${round} 回目: A は回している最中`).toHaveText(`${NAME_A} さんが回しました`);
      await expect(spinButton(page)).toBeDisabled();

      // その3: 回転が終わると A も同じ人を言う（全員の画面で同じ席に止まる）
      await expect(roulettePhrase(page), `${round} 回目: A の結果`).toHaveText(RESULT, { timeout: SPIN_MS + 2000 });
      const winnerOnA = RESULT.exec((await roulettePhrase(page).textContent()) ?? '')?.[1];
      expect(winnerOnA, `${round} 回目: A と B で同じ人`).toBe(winnerOnB);
      winners.push(winnerOnA ?? '');
    }

    // Then: 入る人は A と B の 2 人。一周の規則で、当たりは交互（X → Y → X）
    expect([NAME_A, NAME_B]).toContain(winners[0]);
    expect(winners[1]).not.toBe(winners[0]);
    expect([NAME_A, NAME_B]).toContain(winners[1]);
    expect(winners[2]).toBe(winners[0]);

    // どの画面も例外を出していない
    expect(consoleWatcher.errors).toEqual([]);
    expect(peer.console.errors).toEqual([]);
  });
});
