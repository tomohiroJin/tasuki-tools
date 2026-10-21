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
import { parseFrames, watchSentFrames, type FrameLog } from '../support/ws-frames';
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

/** 送信フレームのうち、`from` 番目以降の `agenda.next` が載せたステップ ID（送った順）。 */
function nextIdsSince(log: FrameLog, from: number): string[] {
  return parseFrames(log.payloads.slice(from)).flatMap((f) => {
    const o = f as { command?: unknown; stepId?: unknown };
    return o.command === 'agenda.next' && typeof o.stepId === 'string' ? [o.stepId] : [];
  });
}

/** 盤の名前を、サンプルの進む順（予備はスキップ後に使わない）の添字で引く */
const ORDER = ['K を出す', 'P を出す', '投票', 'Try の議論'] as const;

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
    const sentA = watchSentFrames(page);
    const inviteUrl = await openAgendaTool(page, NAME_A);
    await loadSampleAndStart(page);
    const peer = await openPeer('agenda-b');
    const sentB = watchSentFrames(peer.page);
    await joinAgendaTool(peer.page, inviteUrl, NAME_B);
    const b = peer.page;

    // Then その1: 両方の盤の中央の名前が「K を出す」で一致する
    await expect(dialName(page)).toHaveText('K を出す');
    await expect(dialName(b)).toHaveText('K を出す');

    // When / Then その2: B が「次へ」→ A も「P を出す」
    await b.getByRole('button', { name: '次へ', exact: true }).click();
    await expect(dialName(b)).toHaveText('P を出す');
    await expect(dialName(page)).toHaveText('P を出す');

    // When / Then その3: 同じ画面の 2 連打（同じ回の中で 2 回押す）。2 回とも**同じステップ ID** を載せるので、
    //   サーバーは 2 回目を捨て、両方の画面は「投票」で止まる（「Try の議論」へ飛ばない）。
    //   2 つの page の click は同時に届かず、片方の更新が先に届けば相手の押下は新しいステップに効く（正しい動き）。
    //   重複を確実に起こすため、**1 つの page** の中で同じタスクのうちに 2 回押す
    const markA = sentA.payloads.length;
    await page.getByRole('button', { name: '次へ', exact: true }).evaluate((el) => {
      (el as HTMLButtonElement).click();
      (el as HTMLButtonElement).click();
    });
    await expect(dialName(page)).toHaveText('投票');
    await expect(dialName(b)).toHaveText('投票');
    const doubled = nextIdsSince(sentA, markA);
    expect(doubled.length, '2 連打で 2 回送っている').toBe(2);
    expect(new Set(doubled).size, '2 回とも同じステップ ID').toBe(1);
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

    // When / Then その6: 2 人がほぼ同時に「次へ」（2 つの page。ここは偶然の重なりを許す）。
    //   **進み方は、送ったステップ ID の種類の数と一致する**（別の ID は 1 つずつ効き、同じ ID の重複は何も進めない）。
    //   ID が 1 種類なら「Try の議論」、2 種類（片方の更新が先に届いた）なら次の予備はスキップ済みなので終了になる
    const startIdx = ORDER.indexOf('投票');
    const markCrossA = sentA.payloads.length;
    const markCrossB = sentB.payloads.length;
    await Promise.all([
      page.getByRole('button', { name: '次へ', exact: true }).click(),
      b.getByRole('button', { name: '次へ', exact: true }).click(),
    ]);
    await expect(dialName(page)).not.toHaveText('投票');
    await expect(dialName(b)).not.toHaveText('投票');
    await settleFrames(page, b);
    const distinct = new Set([...nextIdsSince(sentA, markCrossA), ...nextIdsSince(sentB, markCrossB)]).size;
    expect(distinct, '送ったステップ ID は 1 種類か 2 種類').toBeGreaterThanOrEqual(1);
    const expected = ORDER[startIdx + distinct];
    if (expected !== undefined) {
      await expect(dialName(page)).toHaveText(expected);
      await expect(dialName(b)).toHaveText(expected);
    } else {
      //   終了: 盤の中央は会の名前になり、進行表は終了の一覧に替わる（「次へ」の帯は消える）
      await expect(page.getByRole('button', { name: '次へ', exact: true })).toHaveCount(0);
      await expect(b.getByRole('button', { name: '次へ', exact: true })).toHaveCount(0);
    }

    // Then 最後: どちらのコンソールにもエラーが出ていない
    expect(consoleWatcher.errors).toEqual([]);
    expect(peer.console.errors).toEqual([]);
  });
});
