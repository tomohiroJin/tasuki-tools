/**
 * 除去検査のブラウザ側の本体（#321・設計正本 D2・計画 P6）。基準のページで要素のクラスを 1 つずつ外し、
 * 計算済みスタイルが変わらなければ、そのクラスの宣言は死んでいる。
 *
 * 比べる範囲（{@link ProbeArgs.only} が null のとき）: 要素自身の全プロパティと描画される擬似要素・直下の子の全プロパティ・
 * それより深い子孫の継承するプロパティ（計画 P6）。カスタムプロパティは比べない（`focus-visible:outline-none` は
 * `--tw-outline-style` だけを変え、効いている `outline-style` はグローバルの `:focus-visible` が決める。カスタムプロパティを
 * 比べると、効いていない宣言を生きていると判定する）。
 *
 * **外した直後の値を読まない。** 外すと `transition-all` の要素で遷移が始まり、その瞬間の計算済みスタイルは遷移の始点
 * （外す前の値）を返す。`reduce` の下でも 0.01ms の遷移は残る（`index.css`）。読まずに比べると、生きているクラスを
 * 「変わらない＝死んでいる」と判定する。そこで読む → 走り始めた遷移・アニメーションを終える → 読み直す、を
 * 走るものが無くなるまで繰り返す（描画を飛ばす部分木では、スタイルを読んだ瞬間に初めて遷移が始まる・`settle.ts`）。
 *
 * **外して戻した後の読みが外す前と違うプロパティは「揺れ」として判定に使わない**（プロパティごとに突き合わせる・`compare`）。
 * 読み値そのものが揺れる箇所（`capture.ts` の `relayout` の注記: auto の余白）で、揺れを「変わった＝生きている」と
 * 取り違えないため。揺れたプロパティしか差が無ければ未判定にする。
 *
 * `page.evaluate` に渡す関数は**自己完結**させる（Playwright は関数の本文だけをブラウザへ送る）。
 */
import type { Locator, Page } from '@playwright/test';
import { MOTION_PROPS } from './capture';

/**
 * 状態の変種。これを含むクラスは、要素をその状態に入れたときだけ判定する（計画 P6）。
 * 捕まえる組は変種の名前（`hover` / `focus-visible` など）。`group-` / `peer-` 付きは、静止の判定へ回さないためにここで拾い、
 * **判定せずに理由つきで未判定にする**（効くかは祖先・兄弟の状態で決まり、その要素を状態に入れても確かめられない。
 * 基準では使われていない・{@link RELATIONAL_VARIANT}）。
 */
export const STATE_VARIANT = /(?:^|:)(?:group-|peer-)?(hover|focus|focus-visible|focus-within|active|disabled|checked|open):/;

/** 祖先・兄弟の状態で効く変種（`group-hover:` など）。判定しない（{@link STATE_VARIANT}）。 */
export const RELATIONAL_VARIANT = /(?:^|:)(?:group-|peer-)/;

/**
 * `no-preference` の下で比べる動きのプロパティ。`scroll-behavior` も `reduce` の下で `!important` で固定される（`index.css`）ので、
 * `scroll-smooth` のようなクラスは `reduce` の読みでは必ず死んで見える。
 */
export const MOTION_PROBE_PROPS: readonly string[] = [...MOTION_PROPS, 'scroll-behavior'];

/**
 * 1 つのクラスを外したときの結果。`unstable` は外して戻した後の読みが外す前と違った（判定しない）。
 * `out-of-state` は、判定の前か後で要素が {@link ProbeArgs.requireMatch} の状態に無かった（判定しない）。
 */
export type ProbeStatus = 'same' | 'changed' | 'unstable' | 'out-of-state';

export interface ProbeResult {
  readonly path: string;
  readonly className: string;
  readonly token: string;
  readonly status: ProbeStatus;
}

export interface ProbeArgs {
  readonly stateVariantSource: string;
  /** null なら全プロパティ（静止の判定）。配列ならそのプロパティだけ（`no-preference` の下での動きの判定）。 */
  readonly only: readonly string[] | null;
  /** true なら、読む前に文書全体のレイアウトを作り直す（`capture.ts` の `relayout` と同じ）。 */
  readonly relayout: boolean;
  /** 判定する要素を絞る属性（null なら `body` の中の全要素）。状態の変種の判定で、状態に入れた 1 要素だけを見る。 */
  readonly targetAttr: string | null;
  /** `targetAttr` を使うときに**まとめて**外すクラス（状態の変種のクラス。組の確かめでは複数）。 */
  readonly tokens: readonly string[] | null;
  /**
   * 組の確かめ（`targetAttr` が null のとき）: 要素の道筋ごとに、まとめて外すクラスの組。null なら全要素の全クラスを
   * 1 つずつ外す。組を渡すと、その要素だけを、組をまとめて外して判定する（結果の `token` は組を ` + ` で繋いだもの）。
   */
  readonly groups: Readonly<Record<string, readonly string[]>> | null;
  /**
   * `targetAttr` の要素が、判定の前と後の両方で満たすべきセレクタ（`:focus-visible` など）。null なら確かめない。
   * **同じ評価の中で確かめる**（評価の外で確かめると、確かめてから外すまでの間にフォーカストラップが状態を外しうる）。
   */
  readonly requireMatch: string | null;
}

/** ブラウザ側で動く本体。**自己完結させる**（外の識別子を参照しない）。 */
export function probeInPage(args: ProbeArgs): ProbeResult[] {
  const stateVariant = new RegExp(args.stateVariantSource);
  /**
   * 継承するプロパティ（深い子孫で比べる）。HTML と SVG で使われうるものを広く挙げる
   * （漏れると、深い子孫にだけ効くクラスを死んでいると判定する。広い分には生きている側へ倒れるだけ）。
   */
  const INHERITED = [
    'color', 'font-family', 'font-size', 'font-style', 'font-weight', 'font-stretch', 'font-variant', 'font-variant-numeric',
    'font-variant-ligatures', 'font-variant-caps', 'font-variant-east-asian', 'font-feature-settings', 'font-variation-settings',
    'font-optical-sizing', 'font-kerning', 'letter-spacing', 'word-spacing', 'line-height', 'text-align', 'text-align-last',
    'text-transform', 'text-indent', 'text-shadow', 'text-wrap', 'text-rendering', 'text-underline-position',
    'text-emphasis-style', 'text-emphasis-color', 'text-emphasis-position', 'white-space', 'white-space-collapse',
    'word-break', 'overflow-wrap', 'line-break', 'hyphens', 'tab-size', 'visibility', 'cursor', 'pointer-events',
    'user-select', '-webkit-user-select', 'direction', 'writing-mode', 'text-orientation', 'list-style-type',
    'list-style-position', 'list-style-image', 'quotes', 'caret-color', 'accent-color', 'color-scheme', 'forced-color-adjust',
    'border-collapse', 'border-spacing', 'empty-cells', 'caption-side', 'orphans', 'widows', 'image-rendering',
    '-webkit-font-smoothing', '-webkit-text-fill-color', '-webkit-text-stroke-color', '-webkit-text-stroke-width',
    'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin',
    'stroke-dasharray', 'stroke-dashoffset', 'stroke-miterlimit', 'paint-order', 'shape-rendering', 'clip-rule',
    'marker-start', 'marker-mid', 'marker-end', 'dominant-baseline', 'text-anchor',
  ];
  const only = args.only;

  /** 終わりのあるアニメーション・遷移を終える。終えたものがあれば true（getAnimations はスタイルを確定させてから返す）。 */
  const finishRunning = (): boolean => {
    let finished = false;
    for (const animation of document.getAnimations()) {
      if (animation.playState === 'finished') continue;
      if (animation.effect?.getComputedTiming().endTime === Infinity) continue;
      animation.finish();
      finished = true;
    }
    return finished;
  };

  if (args.relayout) {
    const html = document.documentElement;
    html.style.display = 'none';
    void html.offsetWidth;
    html.style.removeProperty('display');
    if (html.getAttribute('style') === '') html.removeAttribute('style');
    void html.offsetWidth;
    finishRunning();
  }

  const pathOf = (el: Element): string => {
    const parts: string[] = [];
    let cur: Element | null = el;
    while (cur !== null) {
      const parent: Element | null = cur.parentElement;
      const tagName = cur.tagName;
      if (parent === null) {
        parts.unshift(tagName.toLowerCase());
        break;
      }
      const same = Array.from(parent.children).filter((c) => c.tagName === tagName);
      parts.unshift(`${tagName.toLowerCase()}:nth-of-type(${same.indexOf(cur) + 1})`);
      cur = parent;
    }
    return parts.join('>');
  };
  /** 読みは「どこの・どのプロパティ」を鍵にした表（外す前・外した後・戻した後をプロパティごとに突き合わせる）。 */
  type Reading = Map<string, string>;
  const props = (out: Reading, where: string, cs: CSSStyleDeclaration): void => {
    if (only !== null) {
      for (const n of only) out.set(`${where} ${n}`, cs.getPropertyValue(n));
      return;
    }
    for (let i = 0; i < cs.length; i += 1) {
      const n = cs.item(i);
      if (!n.startsWith('--')) out.set(`${where} ${n}`, cs.getPropertyValue(n));
    }
  };
  /** 要素自身と、描画される擬似要素（`placeholder:` などの変種は擬似要素にしか効かない）。 */
  const own = (out: Reading, el: Element): void => {
    const cs = getComputedStyle(el);
    props(out, 'self', cs);
    for (const pseudo of ['::before', '::after']) {
      const ps = getComputedStyle(el, pseudo);
      out.set(`self${pseudo} rendered`, String(ps.content !== 'none' && ps.content !== 'normal'));
      if (ps.content !== 'none' && ps.content !== 'normal') props(out, `self${pseudo}`, ps);
    }
    if (only === null) {
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        props(out, 'self::placeholder', getComputedStyle(el, '::placeholder'));
      }
      if (cs.display === 'list-item') props(out, 'self::marker', getComputedStyle(el, '::marker'));
    }
  };
  const read = (el: Element): Reading => {
    const out: Reading = new Map();
    own(out, el);
    Array.from(el.children).forEach((child, i) => props(out, `child${i}`, getComputedStyle(child)));
    if (only === null) {
      Array.from(el.querySelectorAll(':scope > * *')).forEach((deep, i) => {
        const cs = getComputedStyle(deep);
        for (const n of INHERITED) out.set(`deep${i} ${n}`, cs.getPropertyValue(n));
      });
    }
    return out;
  };
  /** 読んで、走り始めた遷移・アニメーションを終え、走るものが無くなるまで読み直す。 */
  const signature = (el: Element): Reading => {
    let sig = read(el);
    for (let round = 0; round < 10 && finishRunning(); round += 1) sig = read(el);
    return sig;
  };

  /**
   * プロパティごとに突き合わせる。**外す前と戻した後で同じ値のプロパティ**が、外した後に違えば生きている。
   * どのプロパティも外した後に変わらず、戻した後に違うプロパティがあれば揺れ（判定しない）。
   *
   * 文書全体を 1 つの文字列で比べると、クラスと無関係に読み値が揺れるプロパティ（閉じた `<details>` の中身の
   * `block-size` が 0px と 132px を行き来する・実測 lobby-alone）が 1 つあるだけで、明らかに効いているクラス
   * （同じ要素の `rounded-md` の `border-*-radius`）まで揺れに倒れた。
   */
  const compare = (before: Reading, after: Reading, restored: Reading): ProbeStatus => {
    let unstable = false;
    const keys = new Set([...before.keys(), ...after.keys(), ...restored.keys()]);
    for (const k of keys) {
      const b = before.get(k);
      if (restored.get(k) !== b) {
        unstable = true;
        continue;
      }
      if (after.get(k) !== b) return 'changed';
    }
    return unstable ? 'unstable' : 'same';
  };

  const judge = (el: Element, className: string, tokens: readonly string[]): ProbeResult => {
    const token = tokens.join(' + ');
    const before = signature(el);
    el.classList.remove(...tokens);
    const after = signature(el);
    el.setAttribute('class', className);
    const restored = signature(el);
    return { path: pathOf(el), className, token, status: compare(before, after, restored) };
  };

  const results: ProbeResult[] = [];
  if (args.targetAttr !== null) {
    const el = document.querySelector(`[${args.targetAttr}]`);
    if (el === null || args.tokens === null) throw new Error(`判定する要素が見つからない: [${args.targetAttr}]`);
    const className = el.getAttribute('class') ?? '';
    const match = args.requireMatch;
    const token = args.tokens.join(' + ');
    if (match !== null && !el.matches(match)) return [{ path: pathOf(el), className, token, status: 'out-of-state' }];
    const result = judge(el, className, args.tokens);
    if (match !== null && !el.matches(match)) return [{ ...result, status: 'out-of-state' }];
    return [result];
  }
  const groups = args.groups;
  for (const el of Array.from(document.body.querySelectorAll('[class]'))) {
    const className = el.getAttribute('class') ?? '';
    if (groups !== null) {
      const group = groups[pathOf(el)];
      if (group !== undefined) results.push(judge(el, className, group));
      continue;
    }
    for (const token of Array.from(el.classList)) {
      if (stateVariant.test(token)) continue;
      results.push(judge(el, className, [token]));
    }
  }
  return results;
}

/** 静止状態で、状態の変種を持たないクラスを判定する（全プロパティ・読む前にレイアウトを作り直す）。 */
export async function probeRest(page: Page): Promise<ProbeResult[]> {
  return page.evaluate(probeInPage, {
    stateVariantSource: STATE_VARIANT.source,
    only: null,
    relayout: true,
    targetAttr: null,
    tokens: null,
    groups: null,
    requireMatch: null,
  });
}

/**
 * 動きのプロパティだけで、状態の変種を持たないクラスを判定する（`no-preference` の下で呼ぶ）。
 *
 * **`reduce` の下では `transition-duration` / `animation-duration` が `!important` で 0.01ms に固定される**（`index.css`）。
 * `duration-700` などは `reduce` の読みでは必ず「変わらない」になるので、`no-preference` の読みを足して判定する。
 */
export async function probeMotion(page: Page): Promise<ProbeResult[]> {
  return page.evaluate(probeInPage, {
    stateVariantSource: STATE_VARIANT.source,
    only: [...MOTION_PROBE_PROPS],
    relayout: false,
    targetAttr: null,
    tokens: null,
    groups: null,
    requireMatch: null,
  });
}

/**
 * 組の確かめ: 要素ごとに、単独で死んでいると判定したクラスを**まとめて**外して判定する（`reduce`・全プロパティ）。
 *
 * **互いに代わりになる宣言は、片方ずつ外しても変わらない。** QR の `<img class="h-52 w-52 …">` は、元画像の縦横比で
 * 片方を外しても残りが 208px を保つので、`h-52` と `w-52` のどちらも単独では死んで見える（両方外すと元画像の 200px）。
 */
export async function probeGroups(page: Page, groups: Readonly<Record<string, readonly string[]>>): Promise<ProbeResult[]> {
  return page.evaluate(probeInPage, {
    stateVariantSource: STATE_VARIANT.source,
    only: null,
    relayout: true,
    targetAttr: null,
    tokens: null,
    groups,
    requireMatch: null,
  });
}

/** 要素の道筋（`probeInPage` の中の `pathOf` と同じ形）。`locator.evaluate` に渡す。**自己完結させる**。 */
export function elementPath(el: Element): string {
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur !== null) {
    const parent: Element | null = cur.parentElement;
    const tagName = cur.tagName;
    if (parent === null) {
      parts.unshift(tagName.toLowerCase());
      break;
    }
    const same = Array.from(parent.children).filter((c) => c.tagName === tagName);
    parts.unshift(`${tagName.toLowerCase()}:nth-of-type(${same.indexOf(cur) + 1})`);
    cur = parent;
  }
  return parts.join('>');
}

/** 判定する要素を留める属性（CSS はこの属性を見ない）。 */
const PROBE_TARGET = 'data-parity-probe';

/**
 * 状態に入れた要素から、状態の変種のクラスを外して判定する（静止と同じ範囲で比べる）。`tokens` はまとめて外す
 * （ふつうは 1 つ。組の確かめでは複数）。`requireMatch` は判定の前後で要素が満たすべきセレクタ（{@link ProbeArgs.requireMatch}）。
 */
export async function probeTokens(el: Locator, tokens: readonly string[], requireMatch: string): Promise<ProbeResult> {
  await el.evaluate((e, attr) => e.setAttribute(attr, ''), PROBE_TARGET);
  try {
    const [result] = await el.page().evaluate(probeInPage, {
      stateVariantSource: STATE_VARIANT.source,
      only: null,
      relayout: false,
      targetAttr: PROBE_TARGET,
      tokens: [...tokens],
      groups: null,
      requireMatch,
    });
    if (result === undefined) throw new Error('判定の結果が返らない');
    return result;
  } finally {
    await el.evaluate((e, attr) => e.removeAttribute(attr), PROBE_TARGET);
  }
}
