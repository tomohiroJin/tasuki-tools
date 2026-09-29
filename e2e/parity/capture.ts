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
  /** null なら全プロパティ。配列ならそのプロパティだけ（擬似要素は読まない）。 */
  readonly only: readonly string[] | null;
  /** true なら root の要素だけ（子孫を歩かない）。 */
  readonly single: boolean;
}

/** ブラウザ側で動く本体。**自己完結させる**（外の識別子を参照しない）。 */
function walkInPage(options: WalkOptions): StyleEntry[] {
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
    if (options.only === null) {
      for (const pseudo of ['::before', '::after']) {
        const ps = getComputedStyle(el, pseudo);
        if (ps.content !== 'none' && ps.content !== 'normal') out.push({ path, pseudo, props: read(ps, cs) });
      }
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

export async function captureStyles(page: Page, rootSelector = 'html'): Promise<StyleEntry[]> {
  return page.evaluate(walkInPage, { rootSelector, only: null, single: false });
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
      for (const n of getComputedStyle(el).animationName.split(',')) {
        const name = n.trim();
        if (name !== '' && name !== 'none') used.add(name);
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
