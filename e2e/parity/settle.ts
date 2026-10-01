/**
 * 幅を変えた後の落ち着きの待ちと、先頭へのスクロールの戻し（#321）。
 *
 * 比較の本体（`timer.parity.ts`）と除去検査（`removal.parity.ts`）が同じ待ちを通す。どちらも幅を変えた直後の揺れを
 * 読むと、片側だけ前の幅の値を読む（比較）・クラスを外す前後の読み値が揺れる（除去検査）。
 * **テストのファイルから export しない**ために、ここへ置く（テストのファイルを import すると、その test が登録される）。
 */
import { expect, type Locator, type Page } from '@playwright/test';
import type { RafWindow } from './context';

/**
 * 幅を変えた後、レイアウトと計算済みスタイルが新しい幅に落ち着くまで待つ。
 *
 * **待たずに読むと、前の幅の値を読む**（実測: history-empty の 640 で、片側だけ 360 の `font-size` が出た）。
 * 条件は 3 つ: (a) `clientWidth` が目的の幅と一致する、(b) 走っている CSS の遷移が無い、(c) 本物の rAF を 2 回
 * 待ってから、ルート要素と目印の要素の `font-size` と `width`、ページ全体の配置の指紋を読み、続けてもう一度
 * 読んで同じ値である。指紋は全要素の外接矩形の left・top・width・height の和。
 *
 * 撮る前に先頭へスクロールを戻す（`scrollToTop`）。確認のダイアログ（`fixed inset-0`）は、全画面の撮影でも
 * スクロールの位置に描かれるので、スクロールの量が両側で違うと、ダイアログの高さがずれて写った（実測）。
 * ダイアログを開いた状態は、開くボタンにフォーカスを載せずに開く（ページ自身がスクロールを戻すため・`states.ts` の
 * `openDialogWithoutFocus`）。
 *
 * **rAF は退避した本物を使う。** `page.clock` を止めた状態ではページの rAF も止まる（実測）。
 */
export async function settleAtWidth(page: Page, width: number, marker: Locator): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.clientWidth), { message: `clientWidth が ${width} にならない` })
    .toBe(width);
  // **走っている CSS の遷移を終わらせる。** `transition-all` を持つ要素は、幅で変わる `font-size` を遷移させる。
  // `reduce` の下でも 0.01ms の遷移は残り、描画を飛ばされる部分木（閉じた `<details>` の中身）では
  // それが進まず、前の幅の値のまま読めた（実測）。しかもその部分木ではスタイルが読まれた瞬間に初めて遷移が
  // 始まるので、先に全要素のスタイルを読ませてから終わらせる。終えるたびに次が始まりうるので、無くなるまで繰り返す
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          for (const el of Array.from(document.querySelectorAll('*'))) void getComputedStyle(el).fontSize;
          const running = document.getAnimations().filter((a) => a instanceof CSSTransition);
          for (const transition of running) transition.finish();
          return running.length;
        }),
      { message: `${width}px で CSS の遷移が終わらない` },
    )
    .toBe(0);
  const read = (): Promise<string> =>
    marker.evaluate(async (el) => {
      const raf = (window as unknown as RafWindow).__parityRaf;
      await new Promise<void>((resolve) => raf(() => raf(() => resolve())));
      const root = getComputedStyle(document.documentElement);
      const own = getComputedStyle(el);
      // 配置の指紋: 幅で変わる寸法を JS の状態で決める要素がある（計器の `useViewportWidth`・`useIsWide`）。
      // 目印だけを見ると、その再描画の前に読んでしまう（実測: 計器の `margin` が片側だけ前の幅の値だった）
      // 大きさだけでなく位置（left / top）も足す。大きさが同じまま位置だけ動く変化（中央寄せの余白など）を見逃さない
      let extent = 0;
      for (const node of Array.from(document.querySelectorAll('body *'))) {
        const rect = node.getBoundingClientRect();
        // 位置は文書に対する座標で足す（スクロールの量で指紋が変わらないように）
        extent += rect.width + rect.height + rect.left + window.scrollX + rect.top + window.scrollY;
      }
      return [root.fontSize, root.width, own.fontSize, own.width, document.documentElement.scrollHeight, extent.toFixed(2)].join(
        ' | ',
      );
    });
  await expect
    .poll(
      async () => {
        const first = await read();
        const second = await read();
        return first === second ? 'stable' : `${first} → ${second}`;
      },
      { message: `${width}px でスタイルが落ち着かない` },
    )
    .toBe('stable');
}

/**
 * 先頭へスクロールを戻す（`settleAtWidth` の注記）。戻したことを確かめる。
 *
 * 幅を変えた直後の再描画がスクロールを動かしうる（`states.ts` の `openDialogWithoutFocus`）。そのため落ち着いた後に呼び、戻すことと確かめることを 1 回の読みで行う。
 */
export async function scrollToTop(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          window.scrollTo(0, 0);
          const raf = (window as unknown as RafWindow).__parityRaf;
          await new Promise<void>((resolve) => raf(() => raf(() => resolve())));
          return window.scrollY;
        }),
      { message: '先頭へ戻らない' },
    )
    .toBe(0);
}
