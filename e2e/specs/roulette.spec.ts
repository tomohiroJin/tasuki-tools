/**
 * 進行役ルーレット（#94 PR 2）。
 *
 * - `@core` — 全員の画面で同じ人に止まること。**本番にルーレットが入った後の `pnpm e2e:prod` が見る前提**で、
 *   配布の前の本番に当てると落ちる（`/roulette/` がまだ無い。`deploy/roulette/NOTES.md`）。
 *   タグは describe のタイトルの先頭に置く（`e2e/tests/spec-tags.test.ts`）。
 *
 * **ルームを作るのはこの 1 本だけ**（E2E 全件はルーム枠 100 にぎりぎり）。配信と転送の確認も同じ本の
 * 頭に入れて、本数もルームも増やさない。見た目・a11y の検査（PR 3）も同じ本の終わりに足した
 * （止まった後の文字の読みやすさ・書体・円盤の席の名前・フォーカス・名前の欄）。幅ごとの当たりと
 * 札の隠れは `buttons.spec.ts` のお題ツールの本（同じルーム）に足した。
 *
 * 入る人は 2 人だけにする。**2 人のときは当たりが必ず交互になる**（spec §5.1）ので、
 * サーバーが一周の規則で引いていることを、乱数に頼らず決定的に確かめられる。交互を確かめた後で
 * 欧文の名前を 2 つ足し（4 席）、席の名前の字が倒れていないことを幅と席数を変えて見る（spec §6.3）。
 */
import { expect, test } from '../fixtures/test';
import { expectFieldsAtLeast16px, expectFocusVisibleOnTab, expectReadable, pairKey, resolveColors, scanContrast } from '../support/a11y';
import {
  addRouletteGuest,
  expectWheelGlyphsUpright,
  expectWheelLabelsReadable,
  joinRouletteTool,
  openRouletteTool,
  roulettePhrase,
  spinButton,
} from '../support/roulette';

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
    // 取りにいった書体を記録する（常用の層の外を引いていないことを、止まった後に見る）
    const fonts: string[] = [];
    page.on('request', (request) => {
      if (request.url().endsWith('.woff2')) fonts.push(request.url().split('/').pop() ?? request.url());
    });

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

    // Then 見た目と a11y（3 回目が止まった後の A の画面。幅は既定の 1280 で、横並びになる）
    //   文字が読める。余裕の薄い組として、札の上の炭の字（`--coal` on 象牙の札）を測ったことも固定する。
    //   札の面と円盤の席の名前は `scanContrast` の対象（button / a / h1〜h3 / label / p / span）の外にあるものがあるので、
    //   円盤の席の名前は別に測る（`expectWheelLabelsReadable`）
    const [coal, sheen, shade] = await resolveColors(page, ['--coal', '--card-sheen', '--card-shade']);
    expectReadable(await scanContrast(page, 10), 8, [pairKey(coal!, `rgba(0, 0, 0, 0) + linear-gradient(160deg, ${sheen}, ${shade})`)]);
    await expectWheelLabelsReadable(page, 2);
    //   書体: 取りにいったものが常用の層だけで、読めている（URL を数えるだけでは全滅を緑と判定した・#297）
    expect(fonts.length, `書体を 1 つも取っていない（${fonts.join(', ')}）`).toBeGreaterThan(0);
    expect(fonts.filter((f) => f.includes('-ext-') || f.includes('-ext.')), '常用の層に無い字が画面に出ている').toEqual([]);
    const faces = await page.evaluate(async () => {
      await document.fonts.ready;
      return Array.from(document.fonts)
        .filter((face) => face.status !== 'unloaded')
        .map((face) => `${face.family} ${face.weight} ${face.status}`);
    });
    expect(faces.filter((f) => f.endsWith(' error')), `読めなかった書体（${faces.join(', ')}）`).toEqual([]);
    expect(faces.filter((f) => f.endsWith(' loaded')).length, `読めた書体が無い（${faces.join(', ')}）`).toBeGreaterThan(0);
    //   名前の欄が 16px 以上（iOS の拡大を起こさない）・Tab でフォーカスが見える
    await expectFieldsAtLeast16px(page);
    await expectFocusVisibleOnTab(page);

    // Then 席の名前の字が倒れていない（spec §6.3。2026-10-13 の実画面で、縦書きの席の欧文が横倒しだった）。
    //   **欧文の名前だけで 4 席にすると、どの角度で止まっても縦書きの席が必ず 1 つ以上できる**（半径の向きは
    //   180° の剰余で 90° おきに並び、どちらかが縦から 45° 以内に入る）。3 席でも 60° おきなので必ずできる。
    //   止まり方は乱数なので、回し直して局面を変える（同じルームのまま。席を足す・外す・幅を変える）
    await addRouletteGuest(page, 'Mika');
    await addRouletteGuest(page, 'Ken');
    const spinAndSettle = async (label: string): Promise<void> => {
      await expect(spinButton(page)).toBeEnabled();
      await spinButton(page).click();
      await expect(roulettePhrase(page), `${label}: 止まる`).toHaveText(RESULT, { timeout: SPIN_MS + 2000 });
    };
    await spinAndSettle('4 席・1280');
    await expectWheelGlyphsUpright(page, 1);
    await spinAndSettle('4 席・1280 の 2 回目');
    await expectWheelGlyphsUpright(page, 1);
    //   幅 320（縦積み・指し針は下）。並びが変わると止まった角度を置き直すので、回さずにも見る
    await page.setViewportSize({ width: 320, height: 640 });
    await expect(page.locator('.roulette-stage')).toHaveAttribute('data-layout', 'stack');
    await expectWheelGlyphsUpright(page, 1);
    await spinAndSettle('4 席・320');
    await expectWheelGlyphsUpright(page, 1);
    //   名前を外して 3 席
    await page.getByRole('button', { name: 'Ken の名前を消す' }).click();
    await expect(page.locator('.wheel-label')).toHaveCount(3);
    await spinAndSettle('3 席・320');
    await expectWheelGlyphsUpright(page, 1);
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(page.locator('.roulette-stage')).toHaveAttribute('data-layout', 'row');
    await expectWheelGlyphsUpright(page, 1);

    // どの画面も例外を出していない
    expect(consoleWatcher.errors).toEqual([]);
    expect(peer.console.errors).toEqual([]);
  });
});
