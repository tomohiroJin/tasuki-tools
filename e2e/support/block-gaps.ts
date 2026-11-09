/**
 * 隣り合うブロックの重なりと間を、画面の幅ごとに測る共通の補助（#557・#479 B・ADR 0035）。
 *
 * 既存の `expectScreenAcrossWidths`（`a11y.ts`）が測るのは押せる操作の大きさ・当たりの重なり・横のはみ出し・ボタンの字の折れで、
 * **ブロックどうしの間と重なり**は誰も測っていなかった。洗い出し（#479）の崩れはどれも既存の検査を緑のまま通った。
 *
 * 測り方は 2 段に分ける。
 *   1. ページの中で、見えている要素の箱と性質（位置・表示・字だけか・変形など）を木のまま集める（{@link collectBlocks}）。判定はしない。
 *   2. 集めた木から、**同じ親を持つ隣り合う子**だけを取り出して判定する（{@link findBlockProblems}。ブラウザの要らない純関数。
 *      除く規則の取り違えは、ブラウザの無い単体の試験（`tests/block-gaps.test.ts`）と変異で守る）。
 *
 * 判定は 2 つ。
 *   - **重なり**: 同じ親の子どうしの箱が 0.5px を超えて重なる。
 *   - **間**: 縦に積まれた子どうし（横の範囲が重なる）の縦の間が {@link MIN_BLOCK_GAP}（`--space-2` ＝ 8px）未満。
 *     縦の間は親の `gap` が持つ（ADR 0035 決定 1）ので、子へ余白を足した所が後から負けて 0 になる崩れ（一覧 #1・#3）を捕まえる。
 *
 * **除く規則（偽陽性）は {@link SKIP_RULES} と {@link SPACING_SKIP_RULES} に理由つきで並べる。** 許可リストは最小にし、
 * 要素の名前（クラス）では除かず、**性質（位置・表示・変形・字だけか）で除く**。クラス名を並べると、新しい画面が黙って測られなくなる。
 */
import { expect, type Page } from '@playwright/test';
import { settleFiniteAnimations } from './a11y';

/**
 * ブロックの間の下限（px）。`--space-2`（0.5rem）。ADR 0035 決定 2 の表で、ブロックの中の要素どうしの最低限
 * （区画の中のブロックどうしは `--space-3`＝12px、区画どうしは `--space-5`）。2 つの箱（字だけでない）が縦に積まれたときの下限。
 */
export const MIN_BLOCK_GAP = 8;
/**
 * 片方が字の行（見出し・ラベル・キャプション・値）のときの縦の間の下限（px）。`--space-1`（0.25rem）。
 * ラベルと直下の欄・見出しと直下の一覧・札と下の名前は、1 つの組として詰めて置く（4〜6px）。0 や 1〜3px は詰めすぎ（一覧 #1 は 0、#3 は 3.2px）。
 */
export const MIN_CAPTION_GAP = 4;
/** 重なりと見なす最小の食い込み（px）。Chromium のレイアウトの丸め（1/64px）と、線の太さの揺れを吸う。 */
export const OVERLAP_TOLERANCE = 0.5;
/** 測る幅（ISSUE #557）。390 は 40rem 未満のうち最も多い実機の幅。 */
export const BLOCK_WIDTHS = [320, 390, 768, 1280, 1920] as const;

/** ページから集めた 1 要素。座標は表示領域（viewport）の px。 */
export interface BlockNode {
  readonly id: number;
  /** 親の id（`document.body` が根で -1） */
  readonly parent: number;
  /** 人が探せる名前（`div.room-main > section.panel`） */
  readonly path: string;
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly position: string;
  readonly display: string;
  /**
   * 実際に動かす変形がある（`transform`・`translate`・`rotate`・`scale`）。**何も動かさない変形（恒等の行列・`0px` の translate・`scale: 1`）は含めない**
   * （終わった入場の演出 `animation: … both` は、終わった後も恒等の `matrix(1, 0, 0, 1, 0, 0)` を計算値に残す）。
   */
  readonly transformed: boolean;
  /** 形を歪める変形（回転・3D・拡大縮小・傾き）。平行移動だけなら偽（兄弟どうしの位置関係は変わらないので、子孫は測る） */
  readonly distorted: boolean;
  /** 字を切る面（`text-overflow: ellipsis` か `-webkit-line-clamp`）。字の矩形が見えている範囲より広い */
  readonly truncates: boolean;
  /**
   * 字だけ（見出し・ラベル・キャプション・値・段落）。**許可リストで決める**（{@link classifyTextOnly}）: 要素自身が字の要素の許可リストに入り、
   * 自分も子孫も背景・枠・影を塗らず、押せるもの・入力欄・置き換え要素（button・a・input・img・svg など）を持たない。
   */
  readonly textOnly: boolean;
  /** 描かれた字の行数（字だけの要素。字が無ければ 0）。1 行なら「字の行」、2 行以上は段落 */
  readonly lines: number;
  /** 字だけの要素の、描かれた字の矩形（Range の矩形の外接）。字が無ければ箱と同じ。行の高さの余白でなく字そのものの重なりを見る */
  readonly ink: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number };
  /** 要素の種類（`label`・`li` など。小文字） */
  readonly tag: string;
  /**
   * 目に見える上端・下端（px）。背景・枠・影を塗る箱は箱の端そのもの。**塗らない入れ物は、中身の端**（上は padding と枠の内側・下も同じ）。
   * 塗らない入れ物の padding は、見た目では空き（中身が始まるまでの間）になるので、間に数える。
   */
  readonly visTop: number;
  readonly visBottom: number;
  /** 親の箱の幅（px）。貼りつく帯（親の幅いっぱい）と、貼りつく脇の欄（親より狭い）を分ける */
  readonly parentWidth: number;
  /** `role` 属性（`tablist` など） */
  readonly role: string;
  /** 左右の枠が無く、上か下にだけ罫線がある（線で区切った行）。枠で囲んだ札（四方の枠）は含まない */
  readonly ruledTop: boolean;
  readonly ruledBottom: boolean;
}

export interface BlockProblem {
  readonly kind: 'overlap' | 'gap';
  readonly message: string;
}

/** ブラウザから集めた生の要素。`textOnly` はまだ決めていない（{@link classifyTextOnly} が決める）。`paints` は自分が背景・枠・影を塗る。 */
export type RawBlockNode = Omit<BlockNode, 'textOnly' | 'transformed' | 'distorted'> & {
  readonly paints: boolean;
  /** 変形の計算値（文字列のまま）。判定は {@link classifyTransform}（ブラウザの要らない純関数） */
  readonly css: { readonly transform: string; readonly translate: string; readonly rotate: string; readonly scale: string };
};

/**
 * 変形の計算値から、実際に動かすか（`moved`）・形を歪めるか（`distorted`）を決める。純関数。
 * 何も動かさない変形（恒等の `matrix(1, 0, 0, 1, 0, 0)`・`0px` の translate・`scale: 1`・`rotate: 0deg`）はどちらでもない。
 * 平行移動だけは `moved` だけ（兄弟どうしの位置関係が変わらないので、子孫は測る）。回転・3D・拡大縮小・傾きは `distorted`。
 */
export function classifyTransform(css: RawBlockNode['css']): { moved: boolean; distorted: boolean } {
  let moved = false;
  let distorted = false;
  if (css.transform !== 'none') {
    const nums = /^matrix(3d)?\((.*)\)$/.exec(css.transform);
    const v = nums === null ? [] : (nums[2] ?? '').split(',').map((x) => Number.parseFloat(x));
    if (nums === null || nums[1] !== undefined) distorted = true;
    else if (v[0] !== 1 || v[1] !== 0 || v[2] !== 0 || v[3] !== 1) distorted = true;
    else if (v[4] !== 0 || v[5] !== 0) moved = true;
  }
  if (css.translate !== 'none' && css.translate.split(' ').some((x) => Number.parseFloat(x) !== 0)) moved = true;
  if (css.rotate !== 'none' && Number.parseFloat(css.rotate) !== 0) distorted = true;
  if (css.scale !== 'none' && css.scale.split(' ').some((x) => Number.parseFloat(x) !== 1)) distorted = true;
  return { moved, distorted };
}

/** 字を入れるブロックの要素（許可リスト）。`div` は中が inline の字だけのときに限る（下の {@link classifyTextOnly}）。 */
export const TEXT_BLOCK_TAGS: ReadonlySet<string> = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'label', 'li', 'dt', 'dd', 'figcaption', 'blockquote', 'pre', 'div']);
/** 字を入れる inline の要素（許可リスト）。 */
export const TEXT_INLINE_TAGS: ReadonlySet<string> = new Set(['span', 'strong', 'em', 'small', 'time', 'b', 'i', 'code', 'mark', 'abbr', 'sub', 'sup', 'q', 'cite']);

/**
 * 字だけの要素に印を付ける。**許可リストの判定**（逆の「箱でないものを除く」にしない: 新しい要素・部品が黙って字だけに入らない）。
 *   - 要素自身が {@link TEXT_BLOCK_TAGS} か {@link TEXT_INLINE_TAGS} に入る（button・a・input・textarea・select・img・svg・summary などは入らない）
 *   - 自分が背景・枠・影を塗らない（`paints`）
 *   - 子（集めた要素）がすべて字だけ。`div` は子がすべて inline の字のときだけ（入れ物の div は字の行ではない）
 * 親が子より先に並ぶ順（集めた順）なので、後ろから 1 回走査すれば子が先に決まる。O(n)。
 */
export function classifyTextOnly(raw: readonly RawBlockNode[]): BlockNode[] {
  const children = new Map<number, RawBlockNode[]>();
  for (const n of raw) children.set(n.parent, [...(children.get(n.parent) ?? []), n]);
  const textOnly = new Map<number, boolean>();
  for (let i = raw.length - 1; i >= 0; i -= 1) {
    const n = raw[i]!;
    const kids = children.get(n.id) ?? [];
    const allowed = TEXT_BLOCK_TAGS.has(n.tag) || TEXT_INLINE_TAGS.has(n.tag);
    const kidsOk = kids.every((k) => textOnly.get(k.id) === true);
    const divOk = n.tag !== 'div' || kids.every((k) => TEXT_INLINE_TAGS.has(k.tag));
    textOnly.set(n.id, allowed && !n.paints && kidsOk && divOk);
  }
  return raw.map((n) => {
    const { moved, distorted } = classifyTransform(n.css);
    return { ...n, textOnly: textOnly.get(n.id) === true, transformed: moved || distorted, distorted };
  });
}

/** 除く規則 1 つ。`reason` は理由。`test` が真なら、その子は隣り合う判定に入れない。 */
interface SkipRule {
  readonly name: string;
  readonly reason: string;
  readonly test: (n: BlockNode) => boolean;
}

/**
 * **重なりも間も測らない子**（隣り合う判定に入れない）。許可リストは最小にしてある。
 * 要素の名前では除かない（新しい画面が黙って測られなくなるため）。
 */
export const SKIP_RULES: readonly SkipRule[] = [
  {
    name: '貼りつく帯',
    reason: '`position: fixed` と、親の幅いっぱいの `position: sticky`（下端・上端の操作の帯）は、スクロールの位置で他の中身の上に乗るのが仕様。帯が中身を隠さないことは `header-and-dock.spec.ts` が最下部で測る（ADR 0036）。**親より狭い sticky（読む面の脇の欄など）は帯ではない**ので除かない（測るのはページの先頭に戻した状態で、兄弟と重ならない）',
    test: (n) => n.position === 'fixed' || (n.position === 'sticky' && n.right - n.left >= n.parentWidth - STICKY_BAND_SLACK),
  },
  {
    name: '行の中の字',
    reason: '`display: inline` の箱は、折り返すと各行の断片を囲む大きな矩形（行をまたぐ外接）になり、隣の `inline` や次の行の字と重なって見える。字の行どうしの重なりは、字だけの 2 つの判定が描かれた字の矩形で見る',
    test: (n) => n.display === 'inline',
  },
  {
    name: '流れの外の部品',
    reason: '`position: absolute` は親の流れに入らない（QR の浮かぶカード・バッジ・盤の針・ポップオーバー）。重なりは意図したもの。隣り合う、という関係が無い',
    test: (n) => n.position === 'absolute',
  },
  {
    name: '変形した部品',
    reason: '傾けた札の扇・手札の浮き上がり・盤の針は、`transform` で意図して重ねる。矩形（`getBoundingClientRect`）は変形を含むので、意図した重なりがそのまま「重なる」と出る。変形した部品は隣り合う判定に入れない',
    test: (n) => n.transformed,
  },
  {
    name: '字を切る面',
    reason: '`text-overflow: ellipsis` と `-webkit-line-clamp` は、切られて見えない字の分まで箱に入る。測ると見えない部分が隣に重なる',
    test: (n) => n.truncates,
  },
  {
    name: '線・点',
    reason: '高さか幅が 2px 未満の箱（区切り線・アイコンの点）は、ブロックではなく飾り。隣との間は線の太さで決まる',
    test: (n) => n.right - n.left < 2 || n.bottom - n.top < 2,
  },
];

/** 親の幅いっぱいとみなす余裕（px）。親の padding・枠・スクロールバーで 1〜2px ずれる。 */
const STICKY_BAND_SLACK = 2;

/** 表を作る表示。行どうしは線で区切る表で、間 0 が正しい（agenda の終了後の表）。 */
const TABLE_DISPLAY = /^(table|inline-table)/;

/**
 * **間だけ測らない組**（重なりは測る）。上の子 `a` と下の子 `b` を受け取る。
 */
export const SPACING_SKIP_RULES: readonly { readonly name: string; readonly reason: string; readonly test: (a: BlockNode, b: BlockNode) => boolean }[] = [
  {
    name: '表の行',
    reason: '`display: table*` の行・セルは線で区切る。間 0 が正しい',
    test: (a, b) => TABLE_DISPLAY.test(a.display) || TABLE_DISPLAY.test(b.display),
  },
  {
    name: '線で区切った行',
    reason: '左右の枠が無く、上下だけに罫線がある行（agenda の進行表）は、線で区切る一覧で間 0 が正しい。四方を枠で囲んだ札は含めない（札どうしは間が要る）',
    test: (a, b) => a.ruledBottom || b.ruledTop,
  },
  {
    name: '文の中の箱',
    reason: '`display: inline*` は行の中に並ぶ字や操作で、行間は行の高さが持つ（折り返した操作の行間は押せる操作の検査が見る）',
    test: (a, b) => a.display.startsWith('inline') || b.display.startsWith('inline'),
  },
  {
    name: 'タブの帯と面',
    reason: '`role="tablist"` の帯は、下の面（`tabpanel`）に接して 1 つの塊に見える作り。間を空けると切り離される',
    test: (a) => a.role === 'tablist',
  },
];

/**
 * 集めた木から、同じ親の子どうしの重なりと縦の間を判定する。純関数。
 * `minGap` は縦の間の下限（既定 {@link MIN_BLOCK_GAP}）。
 */
export function findBlockProblems(nodes: readonly BlockNode[], minGap: number = MIN_BLOCK_GAP, captionGap: number = MIN_CAPTION_GAP): BlockProblem[] {
  // 形を歪める変形（回転・3D・拡大縮小・傾き）の下の子孫は、親の変形で矩形が射影され、箱の間も重なりも意味を持たない。平行移動だけの下は測る
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const underTransform = (n: BlockNode): boolean => {
    for (let p = byId.get(n.parent); p !== undefined; p = byId.get(p.parent)) if (p.distorted) return true;
    return false;
  };
  const byParent = new Map<number, BlockNode[]>();
  for (const n of nodes) {
    if (SKIP_RULES.some((r) => r.test(n)) || underTransform(n)) continue;
    const list = byParent.get(n.parent) ?? [];
    list.push(n);
    byParent.set(n.parent, list);
  }
  const problems: BlockProblem[] = [];
  for (const children of byParent.values()) {
    for (let i = 0; i < children.length; i += 1) {
      for (let j = i + 1; j < children.length; j += 1) {
        const a = children[i]!;
        const b = children[j]!;
        const overlap = overlapOf(a, b);
        if (overlap !== null) {
          problems.push({ kind: 'overlap', message: `重なる: ${a.path} と ${b.path}（横 ${overlap.dx.toFixed(1)}px × 縦 ${overlap.dy.toFixed(1)}px）` });
          continue;
        }
        // 縦に積まれた組（横の範囲が 1px を超えて重なる）だけ、縦の間を測る
        if (Math.min(a.right, b.right) - Math.max(a.left, b.left) <= 1) continue;
        const [upper, lower] = a.top <= b.top ? [a, b] : [b, a];
        const spacing = spacingOf(upper, lower, minGap, captionGap);
        // 負の間（箱が食い込む。重なりの許容の内や、字の矩形が離れている組）も下限と比べる。重なりとして報告済みの組は上で飛ばしている
        if (spacing === null || spacing.gap >= spacing.floor - OVERLAP_TOLERANCE) continue;
        problems.push({
          kind: 'gap',
          message: `間が ${spacing.gap.toFixed(1)}px（下限 ${String(spacing.floor)}px）: ${upper.path} の下に ${lower.path}`,
        });
      }
    }
  }
  return problems;
}

/** 字の矩形どうしの食い込みのうち、字の高さ・幅のこの割合以下は、行の高さ（字の入る枠は字より広い）の余白で、字は接していない。 */
const INK_OVERLAP_RATIO = 0.25;

/** 2 つの子の重なり。重ならなければ null。字だけの 2 つは、描かれた字の矩形で、字の高さ・幅の {@link INK_OVERLAP_RATIO} を超える食い込みだけを重なりと読む。 */
function overlapOf(a: BlockNode, b: BlockNode): { dx: number; dy: number } | null {
  const textPair = a.textOnly && b.textOnly;
  const ra = textPair ? a.ink : a;
  const rb = textPair ? b.ink : b;
  const dx = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
  const dy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
  if (dx <= OVERLAP_TOLERANCE || dy <= OVERLAP_TOLERANCE) return null;
  if (textPair) {
    const w = Math.min(ra.right - ra.left, rb.right - rb.left);
    const h = Math.min(ra.bottom - ra.top, rb.bottom - rb.top);
    if (dx <= w * INK_OVERLAP_RATIO || dy <= h * INK_OVERLAP_RATIO) return null;
  }
  return { dx, dy };
}

/** 文章のブロック。字だけの組のうち、1 行でも間を測るもの（見出し・段落・一覧の項目）。 */
const PROSE_TAGS: ReadonlySet<string> = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li']);

/**
 * 縦に積まれた上下の子の、縦の間と下限。測らない組は null。
 *   - 両方が段落（`p` で 2 行以上）: 箱の間、下限 `minGap`（段落の間が行間と区別できなくなった一覧 #3 の再発を捕まえる）
 *   - 両方が文章のブロック（`p`・`h1`〜`h6`・`li`）: 1 行でも箱の間、下限 `captionGap`（見出しと 1 行の段落・短い段落どうしが間 0 で並ぶ退行を捕まえる）
 *   - 両方が字だけで、どちらかが文章のブロックでない（名前 → 意味・値 → ラベル）: 測らない
 *   - 片方が字だけ: 字の端から測った間と箱の間の大きいほう、下限 `captionGap`（ラベル・見出し・キャプションは直下の中身と詰めて置く）
 *   - 一覧の行（`li`）どうし: 箱の間、下限 `captionGap`（行を 4px で詰めて並べる作り）
 *   - 上のどれでもない 2 つの箱: 箱の間、下限 `minGap`
 * 負の間（食い込み）も返す。呼び出し側が下限と比べる。
 */
function spacingOf(upper: BlockNode, lower: BlockNode, minGap: number, captionGap: number): { gap: number; floor: number } | null {
  if (SPACING_SKIP_RULES.some((r) => r.test(upper, lower))) return null;
  const box = lower.visTop - upper.visBottom;
  if (upper.textOnly && lower.textOnly) {
    // 文章のブロック（p・h1〜h6・li）どうしだけ測る。名前 → 意味・値 → ラベル・盤の時間 → 差（span・div・dt・dd の字の組）は、行の高さの中に余白を持つ
    // 詰めた組で、一覧 #3 の型（段落の間が行間と区別できない）ではない。字そのものの食い込みは重なりの判定が見る
    if (!PROSE_TAGS.has(upper.tag) || !PROSE_TAGS.has(lower.tag)) return null;
    return { gap: box, floor: upper.tag === 'p' && lower.tag === 'p' && upper.lines >= 2 && lower.lines >= 2 ? minGap : captionGap };
  }
  if (upper.textOnly || lower.textOnly) {
    // 字の端から測った間と、箱の間の大きいほう。箱の余白（padding）が字を離す所と、行の高さより字の枠が広い所（箱の間のほうが広い）の両方を、詰まりとは読まない
    const ink = (lower.textOnly ? lower.ink.top : lower.visTop) - (upper.textOnly ? upper.ink.bottom : upper.visBottom);
    return { gap: Math.max(box, ink), floor: captionGap };
  }
  return { gap: box, floor: upper.tag === 'li' && lower.tag === 'li' ? captionGap : minGap };
}

/**
 * ページの中で、見えている要素の箱と性質を木のまま集め、字だけの印を付けて返す。判定はしない（{@link findBlockProblems} がする）。
 *
 * 見えない要素（`display: none`・`visibility: hidden`・`checkVisibility` が偽・読み上げ専用に潰した箱・`inert` の中）は集めない。
 * 親が見えない要素の子も集めない。`display: contents` の要素は、子を祖父母の子として数える。
 * 字だけの印は {@link classifyTextOnly}（許可リスト）。ページの中では「字の矩形」の計算だけをする。
 */
export async function collectBlocks(page: Page, scope: string): Promise<BlockNode[]> {
  const textBlock = [...TEXT_BLOCK_TAGS];
  const textInline = [...TEXT_INLINE_TAGS];
  const raw = await page.evaluate(({ scope, textBlock, textInline }) => {
    const out: {
      id: number; parent: number; path: string; left: number; top: number; right: number; bottom: number;
      position: string; display: string; css: { transform: string; translate: string; rotate: string; scale: string }; truncates: boolean; paints: boolean; parentWidth: number; visTop: number; visBottom: number;
      lines: number; ink: { left: number; top: number; right: number; bottom: number }; tag: string; role: string; ruledTop: boolean; ruledBottom: boolean;
    }[] = [];
    const root = document.querySelector(scope);
    if (root === null) throw new Error(`測る範囲 ${scope} が無い（判定が空振りする）`);
    const blockTags = new Set(textBlock);
    const inlineTags = new Set(textInline);
    const label = (el: Element): string => `${el.tagName.toLowerCase()}${el.classList.length > 0 ? `.${[...el.classList].slice(0, 2).join('.')}` : ''}`;
    // 名前の見本: aria-label か、最初の字から 14 字まで（子孫の字を全部つなぐと、深い木で O(n²) になる）
    const snippet = (el: Element): string => {
      const aria = el.getAttribute('aria-label');
      if (aria !== null) return aria.trim().slice(0, 14);
      let got = '';
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n !== null && got.length < 14; n = walker.nextNode()) got += (n.textContent ?? '').replace(/\s+/g, ' ');
      return got.trim().slice(0, 14);
    };
    // 自分が背景・枠・影を塗る
    const paintsBox = (cs: CSSStyleDeclaration): boolean =>
      (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent')
      || cs.backgroundImage !== 'none'
      || ['top', 'right', 'bottom', 'left'].some((side) => parseFloat(cs.getPropertyValue(`border-${side}-width`)) > 0 && cs.getPropertyValue(`border-${side}-style`) !== 'none')
      || cs.boxShadow !== 'none';
    // 字の矩形を計算する要素: 字のブロック・inline の許可リスト。`div` は子がすべて inline の字のものだけ（入れ物の div の全部の字を数えない）
    const wantsInk = (el: Element): boolean => {
      const tag = el.tagName.toLowerCase();
      if (inlineTags.has(tag)) return true;
      if (!blockTags.has(tag)) return false;
      return tag !== 'div' || Array.from(el.children).every((c) => inlineTags.has(c.tagName.toLowerCase()));
    };
    // 描かれた字の矩形の外接と行数（字が無ければ null）。行は上端の近さで束ねる（和文と欧文の数 px の差を吸う）
    const inkOf = (el: Element): { left: number; top: number; right: number; bottom: number; lines: number } | null => {
      let box: { left: number; top: number; right: number; bottom: number } | null = null;
      const tops: { top: number; half: number }[] = [];
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) {
        if ((n.textContent ?? '').trim() === '') continue;
        const lh = parseFloat(getComputedStyle(n.parentElement ?? el).lineHeight);
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const rc of Array.from(range.getClientRects())) {
          if (rc.width === 0 || rc.height === 0) continue;
          tops.push({ top: rc.top, half: (Number.isNaN(lh) ? rc.height : lh) / 2 });
          box = box === null
            ? { left: rc.left, top: rc.top, right: rc.right, bottom: rc.bottom }
            : { left: Math.min(box.left, rc.left), top: Math.min(box.top, rc.top), right: Math.max(box.right, rc.right), bottom: Math.max(box.bottom, rc.bottom) };
        }
      }
      if (box === null) return null;
      tops.sort((x, y) => x.top - y.top);
      let lines = 0;
      let lineTop = -Infinity;
      for (const t of tops) {
        if (Math.abs(t.top - lineTop) < t.half) continue;
        lines += 1;
        lineTop = t.top;
      }
      return { ...box, lines };
    };
    // 左右の枠が無く、上（下）にだけ罫線がある
    const ruled = (cs: CSSStyleDeclaration, side: 'top' | 'bottom'): boolean =>
      parseFloat(cs.getPropertyValue(`border-${side}-width`)) > 0 && cs.getPropertyValue(`border-${side}-style`) !== 'none'
      && !(parseFloat(cs.borderLeftWidth) > 0 && cs.borderLeftStyle !== 'none')
      && !(parseFloat(cs.borderRightWidth) > 0 && cs.borderRightStyle !== 'none');
    let nextId = 0;
    const walk = (el: Element, parentId: number, parentWidth: number): void => {
      for (const child of Array.from(el.children)) {
        if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'LINK', 'META', 'BR', 'WBR'].includes(child.tagName.toUpperCase())) continue;
        const cs = getComputedStyle(child);
        if (cs.display === 'contents') { walk(child, parentId, parentWidth); continue; }
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        if (!child.checkVisibility() || child.closest('[inert]') !== null) continue;
        const r = child.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        // 読み上げ専用に潰した箱（`ui-visually-hidden`・`clip-path: inset(50%)`）は見えない
        if (cs.clipPath === 'inset(50%)') continue;
        const id = nextId++;
        const truncates = cs.textOverflow === 'ellipsis' || (cs.getPropertyValue('-webkit-line-clamp') !== 'none' && cs.getPropertyValue('-webkit-line-clamp') !== '');
        const ink = wantsInk(child) ? inkOf(child) : null;
        const sn = snippet(child);
        const paints = paintsBox(cs);
        const inset = (side: 'top' | 'bottom'): number => parseFloat(cs.getPropertyValue(`padding-${side}`)) + parseFloat(cs.getPropertyValue(`border-${side}-width`));
        out.push({
          id, parent: parentId, path: `${label(child)}${sn === '' ? '' : `「${sn}」`}`,
          left: r.left, top: r.top, right: r.right, bottom: r.bottom,
          position: cs.position, display: cs.display, css: { transform: cs.transform, translate: cs.translate, rotate: cs.rotate, scale: cs.scale }, truncates, paints, parentWidth,
          visTop: paints ? r.top : r.top + inset('top'), visBottom: paints ? r.bottom : r.bottom - inset('bottom'),
          lines: ink?.lines ?? 0,
          ink: ink === null ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : { left: ink.left, top: ink.top, right: ink.right, bottom: ink.bottom },
          tag: child.tagName.toLowerCase(), role: child.getAttribute('role') ?? '',
          ruledTop: ruled(cs, 'top'), ruledBottom: ruled(cs, 'bottom'),
        });
        // 絵（svg）の中の図形は部品ではない（描かれた形どうしの重なりは絵の中身）。絵そのものを 1 つの箱として数える
        if (child.namespaceURI !== 'http://www.w3.org/2000/svg') walk(child, id, r.width);
      }
    };
    walk(root, -1, root.getBoundingClientRect().width);
    return out;
  }, { scope, textBlock, textInline });
  return classifyTextOnly(raw);
}

/** 終わりのある演出が終わるのを待つ（途中の箱は縮んでいたり動いていたりして、間と重なりを誤る）。`a11y.ts` の {@link settleFiniteAnimations} と同じもの。 */
export const settleAnimations = settleFiniteAnimations;

/**
 * 箱の位置が 2 回続けて同じになるまで集め直す（最大 20 回）。幅や字の大きさを変えた直後は、ResizeObserver や容器クエリ・書体の到着で
 * 数フレームのあいだ配置が動き、貼りつく帯などが途中の位置で測られて偽の赤になる（文字 200%・320 の roulette で 5 回に 1 回出た）。
 * 時間では待たない。
 */
async function collectStable(page: Page, scope: string): Promise<BlockNode[]> {
  const key = (nodes: readonly BlockNode[]): string => nodes.map((n) => `${n.path}|${n.left.toFixed(1)},${n.top.toFixed(1)},${n.right.toFixed(1)},${n.bottom.toFixed(1)}`).join(';');
  let nodes = await collectBlocks(page, scope);
  for (let i = 0; i < 20; i += 1) {
    await page.evaluate(() => new Promise<void>((resolve) => { requestAnimationFrame(() => { requestAnimationFrame(() => { resolve(); }); }); }));
    const next = await collectBlocks(page, scope);
    const same = key(next) === key(nodes);
    nodes = next;
    if (same) break;
  }
  return nodes;
}

export interface BlockScanOptions {
  /** 測る幅。既定は {@link BLOCK_WIDTHS} */
  readonly widths?: readonly number[];
  /** 測る範囲（開いたダイアログなど）。既定は `body` */
  readonly scope?: string;
  /** 測った要素の数の下限（空振りの防止）。既定 20 */
  readonly minNodes?: number;
  /** 2 つの箱の縦の間の下限（px）。既定 {@link MIN_BLOCK_GAP} */
  readonly minGap?: number;
  /** 片方が字のときの縦の間の下限（px）。既定 {@link MIN_CAPTION_GAP} */
  readonly captionGap?: number;
  /** 文字の大きさの倍率（%）。`200` なら `<html>` の字を 200% にして測り、測り終えたら戻す。既定は変えない */
  readonly fontScale?: number;
}

/**
 * いまの画面を指定の幅ごとに測り、隣り合うブロックが重ならず、縦の間が下限以上であることを確かめる。測り終えたら元の幅に戻す。
 * ポインタは左上の角へ退ける（ホバーの浮き上がりが札の間を詰めて見せるため）。
 */
export async function expectBlocksSeparated(page: Page, label: string, opts: BlockScanOptions = {}): Promise<void> {
  const { widths = BLOCK_WIDTHS, scope = 'body', minNodes = 20, minGap = MIN_BLOCK_GAP, captionGap = MIN_CAPTION_GAP, fontScale } = opts;
  const original = page.viewportSize();
  await page.mouse.move(0, 0);
  // 幅ごとに止めず、全部の幅の指摘を集めて 1 度に出す（どの幅で起きるかが一目で分かる）
  const all: string[] = [];
  const scaleLabel = fontScale === undefined ? label : `${label}・文字 ${String(fontScale)}%`;
  const priorFontSize = await page.evaluate(() => document.documentElement.style.fontSize);
  if (fontScale !== undefined) await page.evaluate((v) => { document.documentElement.style.fontSize = `${String(v)}%`; }, fontScale);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await settleAnimations(page);
    // 先頭へ戻す（貼りつく帯は除くが、スクロールした位置で測らない）
    await page.evaluate(() => window.scrollTo(0, 0));
    const nodes = await collectStable(page, scope);
    expect(nodes.length, `${scaleLabel}（${String(width)}）: 測った要素が少ない（描かれる前に測っていないか）`).toBeGreaterThanOrEqual(minNodes);
    for (const p of findBlockProblems(nodes, minGap, captionGap)) all.push(`${String(width)}: ${p.message}`);
  }
  if (fontScale !== undefined) await page.evaluate((v) => { document.documentElement.style.fontSize = v; }, priorFontSize);
  if (original !== null) await page.setViewportSize(original);
  expect(all, `${scaleLabel}: 隣り合うブロックの重なりか、間の不足`).toEqual([]);
}
