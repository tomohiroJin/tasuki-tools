/**
 * 除去検査を基準のページで全状態・全幅に当て、死んでいるクラスの一覧を書き出す（#321・設計正本 D2・計画 P6）。
 * PR 2・3 が「写さないクラス」を決めるのに使う（`out/removal-probe.json`）。
 *
 * - 状態の変種を持たないクラス: `no-preference` の下で動きのプロパティを 1280px で、`reduce` の下で全プロパティを全幅で
 *   判定する。どこか 1 か所でも変われば生きている。どこでも変わらなければ死んでいる。外して戻しても元に戻らない読み
 *   （揺れ）があり、どこでも変わっていなければ未判定
 * - 状態の変種を持つクラス: `hover` はホバー、`focus*` はキーボードでのフォーカス、`active` は押下、
 *   `disabled` / `checked` / `open` はいまその状態のときだけ、1280px で判定する。入れられなければ未判定
 *
 * 状態の作り方・幅を変えた後の待ち・読む前のレイアウトの作り直しは、比較の本体（`timer.parity.ts`）と同じものを通す。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test';
import type { BaseServing } from './base-dist';
import { newParityContext } from './context';
import {
  coverOf,
  finishTransitions,
  guardPress,
  HOVER_TIMEOUT_MS,
  moveAway,
  PRESS_CHANGES_STATE,
  releaseAway,
} from './interaction';
import { elementPath, probeMotion, probeRest, probeToken, STATE_VARIANT, type ProbeResult } from './removal-probe';
import { scrollToTop, settleAtWidth } from './settle';
import { createRoom, joinViaHub } from '../support/timer';
import { STATES, WIDTHS, type ParityState } from './states';

/**
 * 書き出す 1 件。`widths` は、alive なら変わった幅・dead なら判定した幅（その要素が在った幅）・undecided なら揺れた幅。
 * `motion` は `no-preference` の動きのプロパティで変わったとき true。`reason` は undecided の理由。
 */
interface ProbeHit {
  readonly state: string;
  readonly path: string;
  readonly className: string;
  readonly token: string;
  readonly widths?: number[];
  readonly motion?: boolean;
  readonly reason?: string;
}

const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), 'out');
const HEIGHT = 900;
/** 状態の変種と動きのプロパティを判定する幅（比較の本体の操作の書き出しと同じ）。 */
const VARIANT_WIDTH = 1280;
const dead: ProbeHit[] = [];
const alive: ProbeHit[] = [];
const undecided: ProbeHit[] = [];

/** 幅ごと（と動き）の結果を、要素とクラスの組ごとに束ねたもの。 */
interface Tally {
  readonly hit: ProbeResult;
  readonly present: number[];
  readonly changedAt: number[];
  readonly unstableAt: number[];
  motion: boolean;
}

/** 静止の判定を束ねて、dead / alive / undecided に振り分ける。 */
function classifyRest(state: string, tallies: Iterable<Tally>): void {
  for (const t of tallies) {
    const base = { state, path: t.hit.path, className: t.hit.className, token: t.hit.token };
    if (t.changedAt.length > 0 || t.motion) {
      alive.push({ ...base, widths: t.changedAt, ...(t.motion ? { motion: true } : {}) });
    } else if (t.unstableAt.length > 0) {
      undecided.push({ ...base, widths: t.unstableAt, reason: '外して戻しても読み値が元に戻らない（揺れ）' });
    } else {
      dead.push({ ...base, widths: t.present });
    }
  }
}

/** 静止の判定（動きを 1280px・`no-preference`、全プロパティを全幅・`reduce`）。 */
async function probeRestAllWidths(page: Page, state: ParityState): Promise<void> {
  const tallies = new Map<string, Tally>();
  const tallyOf = (r: ProbeResult): Tally => {
    const key = `${r.path}\u0000${r.token}`;
    const existing = tallies.get(key);
    if (existing !== undefined) return existing;
    const created: Tally = { hit: r, present: [], changedAt: [], unstableAt: [], motion: false };
    tallies.set(key, created);
    return created;
  };

  // 1. no-preference: 動きのプロパティ（reduce では duration が 0.01ms に固定され、duration-* が必ず死んで見える）
  // 落ち着きは待たない（`timer.parity.ts` の `captureMotion` と同じ）。動きのプロパティは静的な値で幅にも揺れにもよらず、
  // `no-preference` の下では計器の運針（`chrono-sweep`・無限）が回り続けて配置の指紋が落ち着かない（実測: セッション画面の 8 状態）
  for (const r of await probeMotion(page)) if (r.status === 'changed') tallyOf(r).motion = true;

  // 2. reduce: 全プロパティを全幅で
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: HEIGHT });
    await expect(state.marker(page)).toBeVisible();
    await settleAtWidth(page, width, state.marker(page));
    await scrollToTop(page);
    for (const r of await probeRest(page)) {
      const t = tallyOf(r);
      t.present.push(width);
      if (r.status === 'changed') t.changedAt.push(width);
      if (r.status === 'unstable') t.unstableAt.push(width);
    }
  }
  classifyRest(state.name, tallies.values());
}

/** 状態の変種のクラスを持つ要素と、そのクラス（文書の順）。 */
interface VariantTarget {
  readonly index: number;
  readonly token: string;
  readonly variant: string;
}

/** 状態の変種のクラスを持つ要素に目印を付け、一覧を返す（以後の DOM の増減で `nth` がずれないように）。 */
async function markVariantTargets(page: Page): Promise<VariantTarget[]> {
  return page.evaluate(
    ({ src, attr }) => {
      const re = new RegExp(src);
      const out: { index: number; token: string; variant: string }[] = [];
      Array.from(document.body.querySelectorAll('[class]')).forEach((el, index) => {
        const tokens = Array.from(el.classList).filter((t) => re.test(t));
        if (tokens.length > 0) el.setAttribute(attr, String(index));
        for (const token of tokens) out.push({ index, token, variant: re.exec(token)?.[1] ?? '' });
      });
      return out;
    },
    { src: STATE_VARIANT.source, attr: VARIANT_MARK },
  );
}

/** 状態の変種の判定の対象に付ける属性（CSS はこの属性を見ない。最後に外す）。 */
const VARIANT_MARK = 'data-parity-variant';

/** 変種の名前から、状態に入ったことを確かめる擬似クラス。 */
function pseudoOf(variant: string): string {
  if (variant === 'open') return '[open], :popover-open';
  return `:${variant}`;
}

/**
 * 要素を状態に入れる。入れられなければ理由を返す（入れられたら null）。押下は `guardPress` を掛けて押したまま返す
 * （押している間にページへポインタの事象を届かせない。届くとポップオーバーやダイアログが閉じて状態が壊れる・`interaction.ts`）。
 */
async function enterState(page: Page, el: Locator, variant: string): Promise<string | null> {
  if (!(await el.isVisible())) return '見えていない';
  if (variant === 'hover' || variant === 'active') {
    const cover = await coverOf(el);
    if (cover !== null) return `覆われている: ${cover}`;
    if (variant === 'active' && (await el.evaluate((e, s) => e.matches(s), PRESS_CHANGES_STATE))) {
      return '押すと値が変わるか一覧が開く';
    }
    try {
      await el.hover({ timeout: HOVER_TIMEOUT_MS });
    } catch (error) {
      return `ホバーできない: ${(error instanceof Error ? error.message : String(error)).split('\n')[0] ?? ''}`;
    }
    if (variant === 'active') {
      await guardPress(page, true);
      await page.mouse.down();
    }
  } else if (variant.startsWith('focus')) {
    if (await el.evaluate((e) => e.matches(':disabled'))) return '無効（フォーカスできない）';
    // キーボードの入力の後のスクリプトのフォーカスは :focus-visible の条件を満たす
    await page.keyboard.press('Shift');
    await el.focus();
  }
  await finishTransitions(page);
  return null;
}

async function leaveState(page: Page, variant: string): Promise<void> {
  if (variant === 'active') await releaseAway(page);
  else if (variant === 'hover') await moveAway(page);
  else await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await finishTransitions(page);
}

/** 操作（ホバー・押下・フォーカス）で入れる変種か。 */
function isEnteredByOperation(variant: string): boolean {
  return variant === 'hover' || variant === 'active' || variant.startsWith('focus');
}

/** 状態から外れたときに入れ直す回数の上限（`interaction.ts` の `CAPTURE_ATTEMPTS` と同じ）。 */
const VARIANT_ATTEMPTS = 5;

/**
 * 状態の変種のクラスを 1 つ判定する。状態に入っていることを、判定と同じ評価の中で前と後の両方で確かめる。
 *
 * **外れたら入れ直す。** 確認のダイアログのフォーカストラップ（`useFocusTrap`）は、残り時間の刻みの再描画のたびに
 * 取消ボタンへフォーカスを戻す（`states.ts` の `openDialogWithoutFocus`・`interaction.ts` の `captureInState`）。
 * 入れ直しても外れ続ければ未判定にする。入れられない理由（覆われている・無効など）があれば入れ直さない。
 */
async function probeVariant(page: Page, state: string, el: Locator, target: VariantTarget): Promise<void> {
  const className = await el.evaluate((e) => e.getAttribute('class') ?? '');
  const pseudo = pseudoOf(target.variant);
  const base = { state, className, token: target.token };
  let lastReason = '';
  for (let attempt = 0; attempt < VARIANT_ATTEMPTS; attempt += 1) {
    const reason = await enterState(page, el, target.variant);
    try {
      if (reason !== null) {
        undecided.push({ ...base, path: await el.evaluate(elementPath), reason });
        return;
      }
      const r = await probeToken(el, target.token, pseudo);
      if (r.status === 'out-of-state') {
        // 無効・チェック・開閉は操作で入れる状態ではない（いまその状態に無ければ、入れ直しても変わらない）
        if (!isEnteredByOperation(target.variant)) {
          undecided.push({ ...base, path: r.path, reason: `いま ${pseudo} の状態に無い` });
          return;
        }
        lastReason = `${pseudo} に入らないか、判定の間に外れた（${VARIANT_ATTEMPTS} 回）`;
        continue;
      }
      const hit = { ...base, path: r.path, widths: [VARIANT_WIDTH] };
      if (r.status === 'unstable') undecided.push({ ...hit, reason: '外して戻しても読み値が元に戻らない（揺れ）' });
      else (r.status === 'same' ? dead : alive).push(hit);
      return;
    } finally {
      await leaveState(page, target.variant);
    }
  }
  undecided.push({ ...base, path: await el.evaluate(elementPath), reason: lastReason });
}

/** 状態の変種のクラスを 1280px で判定する。 */
async function probeVariantsAt1280(page: Page, state: ParityState): Promise<void> {
  await page.setViewportSize({ width: VARIANT_WIDTH, height: HEIGHT });
  await expect(state.marker(page)).toBeVisible();
  await settleAtWidth(page, VARIANT_WIDTH, state.marker(page));
  await scrollToTop(page);
  await moveAway(page);
  for (const target of await markVariantTargets(page)) {
    const el = page.locator(`[${VARIANT_MARK}="${target.index}"]`);
    if ((await el.count()) !== 1) {
      undecided.push({ state: state.name, path: `#${target.index}`, className: '', token: target.token, reason: '要素が消えた' });
      continue;
    }
    await probeVariant(page, state.name, el, target);
  }
  await page.evaluate(
    (attr) => document.querySelectorAll(`[${attr}]`).forEach((e) => e.removeAttribute(attr)),
    VARIANT_MARK,
  );
}

/** 基準の dist を配ったことを断定する（配っていなければブランチのビルドを判定している）。 */
function assertServedBase(name: string, servings: readonly BaseServing[]): void {
  const served = servings.reduce((n, s) => n + s.served(), 0);
  expect(served, `${name}: 基準の dist から 1 件も返していない`).toBeGreaterThan(0);
  expect(servings.flatMap((s) => s.missing()), `${name}: 基準の dist に無い資産を読もうとした`).toEqual([]);
}

async function probeState(browser: Browser, state: ParityState): Promise<void> {
  const contexts: BrowserContext[] = [];
  const servings: BaseServing[] = [];
  const open = async (): Promise<Page> => {
    const { context, serving } = await newParityContext(
      browser,
      { side: 'base', control: false },
      { viewport: { width: VARIANT_WIDTH, height: HEIGHT }, reducedMotion: 'no-preference' },
    );
    if (serving !== null) servings.push(serving);
    contexts.push(context);
    return context.newPage();
  };
  try {
    const page = await state.setup(open);
    await expect(state.marker(page), `${state.name}（基準）の目印`).toBeVisible();
    assertServedBase(state.name, servings);
    await probeRestAllWidths(page, state);
    await probeVariantsAt1280(page, state);
    await expect(state.marker(page), `${state.name}: 除去検査の後に目印が消えた（状態が変わった）`).toBeVisible();
  } finally {
    for (const c of contexts) await c.close();
  }
}

/**
 * 除去検査でだけ見る状態（比較の目録 `states.ts` には足さない。比較の網羅は規則の使用状況・E8 で確かめる）。
 *
 * - `lobby-guest-outside`: ゲストが名乗って入り、**まだ交代の輪に加わっていない**ロビー（ゲストの画面）。
 *   自分の行の「ドライバーに加わる」は `PrimaryButton` に `text-xs px-3 py-1.5` を渡す（`Lobby.tsx`）。目録の 24 状態は
 *   どれもゲストを輪に加えてから撮るので、このボタンが 1 度も出ず、既知の答え（`PrimaryButton` への `px-3` / `py-1.5` は
 *   死んでいる・設計正本 §2）を確かめられなかった（実測）
 */
const PROBE_ONLY_STATES: readonly ParityState[] = [
  {
    name: 'lobby-guest-outside',
    async setup(open) {
      const host = await open('host');
      const code = await createRoom(host, 'ホスト');
      const guest = await open('guest');
      await joinViaHub(guest, code, 'ゲスト');
      return guest;
    },
    marker: (p) => p.getByRole('button', { name: 'ドライバーに加わる' }),
    minElements: 60,
    mask: () => [],
  },
];

for (const state of [...STATES, ...PROBE_ONLY_STATES]) {
  test(`${state.name}: 基準で効いていないクラスを書き出す`, async ({ browser }, testInfo) => {
    // 除去検査は基準の側しか見ない。対照実行（`parity.control.config.ts`）で流しても同じことを繰り返すだけ
    test.skip(testInfo.config.metadata['parityControl'] === true, '対照実行では除去検査を流さない');
    await probeState(browser, state);
  });
}

test.afterAll(() => {
  // 1 つも判定しなかった回（対照実行で全部飛ばした・`-g` で外した）は書かない。空の一覧で前回の結果を潰さない
  if (dead.length + alive.length + undecided.length === 0) return;
  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, 'removal-probe.json'), JSON.stringify({ dead, alive, undecided }, null, 2));
});
