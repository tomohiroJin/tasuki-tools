/**
 * コントラスト比の計算（WCAG 2.1 の相対輝度式）。
 *
 * **依存を足さずに済ませる。** 式は 20 行ほどで足り、axe のような汎用スキャナを
 * 入れると #78 のスコープ外の既存の負債まで拾って CI を赤くする。
 *
 * 実際に適用された色は `getComputedStyle` で取る。半透明の背景は、祖先へ遡って
 * 合成しないと本当の下地が分からない（`composeBackground` を参照）。
 */

/** `rgb(r, g, b)` / `rgba(r, g, b, a)` を解く。 */
export interface Rgba {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

export function parseColor(css: string): Rgba | null {
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)/.exec(css);
  if (m === null) return null;
  return {
    r: Number(m[1]),
    g: Number(m[2]),
    b: Number(m[3]),
    a: m[4] === undefined ? 1 : Number(m[4]),
  };
}

/** 前景を背景の上に重ねた実効色。 */
export function composite(fg: Rgba, bg: Rgba): Rgba {
  const a = fg.a;
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
    a: 1,
  };
}

function channel(value: number): number {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance({ r, g, b }: Rgba): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(fg: Rgba, bg: Rgba): number {
  const [lighter, darker] = [relativeLuminance(fg), relativeLuminance(bg)].sort((x, y) => y - x);
  return ((lighter as number) + 0.05) / ((darker as number) + 0.05);
}

/**
 * WCAG AA の下限。
 *
 * 18.66px 以上の太字、または 24px 以上は「大きな文字」として 3:1 で足りる。
 * それ以外は 4.5:1。
 */
export function requiredRatio(fontSizePx: number, fontWeight: number): number {
  const large = fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700);
  return large ? 3 : 4.5;
}

/** ページ側から持ち帰る素材。背景は「内側から外側へ」の並びで返す。 */
export interface Sample {
  readonly color: string;
  /** 要素自身から、最初の不透明な祖先までの背景色（内 → 外）。 */
  readonly backgrounds: readonly string[];
  readonly fontSize: number;
  readonly fontWeight: number;
  readonly text: string;
}

/**
 * ブラウザの中で、要素の前景色・背景色の重なり・字の大きさを取る。
 *
 * **背景は祖先へ遡って集める。** 要素自身の `background-color` は
 * `rgba(0, 0, 0, 0)` であることが多く、そのまま使うと「透明の上の文字」を
 * 測ることになって比が無限大になり、**どんな配色でも通ってしまう**。
 *
 * 半透明が重なっている場合（淡い敷きの上の文字など）に備えて、**1 枚だけ拾わず
 * 不透明な祖先に当たるまで全部集める**。合成は呼び出し側で行う。
 *
 * 外の変数を掴まないので、そのまま `locator.evaluate` に渡せる。
 */
export function sampleInPage(element: Element): Sample {
  const alphaOf = (css: string): number => {
    const m = /rgba?\(\s*[\d.]+[,\s]+[\d.]+[,\s]+[\d.]+(?:[,/\s]+([\d.]+))?\s*\)/.exec(css);
    if (m === null) return 0;
    return m[1] === undefined ? 1 : Number(m[1]);
  };
  const style = getComputedStyle(element);
  const backgrounds: string[] = [];
  let node: Element | null = element;
  while (node !== null) {
    const bg = getComputedStyle(node).backgroundColor;
    const alpha = alphaOf(bg);
    if (alpha > 0) {
      backgrounds.push(bg);
      if (alpha === 1) break;
    }
    node = node.parentElement;
  }
  return {
    color: style.color,
    backgrounds,
    fontSize: Number.parseFloat(style.fontSize),
    fontWeight: Number(style.fontWeight) || 400,
    text: (element.textContent ?? '').trim().slice(0, 40),
  };
}

/** 集めた背景（内 → 外）を、外側から順に重ねて実効的な下地を作る。 */
export function effectiveBackground(backgrounds: readonly string[]): Rgba | null {
  const layers = backgrounds.map(parseColor);
  if (layers.some((l) => l === null) || layers.length === 0) return null;
  const outermost = layers[layers.length - 1] as Rgba;
  // 一番外（不透明）から内側へ向かって重ねる
  let base: Rgba = { ...outermost, a: 1 };
  for (let i = layers.length - 2; i >= 0; i -= 1) {
    base = composite(layers[i] as Rgba, base);
  }
  return base;
}
