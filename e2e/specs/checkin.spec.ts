/**
 * Check-in Cards（#406 Task 4.3）。
 *
 * - `@core` — 札を伏せて出し、全員の画面で一斉に開くこと。**本番に Check-in Cards が入った後の `pnpm e2e:prod` が見る前提**で、
 *   配布の前の本番に当てると落ちる（`/checkin/` がまだ無い。`deploy/checkin`）。配布の前に落ちるのはこの `@core` と、
 *   `/checkin/` を並べた `@smoke`（`routing.spec.ts`・`site-exterior.spec.ts`）である。
 *   タグは describe のタイトルの先頭に置く（`e2e/tests/spec-tags.test.ts`）。
 *
 * **ルームを作るのはこの 1 本だけ**（ルームの増分は +1）。
 * 匿名（E5・E6）は DOM では確かめられない（画面が参照しない余剰のフィールドは描かれない）ので、
 * B の受けた WS のフレームを JSON として読み、構造で判定する（文字列の含みでは見ない）。
 */
import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures/test';
import { parseFrames, watchWebSocketFrames, type FrameLog } from '../support/ws-frames';
import { chooseMethod, handCard, joinCheckinTool, openCheckinTool, pile, visibilityButton } from '../support/checkin';

const NAME_A = 'e2e-checkin-a';
const NAME_B = 'e2e-checkin-b';

/** やり方の選択の札（ランダムを含む 8 枚）の外接箱。 */
async function pickerBoxes(page: Page): Promise<Array<{ x: number; y: number; width: number; height: number }>> {
  const cards = page.locator('.method-list .method-option');
  await expect(cards).toHaveCount(8);
  const boxes = await cards.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }),
  );
  return boxes;
}

/** 札が同じ幅・同じ高さで、列の数が期待どおりで、横スクロールが無いこと（#468 D1・D2）。 */
async function expectPickerGrid(page: Page, columns: number): Promise<void> {
  const boxes = await pickerBoxes(page);
  for (const b of boxes) {
    expect(Math.abs(b.width - boxes[0]!.width), '札の幅が揃っている').toBeLessThanOrEqual(1);
    expect(Math.abs(b.height - boxes[0]!.height), '札の高さが揃っている').toBeLessThanOrEqual(1);
  }
  // 扇が札の外へはみ出さない（札の箱の内側に扇の箱が入る）
  const inside = await page.locator('.method-list .method-option').evaluateAll((els) =>
    els.every((el) => {
      const o = el.getBoundingClientRect();
      const f = (el.querySelector('.method-fan') as HTMLElement).getBoundingClientRect();
      return f.left >= o.left - 1 && f.right <= o.right + 1 && f.top >= o.top - 1 && f.bottom <= o.bottom + 1;
    }),
  );
  expect(inside, '扇が札の箱の内側に収まる').toBe(true);
  const xs = new Set(boxes.map((b) => Math.round(b.x)));
  expect(xs.size, `${page.viewportSize()?.width}px の列の数`).toBe(columns);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, '横スクロールが出ない').toBeLessThanOrEqual(0);
}

/** `checkin` フレームの中身（受け手ごとの見え方）を、`from` 番目以降について受信順に返す。 */
function checkinViews(log: FrameLog, from = 0): Array<Record<string, unknown>> {
  return parseFrames(log.payloads.slice(from)).flatMap((f) => {
    const o = f as { type?: unknown; state?: unknown };
    return o.type === 'checkin' && typeof o.state === 'object' && o.state !== null ? [o.state as Record<string, unknown>] : [];
  });
}

/** 受信した中で最後の `checkin` フレームの `you`（その受け手自身の参加者 ID）。 */
function selfIdOf(log: FrameLog): string {
  const last = checkinViews(log).at(-1);
  expect(typeof last?.['you'], '`checkin` フレームの you').toBe('string');
  return last!['you'] as string;
}

/** 手札の全てが「選ばれていない」。 */
async function expectNoCardSelected(page: Page, names: readonly string[]): Promise<void> {
  for (const name of names) await expect(handCard(page, name)).toHaveAttribute('aria-pressed', 'false');
}

/**
 * @requirements #406
 */
test.describe('@core 札を伏せて出し、全員の画面で一斉に開く', () => {
  test('Given 2 人が同じルームで Check-in Cards を開く / When 今日の天気・もう一回・ROTI（匿名）・待たずに開く・見学する / Then 両方の画面が同じ回になり、匿名の札は B のフレームに載らない', async ({
    page,
    openPeer,
    consoleWatcher,
  }) => {
    // Given: A がルームを作って開く。B は別の文脈で招待 URL から入る
    const framesA = watchWebSocketFrames(page);
    const inviteUrl = await openCheckinTool(page, NAME_A);
    const peer = await openPeer('checkin-b');
    const framesB = watchWebSocketFrames(peer.page);
    await joinCheckinTool(peer.page, inviteUrl, NAME_B);
    const b = peer.page;

    // When / Then その0（#468）: 選択画面の札は同じ大きさで、320px・39rem 幅（624px）は 2 列、40rem 幅（640px）・1280px は 4 列。両方の側で同じ
    const original = page.viewportSize() ?? { width: 1280, height: 800 };
    for (const [width, columns] of [[320, 2], [624, 2], [640, 4], [1280, 4]] as const) {
      await page.setViewportSize({ width, height: original.height });
      for (const side of ['チェックイン', 'チェックアウト']) {
        await page.getByRole('group', { name: 'やり方を選んでください' }).getByRole('button', { name: side, exact: true }).click();
        await expectPickerGrid(page, columns);
      }
    }
    await page.setViewportSize(original);

    // When / Then その1（E1）: A が「今日の天気」を選ぶ → B にも同じ問いと手札
    await chooseMethod(page, 'チェックイン', '今日の天気');
    for (const p of [page, b]) {
      await expect(p.getByRole('heading', { level: 2, name: '今日のあなたの空模様は？' })).toBeVisible();
      for (const name of ['晴れ', 'くもり', '雨', '雷']) await expect(handCard(p, name)).toBeVisible();
    }

    // When / Then その2（E3・E8）: 2 人が出す → 両方の画面で開き、晴れの山の下に 2 人の名前
    await handCard(page, '晴れ').click();
    await expect(handCard(page, '晴れ')).toHaveAttribute('aria-pressed', 'true');
    await handCard(b, '晴れ').click();
    for (const p of [page, b]) {
      const sunny = pile(p, '晴れ');
      await expect(sunny).toHaveCount(1);
      await expect(sunny.locator('.pile-chip')).toHaveText([NAME_A, NAME_B].sort());
    }

    // When / Then その3（E11）: 「もう一回」→ 両方の手札が選ばれていない
    await page.getByRole('button', { name: 'もう一回', exact: true }).click();
    for (const p of [page, b]) await expectNoCardSelected(p, ['晴れ', 'くもり', '雨', '雷']);

    // When / Then その4（E5・E6・E7）: 別のやり方で ROTI（既定は匿名）
    await page.getByRole('button', { name: '別のやり方', exact: true }).click();
    // 回ありの選択画面（#468 D5）: 320px・1280px で、戻るが見出しの行の右端・横溢れ 0・注意文が見える
    const viewBefore = page.viewportSize() ?? { width: 1280, height: 800 };
    for (const width of [320, 1280]) {
      await page.setViewportSize({ width, height: viewBefore.height });
      const back = page.getByRole('button', { name: 'いまの回に戻る', exact: true });
      await expect(back).toBeVisible();
      await expect(page.getByText('選ぶと新しい回が始まります（いまの回の札は消えます）')).toBeVisible();
      const gap = await back.evaluate((el) => {
        const head = el.closest('.method-picker-head') as HTMLElement;
        return head.getBoundingClientRect().right - el.getBoundingClientRect().right;
      });
      expect(Math.abs(gap), `${width}px で戻るが見出しの行の右端`).toBeLessThanOrEqual(1);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${width}px の横溢れ`).toBeLessThanOrEqual(0);
    }
    await page.setViewportSize(viewBefore);
    await chooseMethod(page, 'チェックアウト', 'ROTI（時間に見合ったか）');
    for (const p of [page, b]) {
      await expect(p.getByRole('heading', { level: 2, name: 'この時間、使った分の価値はありましたか？' })).toBeVisible();
      await expect(visibilityButton(p, '匿名')).toHaveAttribute('aria-pressed', 'true');
      await expect(visibilityButton(p, '匿名')).toBeEnabled();
      await expect(visibilityButton(p, '名前つき')).toBeEnabled();
    }
    const idA = selfIdOf(framesA);
    const markBeforePlay = framesB.payloads.length;

    // A が「4」を出す。出した後は、A・B の公開の仕方のボタンが押せない（E7）
    await handCard(page, '4').click();
    await expect(b.getByText('1 / 2 人が出しました', { exact: true })).toBeVisible();
    for (const p of [page, b]) {
      await expect(visibilityButton(p, '匿名')).toBeDisabled();
      await expect(visibilityButton(p, '名前つき')).toBeDisabled();
    }

    // 開く前の B のフレーム: A の札は載っていない。席は id・名前・出したかだけで、B 自身の札は null
    const before = checkinViews(framesB, markBeforePlay);
    expect(before.length, '出した後に B が受けた checkin フレーム').toBeGreaterThan(0);
    for (const view of before) {
      const round = view['round'] as Record<string, unknown>;
      expect(Object.keys(round).sort(), '開く前の回の鍵（余分な鍵が増えたら落ちる）').toEqual(
        ['playedCount', 'playerCount', 'seats', 'seq', 'status', 'visibility', 'locked', 'method', 'yourCard'].sort(),
      );
      expect(round['status'], '開く前').toBe('open');
      expect(round['yourCard'], 'B はまだ出していない').toBeNull();
      expect('piles' in round, '開く前に山は無い').toBe(false);
      for (const seat of round['seats'] as Array<Record<string, unknown>>) {
        expect(Object.keys(seat).sort(), '席は札を持たない').toEqual(['id', 'name', 'played']);
      }
    }
    // A が出したことは席の played に載っている（札の中身ではなく出したかどうかだけ）
    expect(
      before.some((v) => {
        const seats = (v['round'] as { seats: Array<{ id: string; played: boolean }> }).seats;
        return seats.find((s) => s.id === idA)?.played === true;
      }),
      'A が出したことがフレームの席に入っている',
    ).toBe(true);
    const markReveal = framesB.payloads.length;

    // A が「待たずに開く」→ 両方開く（E4）
    await page.getByRole('button', { name: '待たずに開く', exact: true }).click();
    for (const p of [page, b]) {
      await expect(p.locator('.piles')).toBeVisible();
      await expect(pile(p, '4').locator('.pile-count')).toContainText('1');
      await expect(p.locator('.pile-chip'), '匿名の山に名前は出ない').toHaveCount(0);
    }

    // 開いた後の B のフレーム: 山は札と枚数だけで、A の参加者 ID も名前も山に無く、自分の札の鍵も持たない
    const after = checkinViews(framesB, markReveal).filter((v) => (v['round'] as Record<string, unknown>)['status'] === 'revealed');
    expect(after.length, '開いた後に B が受けた checkin フレーム').toBeGreaterThan(0);
    for (const view of after) {
      const round = view['round'] as Record<string, unknown>;
      expect(Object.keys(round).sort(), '開いた後の回の鍵（yourCard・names 等の余分な鍵が無い）').toEqual(
        ['locked', 'method', 'piles', 'seats', 'seq', 'status', 'visibility'].sort(),
      );
      expect('yourCard' in round, '匿名で開いた後は yourCard の鍵が無い').toBe(false);
      for (const seat of round['seats'] as Array<Record<string, unknown>>) {
        expect(Object.keys(seat).sort(), '開いた後の席も札を持たない').toEqual(['id', 'name', 'played']);
      }
      const piles = round['piles'] as Array<Record<string, unknown>>;
      expect(piles.reduce((n, p) => n + (p['count'] as number), 0), '山の枚数の合計').toBe(1);
      for (const p of piles) {
        expect(Object.keys(p).sort(), '山は札と枚数だけ（names の鍵が無い）').toEqual(['card', 'count']);
      }
      const pilesJson = JSON.stringify(piles);
      expect(pilesJson.includes(idA), 'A の参加者 ID が山に無い').toBe(false);
      expect(pilesJson.includes(NAME_A), 'A の名前が山に無い').toBe(false);
    }

    // When / Then その5（E9）: もう一回 → B が「見学する」→ B の手札が消え、A の分母が減る
    await page.getByRole('button', { name: 'もう一回', exact: true }).click();
    await expect(page.getByText('0 / 2 人が出しました', { exact: true })).toBeVisible();
    await b.getByRole('button', { name: '見学する', exact: true }).click();
    await expect(b.getByRole('group', { name: 'あなたの札' })).toHaveCount(0);
    await expect(b.getByText('見学中です。札は出しません。')).toBeVisible();
    await expect(page.getByText('0 / 1 人が出しました', { exact: true })).toBeVisible();

    // Then 最後: どちらのコンソールにもエラーが出ていない
    expect(consoleWatcher.errors).toEqual([]);
    expect(peer.console.errors).toEqual([]);
  });
});
