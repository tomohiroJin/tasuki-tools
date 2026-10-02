/**
 * 除去検査を基準のページで全状態・全幅に当て、死んでいるクラスの一覧を書き出す（#321・設計正本 D2・計画 P6）。
 * 結果は状態ごとに `out/removal/<状態>.json` へ書き、PR 2・3 は `removal-summary.ts` の `loadRemovalProbe` で読む。
 * 流すのは `-c parity/parity.removal.config.ts`（既定の比較の実行には含めない）。
 *
 * - 状態の変種を持たないクラス: `no-preference` の下で動きのプロパティを、`reduce` の下で全プロパティを、どちらも全幅で
 *   判定する。どこか 1 か所でも変われば生きている。どこでも変わらなければ死んでいる。外して戻しても元に戻らない読み
 *   （揺れ）しか差が無ければ未判定
 * - 状態の変種を持つクラス: `hover` はホバー、`focus*` はキーボードでのフォーカス、`active` は押下、
 *   `disabled` / `checked` / `open` はいまその状態のときだけ、1280px で判定する。入れられなければ未判定。
 *   `group-` / `peer-` 付きは判定せず未判定
 * - **組の確かめ**: 要素ごとに、単独で死んでいると判定したクラスをまとめて外し直す（静止は `reduce` の全幅、状態の変種は
 *   同じ状態に入れて）。変われば、それらは「単独では死んでいるが組では効いている」ので、dead から undecided へ移す
 *   （`removal-probe.ts` の `probeGroups`）
 *
 * 状態の作り方・幅を変えた後の待ち・読む前のレイアウトの作り直しは、比較の本体（`timer.parity.ts`）と同じものを通す。
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test';
import type { BaseServing } from './base-dist';
import { assertSnapshotsNotUpdated, newParityContext, type RafWindow } from './context';
import {
  coverOf,
  finishTransitions,
  guardPress,
  HOVER_TIMEOUT_MS,
  moveAway,
  PRESS_CHANGES_STATE,
  releaseAway,
} from './interaction';
import {
  elementPath,
  probeGroups,
  probeMotion,
  probeRest,
  probeTokens,
  RELATIONAL_VARIANT,
  STATE_VARIANT,
  type ProbeResult,
  type ProbeStatus,
} from './removal-probe';
import { REMOVAL_DIR, removalFile, type ProbeHit, type StateRemoval } from './removal-summary';
import { scrollToTop, settleAtWidth, waitForInviteQr } from './settle';
import { STATES, WIDTHS, type ParityState } from './states';

const HEIGHT = 900;
/** 状態の変種を判定する幅（比較の本体の操作の書き出しと同じ）。 */
const VARIANT_WIDTH = 1280;
const UNSTABLE = '外して戻しても読み値が元に戻らない（揺れ）';

/** 1 状態の判定を積む先。 */
type Collector = StateRemoval;

/** 幅ごと（と動き）の結果を、要素・className・クラスの組ごとに束ねたもの。 */
interface Tally {
  readonly hit: ProbeResult;
  readonly present: number[];
  readonly changedAt: number[];
  readonly unstableAt: number[];
  readonly motionAt: number[];
}

/** 静止の判定を束ねて、dead / alive / undecided に振り分ける。 */
function classifyRest(out: Collector, tallies: Iterable<Tally>): void {
  for (const t of tallies) {
    const base = { state: out.state, path: t.hit.path, className: t.hit.className, token: t.hit.token };
    if (t.changedAt.length > 0 || t.motionAt.length > 0) {
      out.alive.push({ ...base, widths: t.changedAt, ...(t.motionAt.length > 0 ? { motionWidths: t.motionAt } : {}) });
    } else if (t.unstableAt.length > 0) {
      out.undecided.push({ ...base, widths: t.unstableAt, reason: UNSTABLE });
    } else if (t.present.length > 0) {
      out.dead.push({ ...base, widths: t.present });
    } else {
      // 動きの読み（no-preference）にだけ出て、reduce の読みに一度も出なかった要素（幅や状態で描き分けている）
      out.undecided.push({ ...base, reason: 'reduce の読みに出なかった（全プロパティを比べていない）' });
    }
  }
}

/** 幅を変えた後、`clientWidth` が揃い、本物の rAF を 2 回待つ（`no-preference` の下。運針が回るので配置の指紋は待てない）。 */
async function waitWidth(page: Page, width: number): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.clientWidth), { message: `clientWidth が ${width} にならない` })
    .toBe(width);
  await page.evaluate(async () => {
    const raf = (window as unknown as RafWindow).__parityRaf;
    await new Promise<void>((resolve) => raf(() => raf(() => resolve())));
  });
}

/** 静止の判定（動きを全幅・`no-preference`、全プロパティを全幅・`reduce`）と、組の確かめ。 */
async function probeRestAllWidths(page: Page, state: ParityState, out: Collector): Promise<void> {
  const tallies = new Map<string, Tally>();
  const tallyOf = (r: ProbeResult): Tally => {
    const key = `${r.path}\u0000${r.className}\u0000${r.token}`;
    const existing = tallies.get(key);
    if (existing !== undefined) return existing;
    const created: Tally = { hit: r, present: [], changedAt: [], unstableAt: [], motionAt: [] };
    tallies.set(key, created);
    return created;
  };

  // 1. no-preference: 動きのプロパティ（reduce では duration と scroll-behavior が固定され、必ず死んで見える）。
  // 落ち着き（配置の指紋）は待たない。計器の運針（`chrono-sweep`・無限）が回り続けて落ち着かない（実測: セッション画面の 8 状態）
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: HEIGHT });
    await expect(state.marker(page)).toBeVisible();
    await waitWidth(page, width);
    for (const r of await probeMotion(page)) if (r.status === 'changed') tallyOf(r).motionAt.push(width);
  }

  // 2. reduce: 全プロパティを全幅で
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of WIDTHS) {
    await settleAt(page, state, width);
    for (const r of await probeRest(page)) {
      const t = tallyOf(r);
      t.present.push(width);
      if (r.status === 'changed') t.changedAt.push(width);
      if (r.status === 'unstable') t.unstableAt.push(width);
    }
  }
  classifyRest(out, tallies.values());
  await checkRestGroups(page, state, out);
}

async function settleAt(page: Page, state: ParityState, width: number): Promise<void> {
  await page.setViewportSize({ width, height: HEIGHT });
  await expect(state.marker(page)).toBeVisible();
  await settleAtWidth(page, width, state.marker(page));
  await scrollToTop(page);
}

/** 組の確かめで dead から外す理由（判定の結果か、状態に入れられなかった理由）。 */
function groupReason(status: ProbeStatus): string {
  return status === 'changed' ? '組で外すと変わる' : '組で外すと揺れる';
}

/**
 * 組の確かめで dead から外す要素の dead を undecided へ移す（組で外すと変わった・揺れた・状態に入れられなかった）。
 * `dead` のうち、道筋と className が一致し、クラスが組に入っているものを移す。`why` は理由の頭（組のクラスを後ろに足す）。
 */
function demoteGroup(out: Collector, path: string, className: string, tokens: readonly string[], why: string): void {
  const reason = `${why}: ${tokens.join(' + ')}`;
  const keep: ProbeHit[] = [];
  for (const h of out.dead) {
    if (h.path === path && h.className === className && tokens.includes(h.token)) out.undecided.push({ ...h, reason });
    else keep.push(h);
  }
  out.dead.splice(0, out.dead.length, ...keep);
}

/** dead のうち、同じ要素（道筋）に 2 つ以上あるものを組にする（状態の変種は除く・別に確かめる）。 */
function restGroups(out: Collector): Map<string, { className: string; tokens: string[] }> {
  const groups = new Map<string, { className: string; tokens: string[] }>();
  for (const h of out.dead) {
    if (STATE_VARIANT.test(h.token)) continue;
    const g = groups.get(h.path) ?? { className: h.className, tokens: [] };
    g.tokens.push(h.token);
    groups.set(h.path, g);
  }
  for (const [p, g] of groups) if (g.tokens.length < 2) groups.delete(p);
  return groups;
}

/** 静止の組の確かめ（`reduce`・全幅）。 */
async function checkRestGroups(page: Page, state: ParityState, out: Collector): Promise<void> {
  const groups = restGroups(out);
  if (groups.size === 0) return;
  const arg = Object.fromEntries([...groups].map(([p, g]) => [p, g.tokens]));
  const worst = new Map<string, ProbeStatus>();
  for (const width of WIDTHS) {
    await settleAt(page, state, width);
    for (const r of await probeGroups(page, arg)) {
      if (r.status === 'changed' || (r.status === 'unstable' && worst.get(r.path) !== 'changed')) worst.set(r.path, r.status);
    }
  }
  for (const [p, status] of worst) {
    const g = groups.get(p);
    if (g !== undefined) demoteGroup(out, p, g.className, g.tokens, groupReason(status));
  }
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

/** 状態に入れて判定した結果。入れられなければ理由。 */
type InStateResult = { readonly result: ProbeResult } | { readonly reason: string; readonly path: string };

/**
 * 要素を状態に入れ、`tokens` をまとめて外して判定する。状態に入っていることを、判定と同じ評価の中で前と後の両方で確かめる。
 *
 * **外れたら入れ直す。** 確認のダイアログのフォーカストラップ（`useFocusTrap`）は、残り時間の刻みの再描画のたびに
 * 取消ボタンへフォーカスを戻す（`states.ts` の `openDialogWithoutFocus`・`interaction.ts` の `captureInState`）。
 * 入れ直しても外れ続ければ未判定にする。入れられない理由（覆われている・無効など）があれば入れ直さない。
 */
async function judgeInState(page: Page, el: Locator, variant: string, tokens: readonly string[]): Promise<InStateResult> {
  const pseudo = pseudoOf(variant);
  for (let attempt = 0; attempt < VARIANT_ATTEMPTS; attempt += 1) {
    const reason = await enterState(page, el, variant);
    try {
      if (reason !== null) return { reason, path: await el.evaluate(elementPath) };
      const result = await probeTokens(el, tokens, pseudo);
      if (result.status !== 'out-of-state') return { result };
      // 無効・チェック・開閉は操作で入れる状態ではない（いまその状態に無ければ、入れ直しても変わらない）
      if (!isEnteredByOperation(variant)) return { reason: `いま ${pseudo} の状態に無い`, path: result.path };
    } finally {
      await leaveState(page, variant);
    }
  }
  return { reason: `${pseudo} に入らないか、判定の間に外れた（${VARIANT_ATTEMPTS} 回）`, path: await el.evaluate(elementPath) };
}

/** 状態の変種のクラスを 1 つ判定して積む。dead なら組の確かめの候補として返す。 */
async function probeVariant(page: Page, out: Collector, el: Locator, target: VariantTarget): Promise<ProbeHit | null> {
  const className = await el.evaluate((e) => e.getAttribute('class') ?? '');
  const base = { state: out.state, className, token: target.token };
  if (RELATIONAL_VARIANT.test(target.token)) {
    // 祖先・兄弟の状態で効く。この要素を状態に入れても確かめられない（removal-probe.ts の STATE_VARIANT）
    out.undecided.push({ ...base, path: await el.evaluate(elementPath), reason: 'group- / peer- の変種は判定しない' });
    return null;
  }
  const judged = await judgeInState(page, el, target.variant, [target.token]);
  if ('reason' in judged) {
    out.undecided.push({ ...base, path: judged.path, reason: judged.reason });
    return null;
  }
  const hit = { ...base, path: judged.result.path, widths: [VARIANT_WIDTH] };
  if (judged.result.status === 'unstable') out.undecided.push({ ...hit, reason: UNSTABLE });
  else if (judged.result.status === 'changed') out.alive.push(hit);
  else {
    out.dead.push(hit);
    return hit;
  }
  return null;
}

/** 同じ要素・同じ変種で dead になったクラスの組。 */
interface VariantGroup {
  readonly index: number;
  readonly variant: string;
  readonly hits: ProbeHit[];
}

/** 状態の変種の組の確かめ。同じ状態に入れてまとめて外し、変われば（入れられなければ）dead から外す。 */
async function checkVariantGroups(page: Page, out: Collector, groups: Iterable<VariantGroup>): Promise<void> {
  for (const g of groups) {
    const first = g.hits[0];
    if (g.hits.length < 2 || first === undefined) continue;
    const tokens = g.hits.map((h) => h.token);
    const judged = await judgeInState(page, page.locator(`[${VARIANT_MARK}="${g.index}"]`), g.variant, tokens);
    // 組では状態に入れられなかった（判定していない）ので dead のままにしない。理由は揺れではなく入れられなかったこと
    if ('reason' in judged) demoteGroup(out, first.path, first.className, tokens, `組の確かめで状態に入れられない（${judged.reason}）`);
    else if (judged.result.status !== 'same') demoteGroup(out, first.path, first.className, tokens, groupReason(judged.result.status));
  }
}

/** 状態の変種のクラスを 1280px で判定し、同じ要素・同じ変種で dead が 2 つ以上あれば組で確かめる。 */
async function probeVariantsAt1280(page: Page, state: ParityState, out: Collector): Promise<void> {
  await settleAt(page, state, VARIANT_WIDTH);
  await moveAway(page);
  const groups = new Map<string, VariantGroup>();
  for (const target of await markVariantTargets(page)) {
    const el = page.locator(`[${VARIANT_MARK}="${target.index}"]`);
    if ((await el.count()) !== 1) {
      out.undecided.push({ state: state.name, path: `#${target.index}`, className: '', token: target.token, reason: '要素が消えた' });
      continue;
    }
    const hit = await probeVariant(page, out, el, target);
    if (hit === null) continue;
    const key = `${target.index}\u0000${target.variant}`;
    const g = groups.get(key) ?? { index: target.index, variant: target.variant, hits: [] };
    g.hits.push(hit);
    groups.set(key, g);
  }
  await checkVariantGroups(page, out, groups.values());
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

async function probeState(browser: Browser, state: ParityState): Promise<Collector> {
  const out: Collector = { state: state.name, dead: [], alive: [], undecided: [] };
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
    await waitForInviteQr(page);
    assertServedBase(state.name, servings);
    await probeRestAllWidths(page, state, out);
    await probeVariantsAt1280(page, state, out);
    await expect(state.marker(page), `${state.name}: 除去検査の後に目印が消えた（状態が変わった）`).toBeVisible();
    return out;
  } finally {
    for (const c of contexts) await c.close();
  }
}

for (const state of STATES) {
  test(`${state.name}: 基準で効いていないクラスを書き出す`, async ({ browser }, testInfo) => {
    assertSnapshotsNotUpdated(testInfo);
    // 前回の結果を先に消す。落ちた状態のファイルが残ると、束ねる側（loadRemovalProbe）が欠けに気づかない
    const file = removalFile(state.name);
    rmSync(file, { force: true });
    const out = await probeState(browser, state);
    mkdirSync(REMOVAL_DIR, { recursive: true });
    writeFileSync(file, JSON.stringify(out, null, 2));
  });
}
