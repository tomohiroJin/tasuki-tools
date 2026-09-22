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

function parseColor(css: string): Rgba | null {
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
function composite(fg: Rgba, bg: Rgba): Rgba {
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

function relativeLuminance({ r, g, b }: Rgba): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(fg: Rgba, bg: Rgba): number {
  const [lighter, darker] = [relativeLuminance(fg), relativeLuminance(bg)].sort((x, y) => y - x);
  return ((lighter as number) + 0.05) / ((darker as number) + 0.05);
}

/**
 * WCAG AA の下限。
 *
 * 18.66px 以上の太字、または 24px 以上は「大きな文字」として 3:1 で足りる。
 * それ以外は 4.5:1。
 */
function requiredRatio(fontSizePx: number, fontWeight: number): number {
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
  /**
   * 層の `opacity`。要素自身の背景は 1。
   *
   * **擬似要素の層にだけ入る。** 擬似要素には字が乗らないので、薄さを地にだけ
   * 畳んでよい。要素自身の `opacity` は**その要素の字にも掛かる**ので、地だけに
   * 畳むと嘘になる（#296 でも扱わない。`sampleInPage` は読まない）。
   */
  readonly opacity?: number;
  /** 擬似要素が敷いた層のときだけ入る素性。地に数えるかの裁定は `groundLayers`。 */
  readonly pseudo?: PseudoOrigin;
}

/**
 * 擬似要素の素性（計算値のまま）。
 *
 * **ここに判定結果を入れない。** ブラウザの中で裁定すると、同じ判定が
 * `sampleInPage` と `groundLayers` の 2 箇所に散って食い違う（#279 の教訓）。
 */
export interface PseudoOrigin {
  readonly which: '::before' | '::after';
  /** `content` の計算値。生成されていなければ `'none'`。 */
  readonly content: string;
  readonly position: string;
  readonly zIndex: string;
  /** 何番目の祖先が持つ擬似要素か。**並べ替えを同じ要素の中に閉じるために使う**。 */
  readonly owner: number;
}

/** ページ側から持ち帰る素材。背景は「内側から外側へ」の並びで返す。 */
export interface Sample {
  /**
   * 字を塗っているもの。
   *
   * 普通は `color`（`-webkit-text-fill-color` があればそちら）だけ。
   * `background-clip: text` の字は塗りが字に乗るので、そちらの `Paint` が入る。
   * **地と同じ形で持つ** —— 読めるかどうかの裁定を 1 箇所（`imageStops`）に任せる。
   */
  readonly ink: Paint;
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
 * **ここでは「読めたか」を判定しない。** 読めない色（`oklch()` など）が来たら、
 * 下を隠すとは見なさずに層として記録し、遡り続ける。測れるかどうかの裁定は
 * `groundCandidates` が一手に引き受ける —— 判定が 2 箇所にあると食い違う。
 *
 * 外の変数を掴まないので、そのまま `locator.evaluate` に渡せる。
 */
export function sampleInPage(element: Element): Sample {
  /** 擬似要素の塗り。**選り分けずに全部持ち帰る**（裁定は `groundLayers`）。 */
  const pseudoPaints = (node: Element, owner: number): Paint[] =>
    (['::before', '::after'] as const).map((which) => {
      const ps = getComputedStyle(node, which);
      return {
        color: ps.backgroundColor,
        image: ps.backgroundImage,
        opacity: Number(ps.opacity),
        pseudo: { which, content: ps.content, position: ps.position, zIndex: ps.zIndex, owner },
      };
    });
  /** `rgb()` / `rgba()` の α。**読めない色は `null`**（透明と同じ 0 にしてはいけない）。 */
  const alphaOf = (css: string): number | null => {
    const m = /rgba?\(\s*[\d.]+[,\s]+[\d.]+[,\s]+[\d.]+(?:[,/\s]+([\d.]+))?\s*\)/.exec(css);
    if (m === null) return null;
    return m[1] === undefined ? 1 : Number(m[1]);
  };
  const stopsOf = (image: string): string[] =>
    image.includes('gradient') ? [...image.matchAll(/rgba?\([^)]*\)/g)].map((m) => m[0]) : [];
  const paintsGlyphs = (s: CSSStyleDeclaration): boolean =>
    s.backgroundClip === 'text' || s.webkitBackgroundClip === 'text';
  const style = getComputedStyle(element);
  const backgrounds: Paint[] = [];
  let node: Element | null = element;
  let owner = 0;
  while (node !== null) {
    const s = getComputedStyle(node);
    // 擬似要素が敷いた面は、その要素の背景の**内側**・子孫の背景の**外側**に入る。
    // 走査を止めるかどうかはここでは見ない —— 覆う層に当たれば
    // `groundCandidates` が外側を捨てるので、余分に集めても結果は変わらない
    backgrounds.push(...pseudoPaints(node, owner));
    owner += 1;
    // `background-clip: text` の層は**字**を塗るもので、箱には何も置かない。
    // 色も塗りもまとめて飛ばす（色だけ地に数えると、字の色で地を測ることになる）
    if (!paintsGlyphs(s)) {
      const image = s.backgroundImage;
      const colorAlpha = alphaOf(s.backgroundColor);
      if (colorAlpha === null || colorAlpha > 0 || image !== 'none') {
        backgrounds.push({ color: s.backgroundColor, image });
        // 読める塗りが箱を覆っているときだけ、そこで止める。
        // 読めない画像（写真・テクスチャ）も覆うので止めてよい ——
        // どちらの場合も測れるかは `groundCandidates` が決める
        const stops = stopsOf(image);
        const covers =
          image !== 'none' && (stops.length === 0 || stops.every((stop) => alphaOf(stop) === 1));
        if (colorAlpha === 1 || covers) break;
      }
    }
    node = node.parentElement;
  }
  // **字の色は `color` とは限らない。** `-webkit-text-fill-color` は `color` を上書きして
  // 字を塗る（`color` は不透明のまま透明な字になりうる。実測）
  const fill = style.webkitTextFillColor === '' ? style.color : style.webkitTextFillColor;
  return {
    ink:
      paintsGlyphs(style) && alphaOf(fill) === 0
        ? { color: style.backgroundColor, image: style.backgroundImage }
        : { color: fill, image: 'none' },
    backgrounds,
    fontSize: Number.parseFloat(style.fontSize),
    fontWeight: Number(style.fontWeight) || 400,
    text: (element.textContent ?? '').trim().slice(0, 40),
  };
}

/**
 * 持ち帰った層のうち、**本当に字の下に敷かれているもの**だけを内 → 外で返す（#296）。
 *
 * 擬似要素は 2 種類に分かれる。**計器ステージの方眼・グレインのように画面の裏へ
 * 敷かれるもの**（`position` が out-of-flow で `z-index` が負）は、その要素の背景の
 * 内側に入る本物の地である。一方**見出しの下の罫線のように字と並ぶもの**
 * （`position: static`）は、字が乗っていない別の箱で、地に数えると**乗っていない塗りで
 * 字を測る**ことになる。実測ではこの 2 種類しか現れなかった。
 *
 * **幾何は見ない。** 覆っているかを測り始めると検査が賢くなり、賢い分だけ穴が増える。
 * 覆っていない擬似要素を拾っても**厳しい側に倒れるだけ**なので、構文だけで決める。
 */
export function groundLayers(backgrounds: readonly Paint[]): Paint[] {
  const kept = backgrounds.filter((paint) => paint.pseudo === undefined || isGroundPseudo(paint));
  const ordered: Paint[] = [];
  for (let i = 0; i < kept.length; ) {
    const owner = kept[i]?.pseudo?.owner;
    if (owner === undefined) {
      ordered.push(kept[i] as Paint);
      i += 1;
      continue;
    }
    // **並べ替えは同じ要素の擬似要素の中だけ。** 要素をまたいで z で並べると、
    // 内側の要素の層が外側の要素の層より外へ回って下地の順序が壊れる
    let end = i;
    while (end < kept.length && kept[end]?.pseudo?.owner === owner) end += 1;
    ordered.push(...sortByPaintOrder(kept.slice(i, end)));
    i = end;
  }
  return ordered;
}

/** `z-index` の大きい方が字に近い（内側）。同値なら後から塗られた方（`::after`）が上。 */
function sortByPaintOrder(run: readonly Paint[]): Paint[] {
  return run
    .map((paint, index) => ({ paint, index }))
    .sort((a, b) => zIndexOf(b.paint) - zIndexOf(a.paint) || b.index - a.index)
    .map((entry) => entry.paint);
}

function zIndexOf(paint: Paint): number {
  return Number.parseInt(paint.pseudo?.zIndex ?? '', 10);
}

function isGroundPseudo(paint: Paint): boolean {
  const origin = paint.pseudo;
  if (origin === undefined) return false;
  // 生成されていない擬似要素は描かれない（Chromium は `none` / `normal` を返す）
  if (origin.content === 'none' || origin.content === 'normal') return false;
  // in-flow の擬似要素は字と並ぶ箱であって、字の下ではない
  if (origin.position === 'static') return false;
  // 負でない z は字の上に乗る。乗るものを地に数えると、地が明るい側へ嘘をつく
  const z = zIndexOf(paint);
  if (!Number.isFinite(z) || z >= 0) return false;
  if (paint.opacity === 0) return false;
  // 何も塗っていない層を残すと、候補が増えるだけで何も守らない
  const color = parseColor(paint.color);
  return paint.image !== 'none' || color === null || color.a > 0;
}

/**
 * 候補の上限。**超えたら「測れない」に倒す。**
 *
 * 透明な停止点を含む層は下を隠さないので、候補は層ごとに掛け算で増える。
 * 実測では羅紗だけで 6 候補（停止点 5 ＋色 1）、その上に半透明の敷きと
 * グラデーションをもう 1 枚重ねると 20 前後になる。
 * **足りなくなったら上げること** —— 上限に当たると落ちる理由が
 * 「下地か字の色を決められない」になり、本当の原因を指さなくなる。
 */
const MAX_GROUND_CANDIDATES = 32;

/**
 * 塗りの色をすべて `rgb()` として読めるか。
 *
 * **`rgb()` だけを拾って残りを捨ててはいけない。** Chromium は `oklch()` を計算値でも
 * 畳まず、`color-mix()` は `color(srgb …)` になる（実測）。拾える分だけで測ると、
 * 「停止点が全部不透明だから下を隠す層」と誤判定して**明るい停止点ごと消える**。
 *
 * 判定は**関数名の許可リスト**で行う。計算値では色は関数形（`rgb()` / `oklch()` …）に
 * 揃うので、知らない関数が出たら読めないと見なす。列挙するのは CSS の構文であって
 * 画面の都合ではないので腐らない（`url(…)` の中身は data-URI に何が入っていても
 * 構わないので、先に畳んでから見る）。
 */
function isReadablePaint(image: string): boolean {
  const withoutUrls = image.replace(/url\((?:"[^"]*"|'[^']*'|[^)]*)\)/g, 'url()');
  for (const match of withoutUrls.matchAll(/([a-z-]+)\(/g)) {
    if (!READABLE_PAINT_FUNCTIONS.has(match[1] as string)) return false;
  }
  return true;
}

const READABLE_PAINT_FUNCTIONS = new Set([
  'rgb',
  'rgba',
  'url',
  'linear-gradient',
  'radial-gradient',
  'conic-gradient',
  'repeating-linear-gradient',
  'repeating-radial-gradient',
  'repeating-conic-gradient',
]);

/**
 * 塗りの読み取り結果。**「読めない」を 2 つに分ける**（#296）。
 *
 * - `unknown` … `url(…)` のように、**何色で塗られているかが原理的に文字列から
 *   決まらない**層。写真・テクスチャがこれ。無いものとして扱わず、幅で押さえる
 * - `unreadable` … `oklch()` のように、**こちらが解けていないだけ**の色表記。
 *   幅にしてしまうと「対応すれば測れる」ことが見えなくなるので「測れない」に倒す
 */
type ImageRead =
  | { readonly kind: 'stops'; readonly stops: readonly Rgba[] }
  | { readonly kind: 'unknown' }
  | { readonly kind: 'unreadable' };

function readImage(image: string): ImageRead {
  if (image === 'none') return { kind: 'stops', stops: [] };
  // 読めない色表記が 1 つでも混ざっていたら、拾える分だけで測らない
  if (!isReadablePaint(image)) return { kind: 'unreadable' };
  // `url(…)` が 1 枚でも混ざれば、その面が何色になるかは決められない。
  // **読めた層だけで測って緑を出さない**（#296。#279 まではここが楽観側だった）
  if (image.includes('url(')) return { kind: 'unknown' };
  if (!image.includes('gradient')) return { kind: 'unreadable' };
  const stops: Rgba[] = [];
  for (const match of image.matchAll(/rgba?\([^)]*\)/g)) {
    const parsed = parseColor(match[0]);
    if (parsed === null) return { kind: 'unreadable' };
    stops.push(parsed);
  }
  return stops.length === 0 ? { kind: 'unreadable' } : { kind: 'stops', stops };
}

/**
 * 下地の候補。**読めない層が混ざると色は 1 点に決まらない**ので、取りうる明るさの
 * 暗い端と明るい端で持つ。読める層だけで塗られていれば両端は同じ色になる。
 */
export interface Ground {
  readonly darkest: Rgba;
  readonly lightest: Rgba;
}

const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };
const BLACK: Rgba = { r: 0, g: 0, b: 0, a: 1 };

/** 1 点に決まる下地。 */
const exact = (color: Rgba): Ground => ({ darkest: color, lightest: color });

/** 幅の両端それぞれに重ねる。合成は各チャンネルで単調なので、両端は両端のまま。 */
const over = (fg: Rgba, ground: Ground): Ground => ({
  darkest: composite(fg, ground.darkest),
  lightest: composite(fg, ground.lightest),
});

/** 1 つの層を、その外側の候補（`bases`）の上に重ねる。`null` は「測れない」。 */
function paintOver(paint: Paint, bases: readonly Ground[] | null): Ground[] | null {
  const opacity = paint.opacity ?? 1;
  const color = parseColor(paint.color);
  if (color === null) return null;
  const read = readImage(paint.image);
  if (read.kind === 'unreadable') return null;

  // **色を決められない層は「無いもの」にしない。** どんな色にも塗られうるので
  // 白と黒で挟む。`mix-blend-mode` もここで押さえる —— 合成を真似ずに、
  // screen（明るくする向き）は白側、multiply（暗くする向き）は黒側に入る
  if (read.kind === 'unknown') {
    if (opacity === 1) return [{ darkest: BLACK, lightest: WHITE }]; // 覆い隠す
    if (bases === null) return null; // 不透明な層に届いていない
    return bases.map((base) => ({
      darkest: composite({ ...BLACK, a: opacity }, base.darkest),
      lightest: composite({ ...WHITE, a: opacity }, base.lightest),
    }));
  }

  // 層の `opacity` は、その層の色にも停止点にも掛かる
  const fade = (c: Rgba): Rgba => ({ ...c, a: c.a * opacity });
  const stops = read.stops.map(fade);
  const tint = fade(color);

  // 停止点がすべて不透明なグラデーションは箱を覆い隠す。外側は見えない。
  // （`background-size` を縮めて敷き詰めない塗り方をすると下が覗くが、
  //   この規範ではその形を使っていない。使うなら層を分けて塗ること）
  if (stops.length > 0 && stops.every((stop) => stop.a === 1)) return stops.map(exact);

  // 色そのものが下になる。不透明ならそこで止まり、透けるなら外側と合成する。
  let unders: Ground[];
  if (tint.a === 1) unders = [exact({ ...tint })];
  else if (bases === null) return null; // 不透明な層に届いていない
  else unders = bases.map((base) => over(tint, base));

  if (stops.length === 0) return unders;
  // 透明な停止点を含むグラデーションは下を隠さないので、下の色も候補に残す
  return [...unders, ...stops.flatMap((stop) => unders.map((under) => over(stop, under)))];
}

/**
 * 集めた塗り（内 → 外）から、**下地になりうるものをすべて**出す。
 *
 * グラデーションは場所によって色が違うので、1 つの下地には畳めない。停止点を
 * 候補として並べ、**どれと比べても足りること**を呼び出し側が見る。下地を決め
 * られない場合は `null` を返す —— **黙って祖先へ遡って別のものを測らない**（#279）。
 *
 * 地に数えない層（字と並ぶ擬似要素など）はここで落とす（#296）。
 */
export function groundCandidates(backgrounds: readonly Paint[]): Ground[] | null {
  const layers = groundLayers(backgrounds);
  let candidates: Ground[] | null = null;
  for (let i = layers.length - 1; i >= 0; i -= 1) {
    candidates = paintOver(layers[i] as Paint, candidates);
    if (candidates === null) return null;
    if (candidates.length > MAX_GROUND_CANDIDATES) return null;
  }
  return candidates === null || candidates.length === 0 ? null : candidates;
}

/**
 * 字を塗っている色の候補。読めない塗りは `null`（＝測れない）。
 *
 * 停止点が取れればそれが字の色。取れなければ色そのもの（`background-clip: text` で
 * **単色**を字に流している場合がここに来る）。
 */
function inkCandidates(ink: Paint): Rgba[] | null {
  const read = readImage(ink.image);
  // **字の側は幅で測らない。** 何色か分からない塗りを白と黒で挟むと、どんな配色でも
  // 「白い字の場合がある」ことになって必ず落ちる。字は測れないと言う方が正しい
  if (read.kind !== 'stops') return null;
  if (read.stops.length > 0) return [...read.stops];
  const color = parseColor(ink.color);
  return color === null ? null : [color];
}

/** 測った結果。`ink` / `ground` は失敗時の説明に使う「一番不利だった組み合わせ」。 */
export interface Measurement {
  readonly ratio: number;
  readonly required: number;
  readonly ink: Rgba;
  readonly ground: Rgba;
}

/**
 * 持ち帰った素材から、**字と下地の最悪の組み合わせ**の比を出す。
 * **測れないときは `null`**。
 *
 * グラデーションは字の側にも下地の側にも来るので、どちらも候補の集合として扱い、
 * 総当たりで一番小さい比を採る。一番不利なところで足りていれば、面のどこに
 * 字が乗っても足りる。
 *
 * `null` を黙って読み飛ばすと、走査は「測れていないのに緑」に戻る。
 * 呼び出し側は件数を数えて 0 件であることを固定すること。
 */
export function measureSample(sample: Sample): Measurement | null {
  const grounds = groundCandidates(sample.backgrounds);
  if (grounds === null) return null;
  const inks = inkCandidates(sample.ink);
  if (inks === null) return null;

  let worst: Measurement | null = null;
  for (const ground of grounds) {
    for (const ink of inks) {
      const { ratio, at } = worstAgainst(ink, ground);
      if (worst === null || ratio < worst.ratio) {
        worst = {
          ratio,
          required: requiredRatio(sample.fontSize, sample.fontWeight),
          ink,
          ground: at,
        };
      }
    }
  }
  return worst;
}

/**
 * 1 つの字の色と 1 つの下地の候補で、**最悪の比**を出す。
 *
 * 幅を持つ候補（読めない層から来たもの）では、**両端の間で字と地の明暗が
 * 入れ替わる**ことがある。入れ替わるなら、その間に「字とまったく同じ明るさ」に
 * なる地が必ずあるので、比は 1 まで落ちうる。**両端だけ見ると見落とす。**
 *
 * 入れ替わらないなら、比は明るさについて単調なので**悪い方の端**が最悪になる。
 */
function worstAgainst(ink: Rgba, ground: Ground): { ratio: number; at: Rgba } {
  const ends = [ground.darkest, ground.lightest].map((at) => {
    const inked = composite(ink, at);
    return {
      at,
      ratio: contrastRatio(inked, at),
      inkIsLighter: relativeLuminance(inked) > relativeLuminance(at),
    };
  });
  const [darker, lighter] = ends as [(typeof ends)[number], (typeof ends)[number]];
  // 幅の中で明暗が入れ替わる ＝ 途中に「字と同じ明るさの地」がある
  if (darker.inkIsLighter !== lighter.inkIsLighter) return { ratio: 1, at: { ...ink, a: 1 } };
  return darker.ratio <= lighter.ratio
    ? { ratio: darker.ratio, at: darker.at }
    : { ratio: lighter.ratio, at: lighter.at };
}

/**
 * 失敗したときに「何を地として見たか」を読めるようにする。
 *
 * **data-URI は畳む。** 羅紗の織り目は 370 文字あり、そのまま出すと
 * **一番落ちやすい行（羅紗に直接乗った文字）の失敗メッセージが潰れる**。
 */
export function describePaint(paint: Paint): string {
  const image = paint.image.replace(/url\((?:"[^"]*"|'[^']*'|[^)]*)\)/g, 'url(…)');
  const body = paint.image === 'none' ? paint.color : `${paint.color} + ${image}`;
  // **擬似要素の層はそれと分かる形で出す。** 出どころが CSS のどこかを探すとき、
  // 祖先の背景だけを見ても見つからない（#296）
  if (paint.pseudo === undefined) return body;
  const opacity = paint.opacity === undefined || paint.opacity === 1 ? '' : ` ×${paint.opacity}`;
  return `${paint.pseudo.which}{${body}${opacity}}`;
}
