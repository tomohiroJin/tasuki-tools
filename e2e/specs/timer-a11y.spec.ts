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
import { expectFieldsAtLeast16px, expectFocusVisibleOnTab, expectPickerInPage, expectReadable, pairKey, resolveColors, scanContrast } from '../support/a11y';
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
    await expectFieldsAtLeast16px(page);

    // When / Then: 話者のプルダウン（カウントダウン方式を「音声読み上げ」にしたときだけ出る）も同じ
    //   （NotifySettingsPanel.tsx: countdownEnabled → countdownMode='voice' の順で出す）
    await page.getByRole('switch', { name: '交代前にカウントダウン音を鳴らす' }).click();
    await page.getByLabel('音声読み上げ').check();
    await expectPickerInPage(page.getByLabel('読み上げ話者', { exact: true }), '--panel-2');
    await expectFieldsAtLeast16px(page);
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

  test('Given 3 人のセッション中の画面 / When 主要な文字と「途中で終える」の確認ダイアログを測る / Then すべて AA を満たし、ダイアログは取り消しにフォーカスが来る', async ({
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

    // 共有メモ（暗い面）の Markdown（#316 PR 4）。部品の `.ui-md-*` は象牙の札向けの既定を持つので、
    // 暗い面では置く側（`.shared-memo-preview`）がつまみで枠とリンクの色を宣言する。同じセッションで続けて測る
    //   （ルームを足さない）。リンク・インラインコード・引用・コードブロックを含む本文を書いて、プレビューに戻す
    await page.getByRole('button', { name: '編集', exact: true }).click();
    await page.getByLabel('共有メモ', { exact: true }).fill(
      '# 見出し\n\n本文に[リンク](https://example.com)と`code`を含む。\n\n> 引用の行\n\n```\nconst a = 1;\n```',
    );
    await page.getByRole('button', { name: 'プレビューに戻る' }).click();
    const preview = page.locator('.shared-memo-preview');
    await expect(preview.locator('.ui-md'), '共有メモのプレビューが部品の .ui-md で描かれていない').toHaveCount(1);
    await expect(preview.locator('.ui-md-link, .ui-md-code, .ui-md-quote, .ui-md-pre')).toHaveCount(4);
    const [signal, boneMuted, coalSoft] = await resolveColors(page, ['--signal', '--bone-muted', '--coal-soft']);
    const memoScan = await scanContrast(page);
    //   （空表示の組はメモを書くと消えるので、余裕の薄い組の固定は上の走査が担う）
    expectReadable(memoScan, 15, []);
    // 走査が実際にプレビューの文字を測った: リンク（--signal）と本文（--bone-muted）の組がある
    //   （走査は `<p>`・`<a>`・`<h3>` などを測る。`<div>` 直下の文字は測らないので、組の有無で空振りを見る）
    expect([...memoScan.pairs].some((k) => k.startsWith(`${signal!} on`)), 'リンクの字（--signal）を測っていない').toBe(true);
    expect([...memoScan.pairs].some((k) => k.startsWith(`${boneMuted!} on`)), '本文の字（--bone-muted）を測っていない').toBe(true);
    // 枠は暗い地で読める色（--hairline-strong）。部品の既定の --coal-soft（暗い地で約 2:1）のままではない
    const edges = await preview.evaluate((el) => {
      const probe = document.createElement('div');
      probe.style.borderTop = '1px solid var(--coal-soft)';
      el.append(probe);
      const coal = getComputedStyle(probe).borderTopColor;
      probe.remove();
      const border = (sel: string, side: 'Top' | 'Left') => {
        const target = el.querySelector(sel)!;
        return getComputedStyle(target)[`border${side}Color`];
      };
      return { coal, code: border('.ui-md-code', 'Top'), pre: border('.ui-md-pre', 'Top'), quote: border('.ui-md-quote', 'Left') };
    });
    expect(edges.coal, '--coal-soft を解けない').toBe(coalSoft);
    for (const part of ['code', 'pre', 'quote'] as const) {
      expect(edges[part], `共有メモの ${part} の枠が部品の既定（--coal-soft）のままで、暗い地で読めない`).not.toBe(edges.coal);
    }

    // 危険の確認ダイアログ（#316 PR 3）。同じセッションで続けて測る（E2E 全件が同期サーバーのルーム枠 100 に近く、
    // ルームを足すと末尾のテストが「操作を完了できませんでした」で落ちる。`buttons.spec.ts` 冒頭の注釈）。
    // When: 「途中で終える」を押す。危険の確定（`ui-button--danger`・字 `--rose-bright`）はダイアログの面（`--panel`）に載る
    await page.getByRole('button', { name: /途中で終える/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // Then: 最初のフォーカスは安全側（取り消し）
    await expect(dialog.getByRole('button', { name: 'キャンセル' })).toBeFocused();
    // Then: 朱の枠の確定が測られ、AA を満たす（走査は画面全体。ダイアログの外も同じ基準）
    const confirm = dialog.locator('.ui-button--danger');
    await expect(confirm, '朱の枠の確定ボタンが無い（判定が空振りする）').toHaveCount(1);
    //   朱の字（`--rose-bright`）がダイアログの面（`--panel`）に載る組を測ったことも固定する
    const [rose, panel] = await resolveColors(page, ['--rose-bright', '--panel']);
    expectReadable(await scanContrast(page), 10, [pairKey(rose!, panel!)]);
    // Then: ホバーの敷き（`--rose-tint`）の上でも字が AA（敷きは半透明なので、ダイアログの面に重ねて測る）
    await confirm.hover();
    const hoverRatio = await confirm.evaluate((el) => {
      const parse = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number);
      const lin = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      const lum = (c: number[]) => 0.2126 * lin(c[0]!) + 0.7152 * lin(c[1]!) + 0.0722 * lin(c[2]!);
      const fg = parse(getComputedStyle(el).color);
      const tint = parse(getComputedStyle(el).backgroundColor);
      let base = el.parentElement;
      let under = [0, 0, 0];
      while (base) {
        const b = parse(getComputedStyle(base).backgroundColor);
        if (b.length === 3 || (b.length === 4 && b[3] === 1)) { under = b.slice(0, 3); break; }
        base = base.parentElement;
      }
      const a = tint[3] ?? 1;
      const bg = [0, 1, 2].map((i) => tint[i]! * a + under[i]! * (1 - a));
      const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x);
      return (hi! + 0.05) / (lo! + 0.05);
    });
    expect(hoverRatio, '朱の枠の確定のホバーの字が AA（4.5:1）を割る').toBeGreaterThanOrEqual(4.5);
    // Then: 朱の枠の確定もキーボードのフォーカスが見える
    await page.keyboard.press('Tab');
    await expect(confirm).toBeFocused();
    const ringed = await confirm.evaluate((el) => getComputedStyle(el).outlineStyle !== 'none');
    expect(ringed, '朱の枠の確定にフォーカスの輪郭が出ていない').toBe(true);
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
