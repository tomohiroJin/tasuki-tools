/**
 * 基準（`ba9249d`）とブランチを状態ごと・幅ごとに並べる（#321・設計正本 §5）。
 *
 * 1 つの状態につき、側ごとに新しいブラウザの文脈で状態を 1 回作り、幅を変えながら撮る（計画 P2）。
 * 読み方は 2 通り: `no-preference` で動きのプロパティとキーフレーム、`reduce` で全プロパティと画素。
 * `reduce` の読みの後、1280px で操作の状態（ホバー・押下・フォーカス）を書き出す（`interaction.ts`）。
 * 加えて、タッチの文脈（`hasTouch`・360px）の 1 本を撮る（設計正本 §5.5）。
 *
 * 差のほかに、基準側の要約を期待値（`expected/base-summary.json`・`expected.ts`）と突き合わせる（両側で同じように
 * 空になっても緑にしないため）。各テストの先頭で、`-u` で流していないことを断定する（`context.ts`）。
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Browser, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import { BASE_DIST, type BaseServing } from './base-dist';
import { captureKeyframes, captureMotion, captureStyles } from './capture';
import { assertSnapshotsNotUpdated, newParityContext, type ParityRole } from './context';
import { diffEntries, diffKeyframes, themeVarNamesFromCss, type StyleDiff, type StyleEntry } from './compare-lib';
import { BASE_EXPECTATION_FILE, checkExpectation, expectedKeyProblems, loadExpected } from './expected';
import { captureInteractions, type InteractionCapture } from './interaction';
import { NOISE } from './noise';
import { scrollToTop, settleAtWidth, waitForInviteQr } from './settle';
import { METER_ARC_SELECTOR, SCREENSHOT_STYLE, STATES, WIDTHS, type ParityState } from './states';

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

/** 対照実行の設定（`parity.control.config.ts`）が付ける project の名前。list の行頭に `[対照実行]` と出る。 */
const CONTROL_PROJECT = '対照実行';

/**
 * 対照実行かを設定ファイルから読む（`metadata.parityControl`・環境変数は読まない・`context.ts`）。
 * project の名前（行頭の明記）と食い違ったら止める（片方だけ書き換えた設定で、明記と中身がずれないように）。
 */
function isControlRun(testInfo: TestInfo): boolean {
  const control = testInfo.config.metadata['parityControl'] === true;
  if (control !== (testInfo.project.name === CONTROL_PROJECT)) {
    throw new Error(`metadata.parityControl（${String(control)}）と project の名前（${testInfo.project.name}）が食い違う`);
  }
  return control;
}

/**
 * 側ごとに、基準の dist を配ったかを断定する。
 *
 * - 基準の dist を配る側（基準・対照実行のブランチ）: 1 件以上返し、dist に無い資産を読もうとしていない
 * - 通常の比較のブランチ: 文脈に基準の dist の経路が 1 つも掛かっていない（ブランチのビルドを撮っている）
 */
function assertServing(name: string, role: ParityRole, servings: readonly BaseServing[]): void {
  // **`servesBaseDist` を呼ばずに独立に書く。** 実装（`newParityContext`）と同じ述語で正解を決めると、述語が壊れたとき
  // （常に true など）ブランチの側が基準を配っても「配る側」の分岐に入って緑になる（オラクルが実装と同じ）
  const shouldServe = role.side === 'base' || role.control;
  if (!shouldServe) {
    expect(servings.length, `${name}（${role.side}）: 通常の比較なのに基準の dist の経路が掛かっている`).toBe(0);
    return;
  }
  const served = servings.reduce((n, s) => n + s.served(), 0);
  expect(served, `${name}（${role.side}）: 基準の dist から 1 件も返していない`).toBeGreaterThan(0);
  expect(servings.flatMap((s) => s.missing()), `${name}（${role.side}）: 基準の dist に無い資産を読もうとした`).toEqual([]);
}

/**
 * 画素を撮る。計測弧の長さは撮るときだけ固定する（`states.ts` の `SCREENSHOT_STYLE`）。
 *
 * **上書きが弧の円にだけ当たることを断定する。** セレクタが何にも当たらないと上書きが黙って効かず、当たりすぎると
 * 別の要素の画素を変える。残り時間（`timer`）の数と同じ数の、`stroke-dasharray` を持つ `<circle>` に当たること。
 */
async function screenshotOf(page: Page, state: ParityState): Promise<Buffer> {
  const hits = await page.evaluate((selector) => {
    const found = Array.from(document.querySelectorAll(selector));
    return {
      count: found.length,
      arcs: found.filter((e) => e.localName === 'circle' && e.hasAttribute('stroke-dasharray')).length,
      timers: document.querySelectorAll('[role="timer"]').length,
    };
  }, METER_ARC_SELECTOR);
  expect(hits, `${state.name}: 計測弧の上書きが弧の円にだけ当たらない`).toEqual({
    count: hits.timers,
    arcs: hits.timers,
    timers: hits.timers,
  });
  return page.screenshot({ fullPage: true, animations: 'disabled', mask: state.mask(page), style: SCREENSHOT_STYLE });
}

async function captureSide(browser: Browser, state: ParityState, role: ParityRole): Promise<Capture> {
  const { side } = role;
  const contexts: BrowserContext[] = [];
  const servings: BaseServing[] = [];
  const open = async (): Promise<Page> => {
    const { context, serving } = await newParityContext(browser, role, {
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
    await waitForInviteQr(page);
    assertServing(state.name, role, servings);

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
      screenshots.set(width, await screenshotOf(page, state));
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

/**
 * テストのタイトル。通常の比較でも対照実行でも正しい言い方にする（対照実行は list の行頭の `[対照実行]` と
 * summary.json の `control` で明記する・`parity.control.config.ts`）。
 */
const VERDICT = '基準と並べて一致する';

/** 操作の書き出しの件数（種類ごと）と、外した要素。 */
function interactionSummary(c: InteractionCapture): Record<string, unknown> {
  return { counts: c.counts, entries: c.entries.length, notEntered: c.notEntered, skipped: c.skipped };
}

/**
 * 基準側の要約のうち、期待値として固定する部分（`expected.ts`）。基準の dist から返した件数（`served`）は
 * 読み込みの回数で揺れうるので入れない。キーフレームと skipped は名前の並びで揺れないよう整列する。
 */
function expectationOf(
  elements: Readonly<Record<number, number>> | number,
  motion: readonly StyleEntry[],
  keyframes: Readonly<Record<string, string>>,
  interactions: InteractionCapture,
): Record<string, unknown> {
  return {
    elements,
    motionEntries: motion.length,
    keyframes: Object.keys(keyframes).sort(),
    interactions: {
      counts: interactions.counts,
      entries: interactions.entries.length,
      notEntered: [...interactions.notEntered].sort(),
      skipped: [...interactions.skipped].sort(),
    },
  };
}

/** 期待値を突き合わせ、基準側の要約をその置き場へ書く（期待値の作り直しはこれを束ねる・README）。 */
function checkBaseExpectation(dir: string, key: string, expectation: Record<string, unknown>): string[] {
  writeFileSync(path.join(dir, BASE_EXPECTATION_FILE), JSON.stringify(expectation, null, 2));
  return checkExpectation(EXPECTED, key, expectation);
}

for (const state of STATES) {
  test(`${state.name}: ${VERDICT}`, async ({ browser }, testInfo) => {
    assertSnapshotsNotUpdated(testInfo);
    const control = isControlRun(testInfo);
    const base = await captureSide(browser, state, { side: 'base', control });
    const branch = await captureSide(browser, state, { side: 'branch', control });

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
      JSON.stringify({ control, base: summary(base), branch: summary(branch) }, null, 2),
    );
    // 基準側の要約を期待値と突き合わせる（両側で同じように空でも緑にしない）
    const elements = Object.fromEntries(WIDTHS.map((w) => [w, base.styles.get(w)?.length ?? 0]));
    report['expected'] = checkBaseExpectation(dir, state.name, expectationOf(elements, base.motion, base.keyframes, base.interactions));
    writeFileSync(path.join(dir, 'diff.json'), JSON.stringify(report, null, 2));

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
// 名前を打ち違えると、タッチの比較が黙って 1 本減る（filter が当たらない）。目録に在ることを読み込みの時点で断定する
const unknownTouch = [...TOUCH_STATES].filter((n) => !STATES.some((s) => s.name === n));
if (unknownTouch.length > 0) throw new Error(`TOUCH_STATES に目録に無い状態がある: ${unknownTouch.join(', ')}`);

/** タッチの比較の出力の置き場の名前（期待値のキーも同じ）。 */
const touchKey = (name: string): string => `${name}-touch`;

/**
 * 基準側の要約の期待値（`expected.ts`）。キーがテストと食い違えば読み込みの時点で止める（古い期待値・目録の変更）。
 * 無ければ各テストが赤になる（README の「期待値を作り直す」）。
 */
const EXPECTED = loadExpected();
if (EXPECTED !== null) {
  const problems = expectedKeyProblems(EXPECTED, [...STATES.map((s) => s.name), ...[...TOUCH_STATES].map(touchKey)]);
  if (problems.length > 0) throw new Error(`期待値の JSON が目録と食い違う（README の「期待値を作り直す」）: ${problems.join(' / ')}`);
}

interface TouchCapture {
  readonly styles: StyleEntry[];
  readonly screenshot: Buffer;
  readonly motion: StyleEntry[];
  readonly keyframes: Record<string, string>;
  readonly interactions: InteractionCapture;
  /** 基準の dist から返した件数（ブランチの側は 0）。 */
  readonly served: number;
}

/**
 * タッチの文脈で 1 側を撮る。本体と同じ 2 通りの読み方をする（`no-preference` で動きのプロパティとキーフレーム、
 * `reduce` で全プロパティと画素）。その後に操作の状態を書き出す。
 */
async function captureTouchSide(browser: Browser, state: ParityState, role: ParityRole): Promise<TouchCapture> {
  const { side } = role;
  const contexts: BrowserContext[] = [];
  const servings: BaseServing[] = [];
  const open = async (): Promise<Page> => {
    const { context, serving } = await newParityContext(browser, role, {
      viewport: { width: TOUCH_WIDTH, height: HEIGHT },
      hasTouch: true,
      reducedMotion: 'no-preference',
    });
    if (serving !== null) servings.push(serving);
    contexts.push(context);
    return context.newPage();
  };
  try {
    const page = await state.setup(open);
    await expect(state.marker(page), `${state.name}（タッチ・${side}）の目印`).toBeVisible();
    await waitForInviteQr(page);
    assertServing(`${state.name}（タッチ）`, role, servings);
    expect(await page.evaluate(() => matchMedia('(hover: hover)').matches), 'タッチの文脈で (hover: hover) が真').toBe(false);

    // 1. no-preference: 動きのプロパティとキーフレーム
    const motion = await captureMotion(page);
    const keyframes = await captureKeyframes(page);

    // 2. reduce: 全プロパティと画素
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await settleAtWidth(page, TOUCH_WIDTH, state.marker(page));
    await scrollToTop(page);
    const styles = await captureStyles(page, 'html', { relayout: true });
    expect(styles.length, `${state.name}（タッチ・${side}）の要素数`).toBeGreaterThanOrEqual(state.minElements);
    const screenshot = await screenshotOf(page, state);

    // 3. 操作の状態
    const interactions = await captureInteractionsAt(page, state, TOUCH_WIDTH);
    const served = servings.reduce((n, s) => n + s.served(), 0);
    return { styles, screenshot, motion, keyframes, interactions, served };
  } finally {
    for (const c of contexts) await c.close();
  }
}

for (const state of STATES.filter((s) => TOUCH_STATES.has(s.name))) {
  test(`${state.name}（タッチ・${TOUCH_WIDTH}px）: ${VERDICT}`, async ({ browser }, testInfo) => {
    assertSnapshotsNotUpdated(testInfo);
    const control = isControlRun(testInfo);
    const base = await captureTouchSide(browser, state, { side: 'base', control });
    const branch = await captureTouchSide(browser, state, { side: 'branch', control });
    const options = { tailwindThemeVars: themeVars, ignore: NOISE };
    const report: Record<string, StyleDiff[] | string[]> = {
      motion: diffEntries(base.motion, branch.motion, options),
      keyframes: diffKeyframes(base.keyframes, branch.keyframes),
      [`styles@${TOUCH_WIDTH}`]: diffEntries(base.styles, branch.styles, options),
      interactions: diffEntries(base.interactions.entries, branch.interactions.entries, options),
      notEntered: [
        ...base.interactions.notEntered.map((s) => `base ${s}`),
        ...branch.interactions.notEntered.map((s) => `branch ${s}`),
      ],
      skipped: onlyOnOneSide(base.interactions.skipped, branch.interactions.skipped),
    };
    // `--repeat-each` の 2 回目以降は別の置き場へ書く（本体と同じ）
    const name = touchKey(state.name);
    const dir = path.join(OUT, testInfo.repeatEachIndex === 0 ? name : `${name}-r${testInfo.repeatEachIndex}`);
    mkdirSync(dir, { recursive: true });
    const summary = (c: TouchCapture): Record<string, unknown> => ({
      served: c.served,
      elements: c.styles.length,
      motionEntries: c.motion.length,
      keyframes: Object.keys(c.keyframes).sort(),
      interactions: interactionSummary(c.interactions),
    });
    writeFileSync(
      path.join(dir, 'summary.json'),
      JSON.stringify({ control, base: summary(base), branch: summary(branch) }, null, 2),
    );
    // 基準側の要約を期待値と突き合わせる（本体と同じ）
    report['expected'] = checkBaseExpectation(dir, name, expectationOf(base.styles.length, base.motion, base.keyframes, base.interactions));
    writeFileSync(path.join(dir, 'diff.json'), JSON.stringify(report, null, 2));

    // 画素: 本体と同じく、基準の画像を snapshot の置き場へ書き、ブランチの画像を照合する（maxDiffPixels: 0）
    const png = `${name}-${TOUCH_WIDTH}.png`;
    const snapshot = testInfo.snapshotPath(png);
    mkdirSync(path.dirname(snapshot), { recursive: true });
    writeFileSync(snapshot, base.screenshot);
    expect.soft(branch.screenshot, `画素 ${png}`).toMatchSnapshot(png, { maxDiffPixels: 0 });

    const total = Object.values(report).reduce((n, list) => n + list.length, 0);
    expect(total, `${state.name}（タッチ）の差（${path.join(dir, 'diff.json')}）`).toBe(0);
  });
}
