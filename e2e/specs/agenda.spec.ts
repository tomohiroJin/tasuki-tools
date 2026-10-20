/**
 * 進行タイマー（#429 Task 4.3）。
 *
 * - `@core` — 全員の画面で同じステップを進めること。**本番に進行タイマーが入った後の `pnpm e2e:prod` が見る前提**で、
 *   配布の前の本番に当てると落ちる（`/agenda/` がまだ無い。`deploy/agenda/NOTES.md`）。
 *   タグは describe のタイトルの先頭に置く（`e2e/tests/spec-tags.test.ts`）。
 *
 * **ルームを作るのはこの 1 本だけ**（本番のルーム枠は 100 のまま。ルームの増分は +1）。
 * 時間切れ（サンプルの最短は 1 分）は待たない。実時間の待ちは `apps/tasuki-sync` の偽の時計の検査が持つ。
 */
import { expect, test } from '../fixtures/test';
import { dialDrift, dialName, joinAgendaTool, loadSampleAndStart, openAgendaTool, parseDriftMinutes } from '../support/agenda';

const NAME_A = 'e2e-agenda-a';
const NAME_B = 'e2e-agenda-b';

/** 描画の枠を数フレーム回し、遅れて届く更新（不正な飛び越し）を拾う余地を作る。固定時間の待ちではない。 */
async function settleFrames(...pages: import('@playwright/test').Page[]): Promise<void> {
  for (const p of pages) {
    await p.evaluate(
      () =>
        new Promise<void>((resolve) => {
          let n = 0;
          const tick = (): void => {
            n += 1;
            if (n >= 30) resolve();
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }),
    );
  }
}

/**
 * @requirements #429
 */
test.describe('@core 進行タイマーは全員の画面で同じステップを進める', () => {
  test('Given 2 人が同じルームで進行タイマーを開く / When 次へ・同時の次へ・延長・スキップ / Then 両方の画面が同じステップと進行表になる', async ({
    page,
    openPeer,
    consoleWatcher,
  }) => {
    // Given: A がルームを作って進行タイマーを開き、サンプルを読み込んで開始する。B は別の文脈で招待 URL から入る
    const inviteUrl = await openAgendaTool(page, NAME_A);
    await loadSampleAndStart(page);
    const peer = await openPeer('agenda-b');
    await joinAgendaTool(peer.page, inviteUrl, NAME_B);
    const b = peer.page;

    // Then その1: 両方の盤の中央の名前が「K を出す」で一致する
    await expect(dialName(page)).toHaveText('K を出す');
    await expect(dialName(b)).toHaveText('K を出す');

    // When / Then その2: B が「次へ」→ A も「P を出す」
    await b.getByRole('button', { name: '次へ', exact: true }).click();
    await expect(dialName(b)).toHaveText('P を出す');
    await expect(dialName(page)).toHaveText('P を出す');

    // When / Then その3: ほぼ同時に「次へ」を押しても、押した時点のステップ ID が古い方は捨てられ、両方「投票」で止まる
    //   （「Try の議論」まで飛ぶのは、2 回目の押下が新しいステップに効いたとき）
    await Promise.all([
      page.getByRole('button', { name: '次へ', exact: true }).click(),
      b.getByRole('button', { name: '次へ', exact: true }).click(),
    ]);
    await expect(dialName(page)).toHaveText('投票');
    await expect(dialName(b)).toHaveText('投票');
    //   数フレーム進めたあとも、どちらも「Try の議論」へ飛んでいない
    await settleFrames(page, b);
    await expect(dialName(page)).toHaveText('投票');
    await expect(dialName(b)).toHaveText('投票');

    // When / Then その4: A が「このステップに +3 分」→ B の押し巻きがちょうど 3 分ぶん押す側へ動く。
    //   ここまでの「次へ」は予定より早く進めたので押し巻きは負（巻き）。符号ではなく差で見る
    const before = parseDriftMinutes((await dialDrift(b).textContent()) ?? '');
    expect(before, `延長前の B の押し巻きの文が読めない`).not.toBeNull();
    expect(before!, '早く進めたので巻き（負）になっている').toBeLessThan(0);
    await page.getByRole('group', { name: 'このステップに' }).getByRole('button', { name: '+3 分', exact: true }).click();
    await expect
      .poll(async () => parseDriftMinutes((await dialDrift(b).textContent()) ?? ''), { message: '延長の 3 分が B の押し巻きに載る' })
      .toBe(before! + 3);
    //   A の画面も同じ（同じ文面）
    await expect(dialDrift(page)).toHaveText((await dialDrift(b).textContent()) ?? '');
    //   進行表に延長の足し（「1 分 + 3」）が出る
    await expect(b.getByRole('listitem').filter({ hasText: '投票' }).filter({ hasText: '+ 3' })).toBeVisible();

    // When / Then その5: A が予備（5 つ目・まだ始まっていない）を「スキップ」→ B の進行表で予備がスキップの印になる
    await page.getByRole('button', { name: 'ステップ 5 をスキップ', exact: true }).click();
    const spareOnB = b.getByRole('listitem').filter({ hasText: '予備' });
    await expect(spareOnB.locator('.step-list-mark--skipped')).toHaveText('スキップ');
    await expect(spareOnB.getByRole('button', { name: 'ステップ 5 を戻す', exact: true })).toBeVisible();
    await expect(spareOnB).toHaveClass(/is-skipped/);

    // Then 最後: どちらのコンソールにもエラーが出ていない
    expect(consoleWatcher.errors).toEqual([]);
    expect(peer.console.errors).toEqual([]);
  });
});
