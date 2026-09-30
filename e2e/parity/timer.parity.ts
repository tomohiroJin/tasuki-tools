/**
 * 基準（`ba9249d`）とブランチを状態ごと・幅ごとに並べる（#321・設計正本 §5）。
 *
 * 1 つの状態につき、側ごとに新しいブラウザの文脈で状態を 1 回作り、幅を変えながら撮る（計画 P2）。
 * 読み方は 2 通り: `no-preference` で動きのプロパティとキーフレーム、`reduce` で全プロパティと画素。
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { BASE_DIST, serveBaseDist, type BaseServing } from './base-dist';
import { captureKeyframes, captureMotion, captureStyles } from './capture';
import { diffEntries, diffKeyframes, themeVarNamesFromCss, type StyleDiff, type StyleEntry } from './compare-lib';
import { NOISE } from './noise';
import { STATES, WIDTHS, type ParityState } from './states';

const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), 'out');
const HEIGHT = 900;

type Side = 'base' | 'branch';

interface Capture {
  readonly styles: Map<number, StyleEntry[]>;
  readonly screenshots: Map<number, Buffer>;
  readonly motion: StyleEntry[];
  readonly keyframes: Record<string, string>;
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

async function captureSide(browser: Browser, state: ParityState, side: Side): Promise<Capture> {
  const contexts: BrowserContext[] = [];
  const servings: BaseServing[] = [];
  const open = async (): Promise<Page> => {
    // `local-network-access`: 基準の側は `/timer/` を `route.fulfill` で返すので、Chrome はその文書の
    // アドレス空間を loopback と見なさず、`ws://127.0.0.1` への同期の接続を Local Network Access の
    // 検査で弾く（`ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS`・実測）。両側を揃えるため、どちらにも付与する。
    const context = await browser.newContext({
      viewport: { width: 1280, height: HEIGHT },
      reducedMotion: 'no-preference',
      permissions: ['local-network-access'],
    });
    if (side === 'base') servings.push(await serveBaseDist(context, BASE_DIST));
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
      const entries = await captureStyles(page);
      expect(entries.length, `${state.name}@${width}（${side}）の要素数`).toBeGreaterThanOrEqual(state.minElements);
      styles.set(width, entries);
      screenshots.set(
        width,
        await page.screenshot({ fullPage: true, animations: 'disabled', mask: state.mask(page) }),
      );
    }
    const served = servings.reduce((n, s) => n + s.served(), 0);
    return { styles, screenshots, motion, keyframes, served };
  } finally {
    for (const c of contexts) await c.close();
  }
}

const themeVars = tailwindThemeVars();

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
    const dir = path.join(OUT, state.name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'diff.json'), JSON.stringify(report, null, 2));
    // 撮れた中身の要約（状態を作り損ねていないか・キーフレームを実際に拾えたかを後から読む）
    const summary = (c: Capture): Record<string, unknown> => ({
      served: c.served,
      elements: Object.fromEntries(WIDTHS.map((w) => [w, c.styles.get(w)?.length ?? 0])),
      motionEntries: c.motion.length,
      keyframes: Object.keys(c.keyframes).sort(),
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
