/**
 * a11y の測り方（コントラスト比・フォーカス可視化）の共通支援（#91 PR 2）。
 *
 * 元は `timer-a11y.spec.ts` に直書きしていたものを、お題ツールの E2E からも
 * 使えるように移した（振る舞いは変えていない）。
 */
import { expect, type Page } from '@playwright/test';
import { describePaint, groundLayers, measureSample, sampleInPage } from './contrast';

/** 走査の結果。`pairs` は測った字の「文字色 on 地」の集合で、特定の組を測ったかの固定に使う。 */
export interface ContrastScan {
  readonly failures: string[];
  readonly unmeasurable: string[];
  readonly measured: number;
  readonly pairs: ReadonlySet<string>;
}

/** 字と地の組を 1 本の文字列にする。**走査と固定の両方がこの形で比べる。** */
export function pairKey(ink: string, ground: string): string {
  return `${ink} on ${ground}`;
}

/**
 * トークン（`var(--*)`）を画面上で解いて、計算値の色にする。
 * **テストへ色の数値を直書きしない** —— パレットを動かしたら一緒に動く。
 */
export async function resolveColors(page: Page, tokens: readonly string[]): Promise<string[]> {
  return page.evaluate((list) => {
    const probe = document.createElement('div');
    document.body.append(probe);
    const resolved = list.map((token) => {
      probe.style.color = `var(${token})`;
      return getComputedStyle(probe).color;
    });
    probe.remove();
    return resolved;
  }, tokens);
}

/**
 * 文字を持つ要素のうち、実際に見えているものを測る。
 *
 * `minTargets` は測る要素の数の下限（既定 20）。お題ツールの画面のように timer より
 * 要素が少ない画面では下げて渡す。
 */
export async function scanContrast(page: Page, minTargets = 20): Promise<ContrastScan> {
  // **登場の演出が終わるのを待つ。** 周回アバターは `scale(0)` から現れるので、
  //   途中で掴むと箱が 0 で `:visible` から外れる（実測: 3 回中 1 回読み飛ばした）。
  //   回り続ける演出は終わらないので、回数に限りがあるものだけを待つ
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );

  const targets = page.locator(
    'button:visible, a:visible, h1:visible, h2:visible, h3:visible, label:visible, p:visible, span:visible',
  );
  // **走査の対象は最初に 1 度だけ掴む。** `targets.nth(i)` は呼ぶたびに引き直すので、
  //   走査の途中で見えている集合が変わると添字がずれ、末尾の要素がこぼれる。
  //   実測（#297）: 1 人のセッションで共有メモの空表示（4.52:1 の組）を 3 回中 2 回
  //   読み飛ばし、`--ivory-faint` の α を 0.64 に下げても緑になっていた
  const elements = await targets.elementHandles();
  expect(elements.length, '測る対象が見つからない').toBeGreaterThan(minTargets);

  const failures: string[] = [];
  const unmeasurable: string[] = [];
  const pairs = new Set<string>();
  let measured = 0;
  for (const element of elements) {
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
    // **文字色の α を捨ててはいけない。** `--bone-muted` のように半透明で定義された
    // 文字は、下地に合成して初めて本当の見え方になる。α を無視して不透明扱いすると、
    // 透明度を上げて文字を薄くしても比が変わらず、**どれだけ薄くしても緑になる**（実測）。
    // 下地がグラデーションなら停止点のうち一番不利なところで測る（#279）
    const measurement = measureSample(sample);
    const ground = groundLayers(sample.backgrounds).map(describePaint).join(' ← ');
    if (measurement === null) {
      // **黙って飛ばさない。** 飛ばすと「測れていないのに緑」に戻る
      unmeasurable.push(`「${sample.text}」 文字=${describePaint(sample.ink)} 地=${ground}`);
      continue;
    }

    measured += 1;
    pairs.add(pairKey(sample.ink.color, ground));
    const { ratio, required } = measurement;
    if (ratio < required) {
      failures.push(
        `「${sample.text}」 ${ratio.toFixed(2)}:1（要 ${required}:1・${sample.fontSize}px/${sample.fontWeight}）` +
          ` 文字=${describePaint(sample.ink)} 地=${ground}`,
      );
    }
  }
  return { failures, unmeasurable, measured, pairs };
}

/**
 * 走査の結果を判定する。`thinnest` は**余裕がいちばん薄い組**で、それを 1 件以上
 * 測ったことも固定する（#297）。画面の作りが変わってその組が消えると、
 * AA の判定は緑のまま、パレットが主張する最小値を見なくなる。
 */
export function expectReadable(scan: ContrastScan, minMeasured: number, thinnest: readonly string[]): void {
  // Then（**測った件数も固定する。** 走査が空振りして 0 件でも緑になるのを防ぐ）
  //   件数の判定は最後に置く。先に置くと、下地が読めなくなったときに
  //   「1 つも測れていない」だけが出て、**理由を説明する一覧が出ない**
  expect(scan.unmeasurable, `下地か字の色を決められない文字が ${scan.unmeasurable.length} 件`).toEqual([]);
  expect(scan.failures, `AA を満たさない文字が ${scan.failures.length} 件`).toEqual([]);
  // 薄い組の欠けも「理由を説明する一覧」なので、件数より前に置く
  const missing = thinnest.filter((pair) => !scan.pairs.has(pair));
  expect(missing, `余裕の薄い組を測っていない（測った組: ${[...scan.pairs].join(' / ')}）`).toEqual([]);
  expect(scan.measured, '1 つも測れていない').toBeGreaterThan(minMeasured);
}

/**
 * キーボードのフォーカスが必ず見えることを確かめる。
 *
 * **「輪郭や影が出ているか」を単体で見てはいけない。** 主操作ボタンは装飾として
 * 常時 `box-shadow` を持つので、`boxShadow !== 'none'` は当てても当てなくても真になり、
 * グローバルの `:focus-visible` を丸ごと消しても緑のまま通った（実測）。
 * **当てた時と当てていない時で見た目が変わること**を判定する。
 *
 * この判定が見るのは「フォーカスが見えるか」であって「うちのリングが出ているか」
 * ではない。**著者のリングを消してもブラウザ既定の輪郭が出れば通る**（実測）。
 * a11y の要件としてはそれで足り、危険な壊れ方（`outline: none` にして代替を
 * 置かない）では実際に落ちることを変異で確認してある。
 * 「うちのリングであること」まで縛りたくなったら、色まで比べる形へ広げる。
 */
export async function expectFocusVisibleOnTab(page: Page, presses = 6): Promise<void> {
  const seen: string[] = [];
  for (let i = 0; i < presses; i += 1) {
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
}
