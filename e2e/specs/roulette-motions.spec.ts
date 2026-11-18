/**
 * ルーレットの変わった動き（#640）。動き出し（震える・溜める・つまずく）と回転（逆回転・途中で向きを変える・速い）。
 *
 * **サーバーの乱数では動きを選べない**（1/12・1/16 で引く）。そこで**各画面の WebSocket を中継し、ルーレットの
 * フレームに動きと長さを差し込む**（`routeWebSocket`。`notices-a11y.spec.ts` と同じ形で、製品コードにテスト用の経路は作らない）。
 * 差し込む長さは core の表と同じ（つまずく +1300・途中で向きを変える +1000 = +2300。上限 +4000 に収まる）。
 * 乱数の抽選・長さの表・当たる人が変わらないこと・新旧の wire の混在は単体（`packages/roulette-core/tests/roulette-motions.test.ts`・
 * `apps/roulette-web/tests/spin-motion*.test.*`）が見る。ここは**実画面で**、
 *
 * - 動きの載った回転を、全員の画面が**同じ時刻に**止まる（普通の止まる時刻では止まらず、延びた時刻にだけ結果を言う）
 * - 「動きを減らす」設定の画面は、動きを見せず、受け取った直後に結果を言い、円盤を回さない
 *
 * を見る。タグは付けない（**本番の枠を使わない・フレームを書き換える検査は本番へ流さない**。`e2e/tests/spec-tags.test.ts`）。
 * ルームは 1 つ（3 人）。
 */
import { expect, test } from '../fixtures/test';
import { joinRouletteTool, openRouletteTool, roulettePhrase, spinButton } from '../support/roulette';
import type { Page } from '@playwright/test';

const NAME_A = 'e2e-motion-a';
const NAME_B = 'e2e-motion-b';
const NAME_C = 'e2e-motion-c';
const RESULT = /^次の進行役は (.+) さんです$/;
/** いつもの回転の長さ（`SPIN_DURATION_MS`） */
const PLAIN_MS = 4000;
/** 差し込む動き: つまずく（動き出し・+1300）・途中で向きを変える（回転・+1000）。合計 +2300 は上限（+4000）に収まる */
const EXTRA_MS = 1300 + 1000;
const MOVED_MS = PLAIN_MS + EXTRA_MS;
/** 画面どうしの止まる時刻の差の許容（ms）。同じ機械の 3 つの文脈で、フレームの届く差と描画の周期を含む */
const SAME_TIME_TOLERANCE_MS = 400;

/** `unknown` がオブジェクトか */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * サーバーのルーレットのフレームに、動きと延びた長さを差し込む。回転の無いフレーム・ルーレット以外のフレームはそのまま。
 * 止まり方（乱数で付くことがある）は外し、長さを動きの分だけに固定する（どの回も同じ長さになる）。
 */
function withMotions(message: string | Buffer): string | Buffer {
  if (typeof message !== 'string') return message;
  let frame: unknown;
  try {
    frame = JSON.parse(message);
  } catch {
    return message;
  }
  if (!isRecord(frame) || frame['type'] !== 'roulette' || !isRecord(frame['state'])) return message;
  const spin = frame['state']['spin'];
  if (!isRecord(spin)) return message;
  delete spin['stopStyle'];
  spin['launchMotion'] = 'stumble';
  spin['spinMotion'] = 'turnback';
  spin['durationMs'] = MOVED_MS;
  const elapsed = spin['elapsedMs'];
  spin['elapsedMs'] = typeof elapsed === 'number' ? Math.min(elapsed, MOVED_MS) : 0;
  return JSON.stringify(frame);
}

/** そのページのルーレットの WS を実サーバーへ中継し、サーバーからのフレームに動きを差し込む。**ルーレットを開く前に掛けること** */
async function forceMotions(page: Page): Promise<void> {
  await page.routeWebSocket(/\/ws\?.*\btool=roulette\b/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((message) => server.send(message));
    server.onMessage((message) => ws.send(withMotions(message)));
  });
}

/** 結果の一言が出た時刻（`Date.now()`）をページの中で記録する。同じ機械の時計なので画面どうしを比べられる */
async function recordResultTime(page: Page): Promise<void> {
  await page.evaluate(() => {
    const target = document.querySelector('.roulette-caption[role="status"]');
    const w = window as unknown as { __resultAt: number | null; __spinAt: number | null };
    w.__resultAt = null;
    w.__spinAt = null;
    if (target === null) throw new Error('結果の一言の欄が無い');
    new MutationObserver(() => {
      const text = target.textContent ?? '';
      // 回し始めを受けた時刻（「…さんが回しました」が出た時刻）。クリックと往復の遅れを含めずに、回転の長さを測るため
      if (w.__spinAt === null && /さんが回しました$/.test(text)) w.__spinAt = Date.now();
      if (w.__resultAt === null && /^次の進行役は /.test(text)) w.__resultAt = Date.now();
    }).observe(target, { childList: true, subtree: true, characterData: true });
  });
}

async function resultTime(page: Page): Promise<number | null> {
  return page.evaluate(() => (window as unknown as { __resultAt: number | null }).__resultAt);
}

/** 円盤の回転子の角度（`transform="rotate(…)"`）。無ければ NaN */
async function spinTime(page: Page): Promise<number | null> {
  return page.evaluate(() => (window as unknown as { __spinAt: number | null }).__spinAt);
}

async function rotorAngle(page: Page): Promise<number> {
  const transform = await page.locator('.wheel-rotor').getAttribute('transform');
  return Number(/rotate\(([-\d.e]+)\)/.exec(transform ?? '')?.[1]);
}

test.describe('ルーレットの変わった動きは全員の画面で同じ時刻に止まり、動きを減らす設定では見せない', () => {
  test('Given 3 人（うち 1 人は動きを減らす設定）の画面に動きを差し込む / When A が回す / Then 普通の時刻では止まらず、延びた時刻に A と B が同じ時刻に止まり、C は回さずに受けた直後に結果を言う', async ({
    page,
    openPeer,
    consoleWatcher,
  }) => {
    // 動きの分だけ回転が長い（約 6.3 秒）
    test.setTimeout(test.info().timeout + 20_000);

    // Given: 3 人の画面すべてで、ルーレットのフレームに動きを差し込む（開く前に掛ける）。C は動きを減らす設定
    await forceMotions(page);
    const inviteUrl = await openRouletteTool(page, NAME_A);
    const peerB = await openPeer('roulette-motion-b');
    await forceMotions(peerB.page);
    await joinRouletteTool(peerB.page, inviteUrl, NAME_B);
    const peerC = await openPeer('roulette-motion-c');
    await peerC.page.emulateMedia({ reducedMotion: 'reduce' });
    await forceMotions(peerC.page);
    await joinRouletteTool(peerC.page, inviteUrl, NAME_C);
    for (const p of [page, peerB.page, peerC.page]) await expect(p.getByRole('checkbox')).toHaveCount(3);
    await expect(spinButton(page)).toBeEnabled();
    await expect(spinButton(peerB.page)).toBeEnabled();
    for (const p of [page, peerB.page, peerC.page]) await recordResultTime(p);

    // When: A が回す
    const clickedAt = Date.now();
    await spinButton(page).click();

    // Then その1: C は動きを減らす設定。回転を待たず 1 秒以内に結果を言い、円盤は回らない
    await expect(spinButton(peerC.page), 'C が新しい回転を受ける').toBeDisabled({ timeout: 1000 });
    const winnerOnC = RESULT.exec((await roulettePhrase(peerC.page).textContent()) ?? '')?.[1];
    expect(winnerOnC, 'C の結果の形（回さずに結果を出す）').toBeTruthy();
    await page.waitForTimeout(1500);
    const settledAngleC = await rotorAngle(peerC.page);
    await page.waitForTimeout(1500);
    expect(await rotorAngle(peerC.page), 'C の円盤は回転の間も動かない（動きを見せない）').toBe(settledAngleC);
    expect(Number.isFinite(settledAngleC), 'C の円盤の角度を読めた').toBe(true);

    // Then その2: A と B は、普通の止まる時刻（4 秒）を過ぎても結果を言わない（動きの分だけ延びている）
    const untilPlainStop = PLAIN_MS + 400 - (Date.now() - clickedAt);
    if (untilPlainStop > 0) await page.waitForTimeout(untilPlainStop);
    await expect(roulettePhrase(page), 'A は普通の時刻の後もまだ回している').toHaveText(`${NAME_A} さんが回しました`);
    await expect(roulettePhrase(peerB.page), 'B は普通の時刻の後もまだ回している').toHaveText(`${NAME_A} さんが回しました`);

    // Then その3: 延びた時刻に、A と B が同じ人を同じ時刻に言う
    await expect(roulettePhrase(page), 'A の結果').toHaveText(RESULT, { timeout: MOVED_MS + 2000 });
    await expect(roulettePhrase(peerB.page), 'B の結果').toHaveText(RESULT, { timeout: 2000 });
    const winnerOnA = RESULT.exec((await roulettePhrase(page).textContent()) ?? '')?.[1];
    const winnerOnB = RESULT.exec((await roulettePhrase(peerB.page).textContent()) ?? '')?.[1];
    expect(winnerOnA, 'A と B と C で同じ人').toBe(winnerOnB);
    expect(winnerOnA, 'A と B と C で同じ人').toBe(winnerOnC);
    const timeA = await resultTime(page);
    const timeB = await resultTime(peerB.page);
    expect(timeA, 'A の結果の時刻を記録した').not.toBeNull();
    expect(timeB, 'B の結果の時刻を記録した').not.toBeNull();
    expect(Math.abs((timeA ?? 0) - (timeB ?? 0)), 'A と B が結果を言った時刻の差').toBeLessThanOrEqual(SAME_TIME_TOLERANCE_MS);
    // 延びた長さ（約 6.3 秒）で言う。**A が回し始めを受けてから結果を言うまで**を測る（クリックと往復の遅れを含めない）。
    //   下限は普通の長さ（4000）+ 500: 普通の長さで止まる実装と分かれる。
    //   **上限は置かない**: 延びが二重に足される実装（約 8600）と、混んだ環境の正しい実装（8681 を実測）の壁時計の値が重なり、見分けられない。
    //   「延びは 1 回だけ」は偽の時計の単体が守る: `packages/roulette-core/tests/roulette-motions.test.ts` の
    //   「wire の durationMs は延びた長さで、動きの名前を載せる」「動きの長さは、止まる時刻（1 人目）の差し引き…」
    //   （表の値を足し直した期待値と比べる。変異 2108・2109 が突く）
    const spunAt = await spinTime(page);
    expect(spunAt, 'A の回し始めの時刻を記録した').not.toBeNull();
    const stoppedAfter = (timeA ?? 0) - (spunAt ?? 0);
    expect(stoppedAfter, 'A が結果を言うまでの時間は、普通の長さより長い').toBeGreaterThan(PLAIN_MS + 500);

    // Then: 動きを差し込んでも、画面は壊れていない（コンソールにエラーが無い）
    expect(consoleWatcher.errors, 'A のコンソールのエラー').toEqual([]);
    expect(peerB.console.errors, 'B のコンソールのエラー').toEqual([]);
    expect(peerC.console.errors, 'C のコンソールのエラー').toEqual([]);
  });
});
