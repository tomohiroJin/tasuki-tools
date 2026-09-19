/**
 * コントラスト比の計算（WCAG 2.1 の相対輝度式）。
 *
 * **依存を足さずに済ませる。** 式は 20 行ほどで足り、axe のような汎用スキャナを
 * 入れると #78 のスコープ外の既存の負債まで拾って CI を赤くする。
 *
 * 実際に適用された色は `getComputedStyle` で取る。半透明の背景も、グラデーションで
 * 塗られた面も、祖先へ遡って組み立てないと本当の下地が分からない
 * （`sampleInPage` で集め、`groundCandidates` で候補にする）。
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

/**
 * 1 つの要素が塗っているもの。
 *
 * **「層 = 1 色」ではない。** `background: linear-gradient(…)` は shorthand なので
 * `background-color` を透明に戻す一方、`background-image` に停止点が入る。色だけを
 * 見ると「何も塗っていない」と読めてしまうので、両方を持ち帰って候補にする（#279）。
 */
export interface Paint {
  readonly color: string;
  /** `background-image` の計算値。塗っていなければ `'none'`。 */
  readonly image: string;
}

/** ページ側から持ち帰る素材。背景は「内側から外側へ」の並びで返す。 */
export interface Sample {
  readonly color: string;
  /**
   * 字を塗っている色の候補。
   *
   * 普通は `color` 1 つ。`background-clip: text` の字は `color` が透明なので、
   * 代わりに塗りの停止点が入る（そのまま測ると下地と同色になり比が 1.0 に落ちる）。
   */
  readonly ink: readonly string[];
  /** 要素自身から、最初の不透明な祖先までの塗り（内 → 外）。 */
  readonly backgrounds: readonly Paint[];
  readonly fontSize: number;
  readonly fontWeight: number;
  readonly text: string;
}

/**
 * ブラウザの中で、要素の前景色・背景の重なり・字の大きさを取る。
 *
 * **背景は祖先へ遡って集める。** 要素自身の `background-color` は
 * `rgba(0, 0, 0, 0)` であることが多く、そのまま使うと「透明の上の文字」を
 * 測ることになって比が無限大になり、**どんな配色でも通ってしまう**。
 *
 * 半透明が重なっている場合（淡い敷きの上の文字など）に備えて、**1 枚だけ拾わず
 * 不透明な層に当たるまで全部集める**。不透明かどうかは色だけでは決まらない ——
 * **停止点がすべて不透明なグラデーションは、その層で下を隠す**（#279）。
 * 合成と候補の組み立ては呼び出し側（`groundCandidates`）が行う。
 *
 * 外の変数を掴まないので、そのまま `locator.evaluate` に渡せる。
 */
export function sampleInPage(element: Element): Sample {
  const alphaOf = (css: string): number => {
    const m = /rgba?\(\s*[\d.]+[,\s]+[\d.]+[,\s]+[\d.]+(?:[,/\s]+([\d.]+))?\s*\)/.exec(css);
    if (m === null) return 0;
    return m[1] === undefined ? 1 : Number(m[1]);
  };
  const stopsOf = (image: string): string[] =>
    image.includes('gradient') ? [...image.matchAll(/rgba?\([^)]*\)/g)].map((m) => m[0]) : [];
  const paintsGlyphs = (s: CSSStyleDeclaration): boolean =>
    s.backgroundClip === 'text' || s.webkitBackgroundClip === 'text';
  const style = getComputedStyle(element);
  const backgrounds: Paint[] = [];
  let node: Element | null = element;
  while (node !== null) {
    const s = getComputedStyle(node);
    // `background-clip: text` の塗りは**字**に乗るもので、箱の下地ではない
    const image = paintsGlyphs(s) ? 'none' : s.backgroundImage;
    const stops = stopsOf(image);
    const colorAlpha = alphaOf(s.backgroundColor);
    if (colorAlpha > 0 || image !== 'none') {
      backgrounds.push({ color: s.backgroundColor, image });
      // 読めない塗り（画像）は下を隠しているかもしれないので、そこで止める。
      // 候補を組み立てる側が「測れない」と判断する
      const opaqueImage =
        image !== 'none' &&
        (stops.length === 0 || stops.every((stop) => alphaOf(stop) === 1));
      if (colorAlpha === 1 || opaqueImage) break;
    }
    node = node.parentElement;
  }
  return {
    color: style.color,
    ink:
      paintsGlyphs(style) && alphaOf(style.color) === 0
        ? stopsOf(style.backgroundImage)
        : [style.color],
    backgrounds,
    fontSize: Number.parseFloat(style.fontSize),
    fontWeight: Number(style.fontWeight) || 400,
    text: (element.textContent ?? '').trim().slice(0, 40),
  };
}

/**
 * 候補の上限。**超えたら「測れない」に倒す。**
 *
 * 透明な停止点を含む層は下を隠さないので、候補は層ごとに掛け算で増える。
 * 現に出る形（羅紗 1 枚＋淡い敷き 1〜2 枚）では 10 を超えない。
 */
const MAX_GROUND_CANDIDATES = 32;

/** `background-image` が塗る色。読めない塗り（画像など）は `null`。 */
function imageStops(image: string): Rgba[] | null {
  if (image === 'none') return [];
  // グラデーション以外（`url(…)` の写真・テクスチャ）は、何色で塗られているかが
  // 文字列から分からない。**祖先へ抜けて別のものを測るより「測れない」に倒す**
  if (!image.includes('gradient')) return null;
  const stops: Rgba[] = [];
  for (const match of image.matchAll(/rgba?\([^)]*\)/g)) {
    const parsed = parseColor(match[0]);
    if (parsed === null) return null;
    stops.push(parsed);
  }
  return stops.length === 0 ? null : stops;
}

/** 1 つの層を、その外側の候補（`bases`）の上に重ねる。`null` は「測れない」。 */
function paintOver(paint: Paint, bases: readonly Rgba[] | null): Rgba[] | null {
  const color = parseColor(paint.color);
  if (color === null) return null;
  const stops = imageStops(paint.image);
  if (stops === null) return null;

  // 停止点がすべて不透明なグラデーションは箱を覆い隠す。外側は見えない。
  // （`background-size` を縮めて敷き詰めない塗り方をすると下が覗くが、
  //   この規範ではその形を使っていない。使うなら層を分けて塗ること）
  if (stops.length > 0 && stops.every((stop) => stop.a === 1)) return stops;

  // 色そのものが下になる。不透明ならそこで止まり、透けるなら外側と合成する。
  let unders: Rgba[];
  if (color.a === 1) unders = [{ ...color }];
  else if (bases === null) return null; // 不透明な層に届いていない
  else unders = bases.map((base) => composite(color, base));

  if (stops.length === 0) return unders;
  // 透明な停止点を含むグラデーションは下を隠さないので、下の色も候補に残す
  return [...unders, ...stops.flatMap((stop) => unders.map((under) => composite(stop, under)))];
}

/**
 * 集めた塗り（内 → 外）から、**下地になりうる色をすべて**出す。
 *
 * グラデーションは場所によって色が違うので、1 つの下地には畳めない。停止点を
 * 候補として並べ、**どれと比べても足りること**を呼び出し側が見る。下地を決め
 * られない場合は `null` を返す —— **黙って祖先へ遡って別のものを測らない**（#279）。
 */
export function groundCandidates(backgrounds: readonly Paint[]): Rgba[] | null {
  let candidates: Rgba[] | null = null;
  for (let i = backgrounds.length - 1; i >= 0; i -= 1) {
    candidates = paintOver(backgrounds[i] as Paint, candidates);
    if (candidates === null) return null;
    if (candidates.length > MAX_GROUND_CANDIDATES) return null;
  }
  return candidates === null || candidates.length === 0 ? null : candidates;
}

/**
 * 字と下地の**最悪の組み合わせ**の比。
 *
 * グラデーションは字の側にも下地の側にも来るので、どちらも候補の集合として扱い、
 * 総当たりで一番小さい比を返す。一番不利なところで足りていれば、面のどこに
 * 字が乗っても足りる。
 */
export function worstContrast(inks: readonly Rgba[], grounds: readonly Rgba[]): number {
  let worst = Number.POSITIVE_INFINITY;
  for (const ground of grounds) {
    for (const ink of inks) {
      worst = Math.min(worst, contrastRatio(composite(ink, ground), ground));
    }
  }
  return worst;
}

/** 測った結果。`ink` / `ground` は失敗時の説明に使う「一番不利だった組み合わせ」。 */
export interface Measurement {
  readonly ratio: number;
  readonly required: number;
  readonly ink: Rgba;
  readonly ground: Rgba;
}

/**
 * 持ち帰った素材から比を出す。**測れないときは `null`**。
 *
 * `null` を黙って読み飛ばすと、走査は「測れていないのに緑」に戻る。
 * 呼び出し側は件数を数えて 0 件であることを固定すること。
 */
export function measureSample(sample: Sample): Measurement | null {
  const grounds = groundCandidates(sample.backgrounds);
  if (grounds === null) return null;
  const inks: Rgba[] = [];
  for (const candidate of sample.ink) {
    const parsed = parseColor(candidate);
    if (parsed === null) return null;
    inks.push(parsed);
  }
  if (inks.length === 0) return null;

  let worst: Measurement | null = null;
  for (const ground of grounds) {
    for (const ink of inks) {
      const ratio = contrastRatio(composite(ink, ground), ground);
      if (worst === null || ratio < worst.ratio) {
        worst = { ratio, required: requiredRatio(sample.fontSize, sample.fontWeight), ink, ground };
      }
    }
  }
  return worst;
}

/** 失敗したときに「何を地として見たか」を読めるようにする。 */
export function describePaint(paint: Paint): string {
  return paint.image === 'none' ? paint.color : `${paint.color} + ${paint.image}`;
}
