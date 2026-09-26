/**
 * 見た目を作り替えても落としてはいけないもの（#78 やること 5）。
 *
 * **タグを付けない（`local` 専用）。** `e2e/tests/spec-tags.test.ts` の
 * `PRODUCTION_TAGS` は `@smoke` / `@core` だけで、未知のタグを足すとそちらが落ちる。
 * ここで見るのはスタイルの健全性で、本番のルーム枠を消費して確かめる種類のものでもない。
 *
 * 実ブラウザでしか見られないものだけを置く。
 * - `prefers-reduced-motion` の追従 … jsdom はメディアクエリも CSS カスケードも評価しない
 * - フォーカス可視化 … `:focus-visible` の実描画
 * - コントラスト比 … 実際に適用された色は `getComputedStyle` でしか取れない
 * - 書体のドリフト … 実際に何が取得されたかはネットワークを見るしかない
 *
 * 色だけで状態を伝えていないことは、DOM とテキストで足りるので
 * `apps/timer-web/test/ui/color-only-invariants.test.tsx` が担当する。
 */
import type { Page } from '@playwright/test';
import { expect, test, type Peer } from '../fixtures/test';
import { createRoom, joinAsDriver, lobbyRotationRow } from '../support/timer';
import { expectFocusVisibleOnTab, expectPickerInPage, expectReadable, pairKey, resolveColors, scanContrast } from '../support/a11y';
import { joinTopicTool, setTopic } from '../support/topic';

const HOST = 'a11y-a';
/** 輪の 2 人目以降。周回アバターが**最も薄い字を felt-700 の面に置くのは 3 人目から**（#297）。 */
const GUESTS = ['a11y-b', 'a11y-c'] as const;

/** 3 人のドライバーが輪に並んだロビーを作る。**並んだことまで待つ。** */
async function createRoomOfThree(page: Page, openPeer: (label: string) => Promise<Peer>): Promise<string> {
  const code = await createRoom(page, HOST);
  for (const [i, name] of GUESTS.entries()) {
    const guest = await openPeer(name);
    await joinAsDriver(guest.page, code, name);
    await expect(lobbyRotationRow(page, name, i + 2)).toBeVisible();
  }
  return code;
}

/** 同じルームのお題ツールでお題を掲げ、**timer の画面に札が出るまで待つ**（#91 PR 3）。 */
async function raiseTopic(page: Page, openPeer: (label: string) => Promise<Peer>, code: string): Promise<void> {
  const topicTool = await openPeer('a11y-topic');
  await joinTopicTool(topicTool.page, `/?room=${encodeURIComponent(code)}`, 'a11y-d');
  // 文面は書体の常用の層に収まるもの（`topic.spec.ts` と同じ）
  await setTopic(topicTool.page, 'FizzBuzz', '3 のときは Fizz を出す');
  await expect(page.getByRole('region', { name: 'お題', exact: true })).toContainText('3 のときは Fizz を出す');
}

test.describe('動きを抑える設定に追従する', () => {
  test('Given reduced-motion を有効にした利用者 / When セッションを開く / Then 演出が止まる', async ({
    page,
  }) => {
    // Given
    await page.emulateMedia({ reducedMotion: 'reduce' });

    // When
    await createRoom(page, HOST);
    await page.getByRole('button', { name: 'セッションを開始' }).click();
    await expect(page.getByRole('timer')).toBeVisible();

    // Then その1: 秒針は「止める」のではなく消す（凍った針が残ると誤読される）。
    //   **`toHaveCount(0)` では落ちない。** CSS は `display: none` にするだけで
    //   要素は DOM に残るため、件数は 1 のまま（実測）。可視性そのものを見る
    const hand = page.locator('.chrono-hand');
    await expect(hand, '秒針の要素が見当たらない（判定が空振りする）').toHaveCount(1);
    await expect(hand).toBeHidden();

    // Then その2: **animation を持つ要素が 1 つ以上あり**、そのすべてが実質 0 秒。
    //   件数を先に固定しないと、演出が丸ごと消えた画面でも「全部 0 秒」で通ってしまう
    const durations = await page.evaluate(() =>
      Array.from(document.querySelectorAll('*'))
        .map((el) => getComputedStyle(el).animationDuration)
        .filter((d) => d !== '' && d !== 'auto'),
    );
    expect(durations.length).toBeGreaterThan(0);
    for (const d of durations) {
      expect(Number.parseFloat(d), `animation-duration=${d}`).toBeLessThan(0.05);
    }
  });
});

test.describe('キーボードのフォーカスが必ず見える', () => {
  test('Given 玄関の入力画面 / When Tab で送る / Then 当たった操作要素に輪郭が出る', async ({
    page,
  }) => {
    // Given: **玄関を直接開く**（#95 S5c・R9）。
    //   `/timer/` のままにしてはいけない —— 旧入口を撤去した後は玄関へ送り返される
    //   ので、**送り返しが壊れても玄関にも「ルームを作る」があり、緑のまま通る**。
    //   送り返しそのものは `timer.spec.ts` の専用シナリオが見る
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'ルームを作る' })).toBeVisible();

    // **「輪郭や影が出ているか」を単体で見てはいけない。** 主操作ボタンは装飾として
    // 常時 `box-shadow` を持つので、`boxShadow !== 'none'` は当てても当てなくても真になり、
    // グローバルの `:focus-visible` を丸ごと消しても緑のまま通った（実測）。
    // **当てた時と当てていない時で見た目が変わること**を判定する。
    //
    // この判定が見るのは「フォーカスが見えるか」であって「うちのリングが出ているか」
    // ではない。**著者のリングを消してもブラウザ既定の輪郭が出れば通る**（実測）。
    // a11y の要件としてはそれで足り、危険な壊れ方（`outline: none` にして代替を
    // 置かない）では実際に落ちることを変異で確認してある。
    // 「うちのリングであること」まで縛りたくなったら、色まで比べる形へ広げる。
    await expectFocusVisibleOnTab(page);
  });
});

test.describe('プルダウンが白く光らない', () => {
  test('Given ロビー / When 通知音のプルダウンを開く / Then 一覧がページの中に卓の地で開く', async ({ page }) => {
    // Given
    await createRoom(page, HOST);
    // When / Then（#317：別の窓で開くと、開いた一瞬が白く光る）
    await expectPickerInPage(page.getByLabel('通知音', { exact: true }), '--panel-2');
  });
});

test.describe('文字が背景に対して読める（WCAG AA）', () => {
  test('Given 3 人のロビー / When ロビーを測る / Then すべて AA を満たす', async ({
    page,
    openPeer,
  }) => {
    // Given: **ロビーも測る**（#297）。真鍮の「ドライバーN」（`--signal` を `--signal-tint`
    //   越しに felt-700 に置く・4.62:1）はロビーにしか出ず、セッションだけの走査では
    //   誰も見ていなかった。
    //   **お題を掲げてから測る**（#91 PR 3）。ロビーはタブの無い 1 画面になり、お題の札
    //   （見出し・タイトル・Markdown の本文）が最上部に出る。その色の組も測る対象に入れる
    const code = await createRoomOfThree(page, openPeer);
    await raiseTopic(page, openPeer, code);
    const [signal, signalTint, panel2] = await resolveColors(page, ['--signal', '--signal-tint', '--panel-2']);

    // When
    const scan = await scanContrast(page);

    // Then
    expectReadable(scan, 10, [pairKey(signal!, `${signalTint!} ← ${panel2!}`)]);
  });

  test('Given 3 人のセッション中の画面 / When 主要な文字を測る / Then すべて AA を満たす', async ({
    page,
    openPeer,
  }) => {
    // Given: **3 人で始める**（#297）。最も薄い字（`--bone-subtle` ＝ `--ivory-faint`）が
    //   最も明るい面（`--panel-2` ＝ `--felt-700`）に乗る箇所は 3 つあり、出る人数が違う。
    //   共有メモの空表示は 1 人から、交代の列（`RotationLineup`）の時刻ラベルは
    //   「次」の人から＝ 2 人から、周回アバター（`TeamOrbit`）は「次」の人を明るい字で
    //   描くので「現でも次でもない人」＝ **3 人目からしか出ない**。3 つとも測るために 3 人にする
    await createRoomOfThree(page, openPeer);
    await page.getByRole('button', { name: 'セッションを開始' }).click();
    await expect(page.getByRole('timer')).toBeVisible();
    // 余裕の薄い組: 最も薄い字 × 最も明るい面（4.52:1）。
    //   翡翠の「初級」（`--ok` を `--ok-tint` 越しに felt-800 に置く・4.61:1）は固定から外した。
    //   #91 PR 3 で難易度バッジごと撤去した。この色の組はもう timer に出ない
    const [subtle, panel2] = await resolveColors(page, ['--bone-subtle', '--panel-2']);

    // When
    const scan = await scanContrast(page);

    // Then
    expectReadable(scan, 15, [pairKey(subtle!, panel2!)]);
  });
});

test.describe('書体は常用の層だけを取る', () => {
  test('Given 初回訪問 / When 玄関からセッションまで進む / Then 拡張の字形を取りにいかない', async ({
    page,
  }) => {
    // Given（何を取得したかを記録する）
    const fonts: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (url.endsWith('.woff2')) fonts.push(url.split('/').pop() ?? url);
    });

    // When
    await createRoom(page, HOST);
    await page.getByRole('button', { name: 'セッションを開始' }).click();
    await expect(page.getByRole('timer')).toBeVisible();

    // Then その1: **何かは取っている。** 0 件だと下の否定が空振りで通る
    expect(fonts.length, `書体を 1 つも取っていない（${fonts.join(', ')}）`).toBeGreaterThan(0);

    // Then その2: 拡張の層（利用者名の漢字用・約 210 KB）を引いていない。
    //   UI 文言に base 層へ入っていない字を足すと、ここが赤くなる
    const ext = fonts.filter((f) => f.includes('-ext-') || f.includes('-ext.'));
    expect(ext, `常用の層に無い字が画面に出ている（${ext.join(', ')}）`).toEqual([]);

    // Then その3: **取りにいった書体が、書体として読めている**（#297）。
    //   URL を数えるだけでは、`url()` が解決されずに SPA の HTML が返っていても緑になる
    //   （実際に timer は書体を 1 本も読めておらず、上の 2 つは緑のままだった）。
    //   読めなかった面は `status` が `error` になる。読めた面が 1 つ以上あることも固定する
    const faces = await page.evaluate(async () => {
      await document.fonts.ready;
      return Array.from(document.fonts)
        .filter((face) => face.status !== 'unloaded')
        .map((face) => `${face.family} ${face.weight} ${face.status}`);
    });
    expect(faces.filter((f) => f.endsWith(' error')), `読めなかった書体（${faces.join(', ')}）`).toEqual([]);
    expect(faces.filter((f) => f.endsWith(' loaded')).length, `読めた書体が無い（${faces.join(', ')}）`).toBeGreaterThan(0);
  });
});
