/**
 * 基準（`ba9249d`）とブランチを状態ごと・幅ごとに並べる（#321・設計正本 §5）。
 *
 * 1 つの状態につき、側ごとに新しいブラウザの文脈で状態を 1 回作り、幅を変えながら撮る（計画 P2）。
 * 読み方は 2 通り: `no-preference` で動きのプロパティとキーフレーム、`reduce` で全プロパティと画素。
 * `reduce` の読みの後、1280px で操作の状態（ホバー・押下・フォーカス）を書き出す（`interaction.ts`）。
 * 加えて、タッチの文脈（`hasTouch`・360px）の 1 本を撮る（設計正本 §5.5）。
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { BASE_DIST, type BaseServing } from './base-dist';
import { captureKeyframes, captureMotion, captureStyles } from './capture';
import { newParityContext, type ParitySide, type RafWindow } from './context';
import { diffEntries, diffKeyframes, themeVarNamesFromCss, type StyleDiff, type StyleEntry } from './compare-lib';
import { captureInteractions, type InteractionCapture } from './interaction';
import { NOISE } from './noise';
import { STATES, WIDTHS, type ParityState } from './states';

const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), 'out');
const HEIGHT = 900;
/** 操作の状態を書き出す幅。 */
const INTERACTION_WIDTH = 1280;
/** タッチの文脈の幅（設計正本 §5.5）。 */
const TOUCH_WIDTH = 360;

interface Capture {
  readonly styles: Map<number, StyleEntry[]>;
  readonly screenshots: Map<number, Buffer>;
  readonly motion: StyleEntry[];
  readonly keyframes: Record<string, string>;
  /** 1280px・`reduce` の下での操作の状態の書き出し。 */
  readonly interactions: InteractionCapture;
  /** 基準の dist から返した件数（ブランチの側は 0）。 */
  readonly served: number;
}

/** 基準の dist の CSS から、Tailwind の theme 層の変数の名簿を導く（§5.4 の類 1）。 */
function tailwindThemeVars(): Set<string> {
  const assets = path.join(BASE_DIST, 'assets');
  const css = readdirSync(assets).filter((f) => f.endsWith('.css'));
  const names = new Set<string>();
  for (const f of css) for (const n of themeVarNamesFromCss(readFileSync(path.join(assets, f), 'utf8'))) names.add(n);
  if (names.size === 0) throw new Error('基準の dist から Tailwind の theme 層の変数を 1 つも読めませんでした');
  return names;
}

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
async function settleAtWidth(page: Page, width: number, marker: Locator): Promise<void> {
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
async function scrollToTop(page: Page): Promise<void> {
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

/**
 * 幅を合わせて落ち着かせ、操作の状態を書き出す。**書き出した後に目印がまだ見えることを断定する**
 * （押下や Tab がダイアログを開く・画面を変えるなど、状態を変えてしまう操作が起きていないこと）。
 */
async function captureInteractionsAt(page: Page, state: ParityState, width: number): Promise<InteractionCapture> {
  await page.setViewportSize({ width, height: HEIGHT });
  await expect(state.marker(page)).toBeVisible();
  await settleAtWidth(page, width, state.marker(page));
  await scrollToTop(page);
  const interactions = await captureInteractions(page);
  await expect(state.marker(page), `${state.name}: 操作の書き出しの後に目印が消えた（状態が変わった）`).toBeVisible();
  return interactions;
}

/** 片側にしか無い項目（両側で同じ理由で外したものは差にしない）。 */
function onlyOnOneSide(base: readonly string[], branch: readonly string[]): string[] {
  // 同じ名前が複数ありうる（通知設定はポップオーバーとロビーの札の 2 か所に出る）ので、件数ごと突き合わせる
  const left = new Map<string, number>();
  for (const s of base) left.set(s, (left.get(s) ?? 0) + 1);
  const extra: string[] = [];
  for (const s of branch) {
    const n = left.get(s) ?? 0;
    if (n > 0) left.set(s, n - 1);
    else extra.push(`branch ${s}`);
  }
  for (const [s, n] of left) for (let i = 0; i < n; i += 1) extra.push(`base ${s}`);
  return extra;
}

async function captureSide(browser: Browser, state: ParityState, side: ParitySide): Promise<Capture> {
  const contexts: BrowserContext[] = [];
  const servings: BaseServing[] = [];
  const open = async (): Promise<Page> => {
    const { context, serving } = await newParityContext(browser, side, {
      viewport: { width: 1280, height: HEIGHT },
      reducedMotion: 'no-preference',
    });
    if (serving !== null) servings.push(serving);
    contexts.push(context);
    return context.newPage();
  };
  try {
    const page = await state.setup(open);
    await expect(state.marker(page), `${state.name}（${side}）の目印`).toBeVisible();
    if (side === 'base') {
      const served = servings.reduce((n, s) => n + s.served(), 0);
      expect(served, `${state.name}: 基準の dist から 1 件も返していない`).toBeGreaterThan(0);
      expect(servings.flatMap((s) => s.missing()), `${state.name}: 基準の dist に無い資産を読もうとした`).toEqual([]);
    }

    // 1. no-preference: 動きのプロパティとキーフレーム（静的な値なので揺れない）
    const motion = await captureMotion(page);
    const keyframes = await captureKeyframes(page);

    // 2. reduce: 全プロパティと画素（遷移の途中の値と動く要素の揺れを止める）
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const styles = new Map<number, StyleEntry[]>();
    const screenshots = new Map<number, Buffer>();
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: HEIGHT });
      await expect(state.marker(page)).toBeVisible();
      await settleAtWidth(page, width, state.marker(page));
      await scrollToTop(page);
      // 読む直前に文書全体のレイアウトを作り直す（auto の余白の読み値を決定的にする・`capture.ts` の `relayout`）
      const entries = await captureStyles(page, 'html', { relayout: true });
      expect(entries.length, `${state.name}@${width}（${side}）の要素数`).toBeGreaterThanOrEqual(state.minElements);
      styles.set(width, entries);
      screenshots.set(
        width,
        await page.screenshot({ fullPage: true, animations: 'disabled', mask: state.mask(page) }),
      );
    }

    // 3. 操作の状態: 静止の読みを全部終えてから行う（押下や Tab で残るフォーカス・スクロールを、静止の読みへ持ち込まない）
    const interactions = await captureInteractionsAt(page, state, INTERACTION_WIDTH);
    const served = servings.reduce((n, s) => n + s.served(), 0);
    return { styles, screenshots, motion, keyframes, interactions, served };
  } finally {
    for (const c of contexts) await c.close();
  }
}

const themeVars = tailwindThemeVars();

/** 操作の書き出しの件数（種類ごと）と、外した要素。 */
function interactionSummary(c: InteractionCapture): Record<string, unknown> {
  const count = (kind: string): number => c.entries.filter((e) => e.path.endsWith(`#${kind}`) && e.pseudo === '').length;
  return { hover: count('hover'), active: count('active'), focusVisible: count('focus-visible'), notEntered: c.notEntered, skipped: c.skipped };
}

for (const state of STATES) {
  test(`${state.name}: 基準とブランチが一致する`, async ({ browser }, testInfo) => {
    const base = await captureSide(browser, state, 'base');
    const branch = await captureSide(browser, state, 'branch');

    const options = { tailwindThemeVars: themeVars, ignore: NOISE };
    const report: Record<string, StyleDiff[] | string[]> = {
      motion: diffEntries(base.motion, branch.motion, options),
      keyframes: diffKeyframes(base.keyframes, branch.keyframes),
    };
    for (const width of WIDTHS) {
      report[`styles@${width}`] = diffEntries(base.styles.get(width) ?? [], branch.styles.get(width) ?? [], options);
    }
    report['interactions'] = diffEntries(base.interactions.entries, branch.interactions.entries, options);
    // 状態に入れなかった要素は、両側で同じでも赤にする（入れなかった理由を確かめ、外すなら `interaction.ts` に理由つきで書く）
    report['notEntered'] = [
      ...base.interactions.notEntered.map((s) => `base ${s}`),
      ...branch.interactions.notEntered.map((s) => `branch ${s}`),
    ];
    report['skipped'] = onlyOnOneSide(base.interactions.skipped, branch.interactions.skipped);
    // `--repeat-each` の 2 回目以降は別の置き場へ書く（上書きすると、揺れた回の中身が残らない）
    const dir = path.join(OUT, testInfo.repeatEachIndex === 0 ? state.name : `${state.name}-r${testInfo.repeatEachIndex}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'diff.json'), JSON.stringify(report, null, 2));
    // 撮れた中身の要約（状態を作り損ねていないか・キーフレームを実際に拾えたかを後から読む）
    const summary = (c: Capture): Record<string, unknown> => ({
      served: c.served,
      elements: Object.fromEntries(WIDTHS.map((w) => [w, c.styles.get(w)?.length ?? 0])),
      motionEntries: c.motion.length,
      keyframes: Object.keys(c.keyframes).sort(),
      interactions: interactionSummary(c.interactions),
    });
    writeFileSync(
      path.join(dir, 'summary.json'),
      JSON.stringify({ base: summary(base), branch: summary(branch) }, null, 2),
    );

    // 画素: 基準の画像を snapshot の置き場へ書き、ブランチの画像を照合する（maxDiffPixels: 0）
    for (const width of WIDTHS) {
      const name = `${state.name}-${width}.png`;
      const snapshot = testInfo.snapshotPath(name);
      mkdirSync(path.dirname(snapshot), { recursive: true });
      writeFileSync(snapshot, base.screenshots.get(width) ?? Buffer.alloc(0));
      expect.soft(branch.screenshots.get(width), `画素 ${name}`).toMatchSnapshot(name, { maxDiffPixels: 0 });
    }

    const total = Object.values(report).reduce((n, list) => n + list.length, 0);
    expect(total, `${state.name} の差（${path.join(dir, 'diff.json')}）`).toBe(0);
  });
}

/** タッチの文脈で撮る状態（設計正本 §5.5。`(hover: hover)` が偽になり、`hover:` の規則が効かなくなる）。 */
const TOUCH_STATES = new Set(['lobby-two', 'session-driver']);

interface TouchCapture {
  readonly styles: StyleEntry[];
  readonly interactions: InteractionCapture;
}

async function captureTouchSide(browser: Browser, state: ParityState, side: ParitySide): Promise<TouchCapture> {
  const contexts: BrowserContext[] = [];
  const servings: BaseServing[] = [];
  const open = async (): Promise<Page> => {
    const { context, serving } = await newParityContext(browser, side, {
      viewport: { width: TOUCH_WIDTH, height: HEIGHT },
      hasTouch: true,
      reducedMotion: 'reduce',
    });
    if (serving !== null) servings.push(serving);
    contexts.push(context);
    return context.newPage();
  };
  try {
    const page = await state.setup(open);
    await expect(state.marker(page), `${state.name}（タッチ・${side}）の目印`).toBeVisible();
    if (side === 'base') {
      expect(servings.reduce((n, s) => n + s.served(), 0), `${state.name}（タッチ）: 基準の dist から 1 件も返していない`).toBeGreaterThan(0);
      expect(servings.flatMap((s) => s.missing()), `${state.name}（タッチ）: 基準の dist に無い資産を読もうとした`).toEqual([]);
    }
    expect(await page.evaluate(() => matchMedia('(hover: hover)').matches), 'タッチの文脈で (hover: hover) が真').toBe(false);
    await settleAtWidth(page, TOUCH_WIDTH, state.marker(page));
    await scrollToTop(page);
    const styles = await captureStyles(page, 'html', { relayout: true });
    expect(styles.length, `${state.name}（タッチ・${side}）の要素数`).toBeGreaterThanOrEqual(state.minElements);
    const interactions = await captureInteractionsAt(page, state, TOUCH_WIDTH);
    return { styles, interactions };
  } finally {
    for (const c of contexts) await c.close();
  }
}

for (const state of STATES.filter((s) => TOUCH_STATES.has(s.name))) {
  test(`${state.name}（タッチ・${TOUCH_WIDTH}px）: 基準とブランチが一致する`, async ({ browser }) => {
    const base = await captureTouchSide(browser, state, 'base');
    const branch = await captureTouchSide(browser, state, 'branch');
    const options = { tailwindThemeVars: themeVars, ignore: NOISE };
    const report: Record<string, StyleDiff[] | string[]> = {
      [`styles@${TOUCH_WIDTH}`]: diffEntries(base.styles, branch.styles, options),
      interactions: diffEntries(base.interactions.entries, branch.interactions.entries, options),
      notEntered: [
        ...base.interactions.notEntered.map((s) => `base ${s}`),
        ...branch.interactions.notEntered.map((s) => `branch ${s}`),
      ],
      skipped: onlyOnOneSide(base.interactions.skipped, branch.interactions.skipped),
    };
    const dir = path.join(OUT, `${state.name}-touch`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'diff.json'), JSON.stringify(report, null, 2));
    writeFileSync(
      path.join(dir, 'summary.json'),
      JSON.stringify(
        {
          base: { elements: base.styles.length, interactions: interactionSummary(base.interactions) },
          branch: { elements: branch.styles.length, interactions: interactionSummary(branch.interactions) },
        },
        null,
        2,
      ),
    );
    const total = Object.values(report).reduce((n, list) => n + list.length, 0);
    expect(total, `${state.name}（タッチ）の差（${path.join(dir, 'diff.json')}）`).toBe(0);
  });
}
