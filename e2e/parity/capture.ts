/**
 * 計算済みスタイルの書き出し（#321・設計正本 §5.2）。
 *
 * - 要素は `html` から歩き、道筋（`tag:nth-of-type(n)` の連なり）で識別する
 * - カスタムプロパティは親と値が違う要素でだけ記録する（`html` は全部・計画 P3）
 * - 擬似要素は描画されるものだけ（計画 P4）
 *
 * `page.evaluate` に渡す関数は**自己完結**させる（Playwright は関数の本文だけをブラウザへ送る）。
 */
import type { Locator, Page } from '@playwright/test';
import type { StyleEntry } from './compare-lib';

/** 動きのプロパティ（`no-preference` の下でだけ読む・設計正本 §5.2 の 2）。 */
export const MOTION_PROPS = [
  'transition-property',
  'transition-duration',
  'transition-timing-function',
  'transition-delay',
  'transition-behavior',
  'animation-name',
  'animation-duration',
  'animation-timing-function',
  'animation-delay',
  'animation-iteration-count',
  'animation-direction',
  'animation-fill-mode',
  'animation-play-state',
] as const;

interface WalkOptions {
  readonly rootSelector: string;
  /** null なら全プロパティ。配列ならそのプロパティだけ（`::before` / `::after` は読む）。 */
  readonly only: readonly string[] | null;
  /** true なら root の要素だけ（子孫を歩かない）。 */
  readonly single: boolean;
  /**
   * true なら、読む前に文書全体のレイアウトを作り直す（ルートの `display` を一瞬 `none` にして戻す）。
   *
   * **auto の余白（`mx-auto`）の読み値が決定的でないため。** flex の子の `margin-left` は、位置
   * （`getBoundingClientRect().left`）が動いていないのに、1 秒ごとの再描画の後に `109px` から `0px` へ
   * 変わって戻らなかった。`offsetWidth` でレイアウトを強制しても戻らず、全体を作り直すと位置と合う値
   * （`109px`）に戻った（実測・Chromium）。計器（`TeamOrbit`）で 5 幅とも、基準・ブランチの両側で同じく起きた。
   * `left` から親の `left` を引いた値は常に作り直した後の読み値と一致し、`clientWidth` は `innerWidth` と
   * 等しいまま（スクロールバーの出入りは無い）。**配置は動いておらず、読み値だけが揺れる。**作り直すと CSS アニメーションが最初からやり直しになるので、
   * 同じ評価の中で終わらせてから読む（`reduce` の下では回数 1・0.01ms なので、終えた姿が本来の姿）。
   * フォーカスは保たれる（実測）。
   */
  readonly relayout?: boolean;
}

/** ブラウザ側で動く本体。**自己完結させる**（外の識別子を参照しない）。 */
function walkInPage(options: WalkOptions): StyleEntry[] {
  if (options.relayout === true) {
    const html = document.documentElement;
    html.style.display = 'none';
    void html.offsetWidth;
    html.style.removeProperty('display');
    if (html.getAttribute('style') === '') html.removeAttribute('style');
    void html.offsetWidth;
    for (const animation of document.getAnimations()) {
      if (animation.effect?.getComputedTiming().endTime !== Infinity) animation.finish();
    }
  }
  const root = document.querySelector(options.rootSelector);
  if (root === null) throw new Error(`書き出しの根が見つかりません: ${options.rootSelector}`);

  const pathOf = (el: Element): string => {
    const parts: string[] = [];
    let cur: Element | null = el;
    while (cur !== null) {
      const tag = cur.tagName.toLowerCase();
      const parent: Element | null = cur.parentElement;
      if (parent === null) {
        parts.unshift(tag);
        break;
      }
      const tagName = cur.tagName;
      const same = Array.from(parent.children).filter((c) => c.tagName === tagName);
      parts.unshift(`${tag}:nth-of-type(${same.indexOf(cur) + 1})`);
      cur = parent;
    }
    return parts.join('>');
  };

  const read = (cs: CSSStyleDeclaration, parent: CSSStyleDeclaration | null): Record<string, string> => {
    const props: Record<string, string> = {};
    if (options.only !== null) {
      for (const name of options.only) props[name] = cs.getPropertyValue(name);
      return props;
    }
    for (let i = 0; i < cs.length; i += 1) {
      const name = cs.item(i);
      const value = cs.getPropertyValue(name);
      if (name.startsWith('--') && parent !== null && parent.getPropertyValue(name) === value) continue;
      props[name] = value;
    }
    return props;
  };

  const out: StyleEntry[] = [];
  const visit = (el: Element): void => {
    const cs = getComputedStyle(el);
    const parent = el.parentElement === null ? null : getComputedStyle(el.parentElement);
    const path = pathOf(el);
    out.push({ path, pseudo: '', props: read(cs, parent) });
    // ::before / ::after は only 指定（動きの書き出し）でも読む。擬似要素だけの animation / transition を落とさない。
    for (const pseudo of ['::before', '::after']) {
      const ps = getComputedStyle(el, pseudo);
      if (ps.content !== 'none' && ps.content !== 'normal') out.push({ path, pseudo, props: read(ps, cs) });
    }
    if (options.only === null) {
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        out.push({ path, pseudo: '::placeholder', props: read(getComputedStyle(el, '::placeholder'), cs) });
      }
      if (cs.display === 'list-item') {
        out.push({ path, pseudo: '::marker', props: read(getComputedStyle(el, '::marker'), cs) });
      }
      if (el instanceof HTMLSelectElement && el.matches(':open')) {
        out.push({ path, pseudo: '::picker(select)', props: read(getComputedStyle(el, '::picker(select)'), cs) });
      }
    }
    if (!options.single) for (const child of Array.from(el.children)) visit(child);
  };
  visit(root);
  return out;
}

/**
 * 全要素・全プロパティの書き出し。`relayout` は {@link WalkOptions.relayout}（`reduce` の下でだけ使う）。
 */
export async function captureStyles(
  page: Page,
  rootSelector = 'html',
  options: { readonly relayout?: boolean } = {},
): Promise<StyleEntry[]> {
  return page.evaluate(walkInPage, { rootSelector, only: null, single: false, relayout: options.relayout === true });
}

export async function captureMotion(page: Page): Promise<StyleEntry[]> {
  return page.evaluate(walkInPage, { rootSelector: 'html', only: [...MOTION_PROPS], single: false });
}

/** その要素と擬似要素だけ。操作の状態（ホバー・フォーカス・押下）の書き出しに使う。 */
export async function captureElement(locator: Locator): Promise<StyleEntry[]> {
  const marker = `parity-${Math.random().toString(36).slice(2)}`;
  await locator.evaluate((el, m) => el.setAttribute('data-parity-target', m), marker);
  try {
    return await locator.page().evaluate(walkInPage, {
      rootSelector: `[data-parity-target="${marker}"]`,
      only: null,
      single: true,
    });
  } finally {
    await locator.evaluate((el) => el.removeAttribute('data-parity-target'));
  }
}

/** 使われている `animation-name` ごとの `@keyframes` の中身（同じ名前が複数あれば連ねる）。 */
export async function captureKeyframes(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const used = new Set<string>();
    for (const el of Array.from(document.querySelectorAll('*'))) {
      for (const pseudo of [null, '::before', '::after']) {
        for (const n of getComputedStyle(el, pseudo).animationName.split(',')) {
          const name = n.trim();
          if (name !== '' && name !== 'none') used.add(name);
        }
      }
    }
    const out: Record<string, string> = {};
    const visit = (rules: CSSRuleList): void => {
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSKeyframesRule) {
          if (used.has(rule.name)) out[rule.name] = (out[rule.name] ?? '') + rule.cssText;
        } else if ('cssRules' in rule) {
          visit((rule as CSSGroupingRule).cssRules);
        }
      }
    };
    for (const sheet of Array.from(document.styleSheets)) visit(sheet.cssRules);
    return out;
  });
}
