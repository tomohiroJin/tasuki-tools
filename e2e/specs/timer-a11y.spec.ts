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
import { expect, test } from '../fixtures/test';
import { createRoom } from '../support/timer';
import {
  composite,
  contrastRatio,
  effectiveBackground,
  parseColor,
  requiredRatio,
  sampleInPage,
} from '../support/contrast';

const HOST = 'a11y-a';

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
    // Given
    await page.goto('/timer/');
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
    const seen: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => {
        const el = document.activeElement;
        if (el === null || el === document.body) return null;
        const style = (target: Element) => {
          const s = getComputedStyle(target);
          return `${s.outlineStyle}|${s.outlineWidth}|${s.outlineColor}|${s.boxShadow}`;
        };
        const withFocus = style(el);
        // 一時的にフォーカスを外し、同じ要素の見た目を測ってから戻す
        (el as HTMLElement).blur();
        const withoutFocus = style(el);
        (el as HTMLElement).focus();
        return {
          tag: el.tagName.toLowerCase(),
          name: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 24),
          withFocus,
          withoutFocus,
        };
      });
      if (focused === null) continue;
      seen.push(`${focused.tag}(${focused.name})`);

      expect(
        focused.withFocus,
        `${focused.tag}(${focused.name}) はフォーカスの有無で見た目が変わらない`,
      ).not.toBe(focused.withoutFocus);
    }

    // **実際に操作要素を通ったことを固定する。** 何にも当たらないまま
    // ループが空回りすると、上の判定は 1 度も走らずに緑になる
    expect(seen.length, `Tab で操作要素に当たらなかった（${seen.join(', ')}）`).toBeGreaterThan(1);
  });
});

test.describe('文字が背景に対して読める（WCAG AA）', () => {
  test('Given セッション中の画面 / When 主要な文字を測る / Then すべて AA を満たす', async ({
    page,
  }) => {
    // Given
    await createRoom(page, HOST);
    await page.getByRole('button', { name: 'セッションを開始' }).click();
    await expect(page.getByRole('timer')).toBeVisible();

    // When（文字を持つ要素のうち、実際に見えているものを測る）
    const targets = page.locator(
      'button:visible, a:visible, h1:visible, h2:visible, h3:visible, label:visible, p:visible, span:visible',
    );
    const count = await targets.count();
    expect(count, '測る対象が見つからない').toBeGreaterThan(20);

    const failures: string[] = [];
    let measured = 0;
    for (let i = 0; i < count; i += 1) {
      const element = targets.nth(i);
      // 直接の子テキストを持たない入れ物は飛ばす（親子で二重に測らない）
      const own = await element.evaluate((el) =>
        Array.from(el.childNodes)
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent ?? '')
          .join('')
          .trim(),
      );
      if (own === '') continue;

      const sample = await element.evaluate(sampleInPage);
      const fg = parseColor(sample.color);
      const bg = effectiveBackground(sample.backgrounds);
      if (fg === null || bg === null) continue;

      measured += 1;
      // **文字色の α を捨ててはいけない。** `--bone-muted` のように半透明で定義された
      // 文字は、下地に合成して初めて本当の見え方になる。α を無視して不透明扱いすると、
      // 透明度を上げて文字を薄くしても比が変わらず、**どれだけ薄くしても緑になる**（実測）
      const ratio = contrastRatio(composite(fg, bg), bg);
      const required = requiredRatio(sample.fontSize, sample.fontWeight);
      if (ratio < required) {
        failures.push(
          `「${sample.text}」 ${ratio.toFixed(2)}:1（要 ${required}:1・${sample.fontSize}px/${sample.fontWeight}）` +
            ` 文字=${sample.color} 地=${sample.backgrounds.join(' ← ')}`,
        );
      }
    }

    // Then（**測った件数も固定する。** 走査が空振りして 0 件でも緑になるのを防ぐ）
    expect(measured, '1 つも測れていない').toBeGreaterThan(15);
    expect(failures, `AA を満たさない文字が ${failures.length} 件`).toEqual([]);
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
  });
});
