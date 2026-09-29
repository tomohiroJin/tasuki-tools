/**
 * 比較の仕組み（#321・設計正本 §5）の純関数。ブラウザにも Playwright にも触れない。
 *
 * **差として扱わないのは §5.4 の 2 類と、名指しの除外（対照実行で揺れたもの・台帳で承認したもの）だけ。**
 * それ以外の差は、前置詞つきのプロパティも timer 自身のトークンの別名も、すべて差として返す。
 *
 * PR 4 の通しの比較の後で、比較の仕組みごと消す（設計正本 §5.1）。
 */

/** 1 要素（または擬似要素）の計算済みスタイル。 */
export interface StyleEntry {
  /** `html` からの DOM の道筋（`html>body>div:nth-of-type(1)>…`）。 */
  readonly path: string;
  /** 擬似要素（`::before` など）。要素そのものは空文字。 */
  readonly pseudo: string;
  readonly props: Readonly<Record<string, string>>;
}

export interface StyleDiff {
  readonly path: string;
  readonly pseudo: string;
  /** プロパティ名。道筋か擬似要素が片側にしか無いときは `*`。 */
  readonly prop: string;
  /** その側に無いときは null。道筋ごと片側にしか無いときは `(あり)`。 */
  readonly base: string | null;
  readonly branch: string | null;
}

/** 名指しの除外。理由を必ず持つ（台帳と `noise.ts` がこれを引用する）。 */
export interface IgnoreRule {
  readonly path: RegExp;
  readonly prop: RegExp;
  readonly reason: string;
}

export interface CompareOptions {
  /** Tailwind の theme 層が定義する変数の名前（§5.4 の類 1）。 */
  readonly tailwindThemeVars: ReadonlySet<string>;
  /** 名指しの除外（対照実行で揺れたもの・台帳で承認したもの）。 */
  readonly ignore: readonly IgnoreRule[];
}

/** §5.4 の類 1: `--tw-` で始まるか、Tailwind の theme 層が定義する変数。 */
export function isTailwindCustomProp(name: string, themeVars: ReadonlySet<string>): boolean {
  return name.startsWith('--tw-') || themeVars.has(name);
}

/** 括弧の外のカンマで分ける。 */
function splitTopLevel(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of value) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      out.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim() !== '') out.push(current.trim());
  return out;
}

/** 長さがすべて 0 で、色の α が 0 の層か。`rgb()` / `rgba()` / `transparent` 以外の色は不透明とみなす（安全側）。 */
function isTransparentZeroLayer(layer: string): boolean {
  const rgb = /rgba?\(([^)]*)\)/.exec(layer);
  let alpha: number;
  if (rgb !== null) {
    const parts = (rgb[1] ?? '').split(/[\s,/]+/).filter((s) => s !== '');
    alpha = parts.length >= 4 ? Number(parts[3]) : 1;
  } else if (/\btransparent\b/.test(layer)) {
    alpha = 0;
  } else {
    return false;
  }
  const lengths = layer
    .replace(/rgba?\([^)]*\)|\btransparent\b|\binset\b/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((s) => s !== '');
  return alpha === 0 && lengths.length > 0 && lengths.every((l) => /^-?0(?:px)?$/.test(l));
}

/** §5.4 の類 2: `box-shadow` の透明な 0 層を取り除く。 */
export function normalizeBoxShadow(value: string): string {
  if (value === 'none') return value;
  const kept = splitTopLevel(value).filter((layer) => !isTransparentZeroLayer(layer));
  return kept.length === 0 ? 'none' : kept.join(', ');
}

function normalize(prop: string, value: string): string {
  return prop === 'box-shadow' ? normalizeBoxShadow(value) : value;
}

function isIgnored(path: string, prop: string, rules: readonly IgnoreRule[]): boolean {
  return rules.some((r) => r.path.test(path) && r.prop.test(prop));
}

const keyOf = (e: { path: string; pseudo: string }): string => `${e.path}\u0000${e.pseudo}`;

/** 基準とブランチの計算済みスタイルを突き合わせる。道筋・擬似要素・プロパティが片側にしか無いものも差にする。 */
export function diffEntries(
  base: readonly StyleEntry[],
  branch: readonly StyleEntry[],
  options: CompareOptions,
): StyleDiff[] {
  const baseMap = new Map(base.map((e) => [keyOf(e), e]));
  const branchMap = new Map(branch.map((e) => [keyOf(e), e]));
  const keys = [...new Set([...baseMap.keys(), ...branchMap.keys()])].sort();
  const diffs: StyleDiff[] = [];
  for (const key of keys) {
    const b = baseMap.get(key);
    const r = branchMap.get(key);
    const sample = b ?? r;
    if (sample === undefined) continue;
    if (b === undefined || r === undefined) {
      if (isIgnored(sample.path, '*', options.ignore)) continue;
      diffs.push({
        path: sample.path,
        pseudo: sample.pseudo,
        prop: '*',
        base: b === undefined ? null : '(あり)',
        branch: r === undefined ? null : '(あり)',
      });
      continue;
    }
    const props = [...new Set([...Object.keys(b.props), ...Object.keys(r.props)])].sort();
    for (const prop of props) {
      if (prop.startsWith('--') && isTailwindCustomProp(prop, options.tailwindThemeVars)) continue;
      if (isIgnored(b.path, prop, options.ignore)) continue;
      const bv = b.props[prop];
      const rv = r.props[prop];
      if (bv !== undefined && rv !== undefined && normalize(prop, bv) === normalize(prop, rv)) continue;
      diffs.push({ path: b.path, pseudo: b.pseudo, prop, base: bv ?? null, branch: rv ?? null });
    }
  }
  return diffs;
}

/** 中身が違う・片側にしか無いキーフレームの名前。 */
export function diffKeyframes(
  base: Readonly<Record<string, string>>,
  branch: Readonly<Record<string, string>>,
): string[] {
  const names = [...new Set([...Object.keys(base), ...Object.keys(branch)])].sort();
  return names.filter((n) => base[n] !== branch[n]);
}

/** Tailwind の theme 層（`@layer theme{…}`）が定義する `--*` の名前。層の外は含めない。 */
export function themeVarNamesFromCss(css: string): Set<string> {
  const names = new Set<string>();
  const start = css.indexOf('@layer theme{');
  if (start < 0) return names;
  let depth = 0;
  let end = start;
  for (let i = css.indexOf('{', start); i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}') depth -= 1;
    if (depth === 0) {
      end = i;
      break;
    }
  }
  for (const m of css.slice(start, end).matchAll(/(--[\w-]+)\s*:/g)) {
    if (m[1] !== undefined) names.add(m[1]);
  }
  return names;
}
