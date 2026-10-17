/**
 * 進行役ルーレット（#94 PR 2）。
 *
 * - `@core` — 全員の画面で同じ人に止まること。**本番にルーレットが入った後の `pnpm e2e:prod` が見る前提**で、
 *   配布の前の本番に当てると落ちる（`/roulette/` がまだ無い。`deploy/roulette/NOTES.md`）。
 *   タグは describe のタイトルの先頭に置く（`e2e/tests/spec-tags.test.ts`）。
 *
 * **ルームを作るのはこの 1 本だけ**（以前は E2E 全件がルーム枠 100 にぎりぎりだった。#387 で広げたのはローカルのハーネスの枠だけで、`pnpm e2e:prod` が当たる本番の枠は 100 のまま。動いている検査なので、ルームに分けない）。配信と転送の確認も同じ本の
 * 頭に入れて、本数もルームも増やさない。見た目・a11y の検査（PR 3）も同じ本の終わりに足した
 * （止まった後の文字の読みやすさ・書体・円盤の席の名前・フォーカス・名前の欄）。幅ごとの当たりと
 * 札の隠れは `buttons.spec.ts` のお題ツールの本（同じルーム）に足した。
 *
 * 入る人は 2 人だけにする。**2 人のときは当たりが必ず交互になる**（spec §5.1）ので、
 * サーバーが一周の規則で引いていることを、乱数に頼らず決定的に確かめられる。交互を確かめた後で
 * 名前を足して席を増やし、円盤の席の名前と脇の一覧の名前の読みやすさを幅と席数を変えて見る（spec §6.3）。
 */
import { expect, test } from '../fixtures/test';
import { expectFieldsAtLeast16px, expectFocusVisibleOnTab, expectReadable, pairKey, resolveColors, scanContrast } from '../support/a11y';
import {
  addRouletteGuest,
  expectGroupCardNotCovered,
  expectWheelGlyphsUpright,
  expectWheelLabelsInsideSeats,
  expectWheelLabelsUseWebFonts,
  expectRouletteNamesNotCut,
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
/** 2 人以上の結果（#401）。止まった順に「{名前} さん」を「、」でつなぐ */
const GROUP_RESULT = /^選ばれたのは (.+) さんです$/;
/** 2 人目からの「置く」＋「送る」（`STOP_HOLD_MS` + `NEXT_MOVE_MS`）。k 人の回転は SPIN_MS + (k − 1) × これ */
const NEXT_STOP_MS = 1600;
/**
 * 変わった止まり方（#420）で延びる長さの最大（`STOP_STYLE_EXTRA_MS` の最大）。**サーバーが 1/20 で引くので、E2E では選べない。**
 * 回している側の画面が結果を言うまでの待ちには、いつもこれを足す（足さないと 20 回に 1 回ほど待ちの上限を超えて落ちる）
 */
const STYLE_EXTRA_MS = 2500;

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
    // ルームはこの 1 本だけで作るので、回す場面がすべてここに積まれる（#94 の 9 回・#401 の 2 人と 4 人の回転）。
    // #401 の 2 回（約 5.6 秒と 8.8 秒）を足して既定の上限（60 秒）を超えたので、この本だけ 30 秒延ばす
    test.setTimeout(test.info().timeout + 50_000);
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
      //   2 回目からは B に前の回の結果の一言が残っていて、それも RESULT に合う。本番の往復の遅れの間に
      //   それを読むと、A と B が別の人を指したように見える（2026-10-14 の e2e:prod）。回す前の一言から
      //   変わるのを待つ。2 人なので当たりは交互になり、新しい結果は前の回と必ず違う文になる
      const beforeOnB = await roulettePhrase(peer.page).textContent();
      //   空のままだと「変わった」が何にでも当たり、前の回の結果も素通りする
      expect(beforeOnB, `${round} 回目: 回す前の B の一言`).toBeTruthy();
      await spinButton(page).click();

      // その1: B は動きを減らす設定なので、回転を待たず 1 秒以内に結果が出る。
      //   変化と結果の形を 1 つの待ちで見る（2 段に分けると待ちの上限が足し算で 2 秒に緩む）。
      //   判定した値をそのまま当たりとして使う（読み直すと、その間に変わった文を拾いうる）
      let winnerOnB: string | undefined;
      await expect
        .poll(
          async () => {
            const text = (await roulettePhrase(peer.page).textContent()) ?? '';
            winnerOnB = text === beforeOnB ? undefined : RESULT.exec(text)?.[1];
            return winnerOnB;
          },
          // 変わらないまま時間切れなら、同期の遅れか、同じ人が続いた（交互の規則が崩れた）かのどちらか
          { message: `${round} 回目: B に 1 秒以内に新しい結果が出ない（同期の遅れか、前の回と同じ人に止まった）`, timeout: 1000 },
        )
        .toBeTruthy();

      // その2: そのとき A は回している最中で、**当たりの名前をまだ言わない**
      await expect(roulettePhrase(page), `${round} 回目: A は回している最中`).toHaveText(`${NAME_A} さんが回しました`);
      await expect(spinButton(page)).toBeDisabled();

      // その3: 回転が終わると A も同じ人を言う（全員の画面で同じ席に止まる）
      await expect(roulettePhrase(page), `${round} 回目: A の結果`).toHaveText(RESULT, { timeout: SPIN_MS + STYLE_EXTRA_MS + 2000 });
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

    // Then 円盤の席の名前（spec §6.3・利用者の決定 案 2）。字が ±60° を超えて倒れない・欧文を縦に積まない・
    //   縁の外へはみ出さない・この画面の書体で描かれる。脇の一覧の名前が切れない。止まり方は乱数なので、
    //   同じルームのまま回し直して局面を変える（席を足す・外す・幅を変える）。
    //   **欧文の名前だけで 6 席（3 席・5 席でも）にすると、どの角度で止まっても縦から 30° 以内の半径の席が
    //   必ずできる**（半径の向きは 180° の剰余で 60° おきに並ぶ）。その席の欧文は半径を横切る横書きになる
    for (const name of ['Mika', 'Ken', 'Lee', 'Ann']) await addRouletteGuest(page, name);
    const spinAndSettle = async (label: string): Promise<void> => {
      await expect(spinButton(page)).toBeEnabled();
      await spinButton(page).click();
      //   前の回の結果の一言が残っているので、先に回し始めたことを見る（見ないと回っている最中を測る）
      await expect(roulettePhrase(page), `${label}: 回し始める`).toHaveText(`${NAME_A} さんが回しました`);
      await expect(roulettePhrase(page), `${label}: 止まる`).toHaveText(RESULT, { timeout: SPIN_MS + STYLE_EXTRA_MS + 2000 });
    };
    await spinAndSettle('欧文 6 席・1280');
    await expectWheelGlyphsUpright(page, 1);
    await spinAndSettle('欧文 6 席・1280 の 2 回目');
    await expectWheelGlyphsUpright(page, 1);
    //   幅 320（縦積み・指し針は下）。並びが変わると止まった角度を置き直すので、回さずにも見る
    await page.setViewportSize({ width: 320, height: 640 });
    await expect(page.locator('.roulette-stage')).toHaveAttribute('data-layout', 'stack');
    await expectWheelGlyphsUpright(page, 1);
    await spinAndSettle('欧文 6 席・320');
    await expectWheelGlyphsUpright(page, 1);
    //   名前を外して 3 席
    for (const name of ['Ken', 'Lee', 'Ann']) await page.getByRole('button', { name: `${name} の名前を消す` }).click();
    await expect(page.getByRole('checkbox')).toHaveCount(3);
    //   止まった後の円盤は、次に回すまで回したときの並びを描く（針と札が同じ人を指す・spec §6.3）。3 席になるのは回してから
    await expect(page.locator('.wheel-label')).toHaveCount(6);
    await spinAndSettle('欧文 3 席・320');
    await expect(page.locator('.wheel-label')).toHaveCount(3);
    await expectWheelGlyphsUpright(page, 1);

    //   漢字 2 字の名前だけで 6 席（ルームの 2 人を外し、足した名前を入れ替える）。幅 320 では当たりの席が真下に
    //   来て縦書きになり、行が外へ進む。2026-10-13 の撮影では、そこで当たりの太さ（700）の漢字がシステムの書体に
    //   落ち、字が重なって縁の外へはみ出した。一覧では印と「名前を消す」に幅を取られて名前が切れた
    await page.getByRole('button', { name: 'Mika の名前を消す' }).click();
    for (const name of ['山田', '健太', '花子', '太郎', '次郎', '三郎']) await addRouletteGuest(page, name);
    //   チェックはサーバーの往復で変わるので、`uncheck()`（その場で変わることを求める）ではなく押して待つ
    for (const name of [NAME_A, NAME_B]) {
      const box = page.getByRole('checkbox', { name: new RegExp(name) });
      await box.click();
      await expect(box).not.toBeChecked();
    }
    for (const round of ['', ' の 2 回目']) {
      await spinAndSettle(`漢字 6 席・320${round}`);
      await expect(page.locator('.wheel-label')).toHaveCount(6);
      await expectWheelGlyphsUpright(page);
      await expectWheelLabelsInsideSeats(page, 1);
      await expectWheelLabelsUseWebFonts(page);
      await expectRouletteNamesNotCut(page, 1);
    }
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(page.locator('.roulette-stage')).toHaveAttribute('data-layout', 'row');
    await spinAndSettle('漢字 6 席・1280');
    await expectWheelGlyphsUpright(page);
    await expectWheelLabelsInsideSeats(page, 1);
    await expectWheelLabelsUseWebFonts(page);
    await expectRouletteNamesNotCut(page, 1);

    // Then 2 人以上を選ぶ（#401 spec §6）。同じルームのまま、A が人数を変えると B の画面にも届き、
    //   全員の画面で同じ人たちが同じ順に止まる。B は動きを減らす設定なので、回さずに全員をすぐに出す
    const pickButton = (p: typeof page, k: number) =>
      p.getByRole('group', { name: '選ぶ人数' }).getByRole('button', { name: `${k} 人` });
    await pickButton(page, 2).click();
    await expect(pickButton(page, 2)).toHaveAttribute('aria-pressed', 'true');
    await expect(pickButton(peer.page, 2), 'B にも人数が届く').toHaveAttribute('aria-pressed', 'true');
    await expect(roulettePhrase(page)).toHaveText(RESULT);
    const beforeGroupOnB = await roulettePhrase(peer.page).textContent();
    await spinButton(page).click();
    await expect(roulettePhrase(page), '2 人: A は回している最中').toHaveText(`${NAME_A} さんが回しました`);
    let groupOnB = '';
    await expect
      .poll(
        async () => {
          const text = (await roulettePhrase(peer.page).textContent()) ?? '';
          groupOnB = text !== beforeGroupOnB && GROUP_RESULT.test(text) ? text : '';
          return groupOnB;
        },
        { message: '2 人: B に 1 秒以内に 2 人の結果が出ない', timeout: 1000 },
      )
      .toBeTruthy();
    await expect(roulettePhrase(page), '2 人: A の結果').toHaveText(GROUP_RESULT, { timeout: SPIN_MS + STYLE_EXTRA_MS + NEXT_STOP_MS + 2000 });
    expect(await roulettePhrase(page).textContent(), '2 人: A と B で同じ人たちが同じ順').toBe(groupOnB);
    const pair = (GROUP_RESULT.exec(groupOnB)?.[1] ?? '').split(' さん、');
    expect(pair, '2 人: 選ばれたのは 2 人').toHaveLength(2);
    expect(pair[0], '2 人: 同じ人を 2 度選ばない').not.toBe(pair[1]);
    await expect(page.locator('.wheel-segment--winner'), '2 人: 真鍮の席が 2 つ').toHaveCount(2);
    //   4 人・幅 320×640（縦積み）。組の札は 1 人の札より背が高いが、下端の帯に隠れない・札からはみ出さない
    await page.setViewportSize({ width: 320, height: 640 });
    await pickButton(page, 4).click();
    await expect(pickButton(page, 4)).toHaveAttribute('aria-pressed', 'true');
    await spinButton(page).click();
    await expect(roulettePhrase(page), '4 人: 回し始める').toHaveText(`${NAME_A} さんが回しました`);
    await expect(roulettePhrase(page), '4 人: 止まる').toHaveText(GROUP_RESULT, { timeout: SPIN_MS + STYLE_EXTRA_MS + 3 * NEXT_STOP_MS + 2000 });
    await expect(page.locator('.roulette-group-row.is-filled')).toHaveCount(4);
    await expectGroupCardNotCovered(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), '4 人・320: 横に溢れない').toBe(true);
    await page.setViewportSize({ width: 1280, height: 720 });

    // Then 順番に回す（#401 順番に回す spec §5）。同じルームのまま A が決め方を変えると B にも届く。入る人を 3 人に絞り、
    //   2 回回して 1 番・2 番を決め、最後の 1 人は回さずに出る。全員の画面で同じ人が同じ順になり、回が終わると円盤は空になる
    const modeButton = (p: typeof page, name: string) => p.getByRole('group', { name: '決め方' }).getByRole('button', { name });
    await modeButton(page, '順番に回す').click();
    await expect(modeButton(peer.page, '順番に回す'), 'B にも決め方が届く').toHaveAttribute('aria-pressed', 'true');
    const checked = page.locator('.roulette-check:checked:not(:disabled)');
    for (let left = await checked.count(); left > 3; left--) {
      await checked.last().click();
      await expect(checked).toHaveCount(left - 1);
    }
    const orderButton = (p: typeof page, name: string) => p.getByRole('button', { name, exact: true });
    const turns: string[] = [];
    for (const turn of [1, 2]) {
      await orderButton(page, '次の人を決める').click();
      const result = new RegExp(`^${turn} 番は (.+) さんです$`);
      await expect(roulettePhrase(page), `${turn} 番: A の結果`).toHaveText(result, { timeout: SPIN_MS + STYLE_EXTRA_MS + 2000 });
      const text = (await roulettePhrase(page).textContent()) ?? '';
      await expect(roulettePhrase(peer.page), `${turn} 番: B も同じ人`).toHaveText(text);
      turns.push(result.exec(text)?.[1] ?? '');
    }
    await orderButton(page, '最後の 1 人').click();
    await expect(roulettePhrase(page), '最後の人').toHaveText(/^最後は (.+) さんです$/);
    const lastText = (await roulettePhrase(page).textContent()) ?? '';
    await expect(roulettePhrase(peer.page), '最後: B も同じ人').toHaveText(lastText);
    turns.push(/^最後は (.+) さんです$/.exec(lastText)?.[1] ?? '');
    expect(new Set(turns).size, '3 人がそれぞれ 1 度ずつ').toBe(3);
    await expect(page.locator('.wheel-segment'), '回が終わったら円盤は空').toHaveCount(0);
    await expect(orderButton(page, '次の回を始める')).toBeEnabled();
    await expect(peer.page.getByText('全員の順番が決まりました')).toBeVisible();

    // Then 押して止める（#401 押して止める spec §3）。A が決め方を変えて回し、B が止める。
    //   B が止めた人に A と B の画面がそろう（B は動きを減らす設定だが、このときは回る・spec P8）
    await modeButton(page, '止めて決める').click();
    await expect(modeButton(peer.page, '止めて決める'), 'B にも決め方が届く').toHaveAttribute('aria-pressed', 'true');
    await orderButton(page, 'ルーレットを回す').click();
    await expect(roulettePhrase(page), '押して止める: 回っている').toHaveText('止めると、指している人に決まります');
    await orderButton(peer.page, '止める').click();
    const stopped = new RegExp(`^${NAME_B} さんが止めました。(.+) さんに決まりました$`);
    await expect(roulettePhrase(peer.page), '押して止める: B の結果').toHaveText(stopped);
    await expect(roulettePhrase(page), '押して止める: A は寄せてから同じ人').toHaveText(stopped, { timeout: 5000 });
    expect(await roulettePhrase(page).textContent(), '押して止める: A と B で同じ人').toBe(await roulettePhrase(peer.page).textContent());
    await expect(page.locator('.wheel-segment--winner'), '押して止める: 真鍮の席が 1 つ').toHaveCount(1);

    // どの画面も例外を出していない
    expect(consoleWatcher.errors).toEqual([]);
    expect(peer.console.errors).toEqual([]);
  });
});
