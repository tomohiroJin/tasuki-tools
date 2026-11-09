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
  /** 変形（`transform`・`translate`・`rotate`・`scale`）のどれかがある */
  readonly transformed: boolean;
  /** 字を切る面（`text-overflow: ellipsis` か `-webkit-line-clamp`）。字の矩形が見えている範囲より広い */
  readonly truncates: boolean;
  /** 中が字だけ（子孫に、自分の箱を持つ要素・操作・画像が無い）。見出し・ラベル・キャプション・値・段落 */
  readonly textOnly: boolean;
  /** 描かれた字の行数（字だけの要素。字が無ければ 0）。1 行なら「字の行」、2 行以上は段落 */
  readonly lines: number;
  /** 字だけの要素の、描かれた字の矩形（Range の矩形の外接）。字が無ければ箱と同じ。行の高さの余白でなく字そのものの重なりを見る */
  readonly ink: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number };
  /** 要素の種類（`label`・`li` など。小文字） */
  readonly tag: string;
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
    reason: '`position: fixed / sticky` の帯（下端の操作の帯・上の見出しの帯）は、スクロールの位置で他の中身の上に乗るのが仕様。帯が中身を隠さないことは `header-and-dock.spec.ts` が最下部で測る（ADR 0036）',
    test: (n) => n.position === 'fixed' || n.position === 'sticky',
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
    reason: '傾けた札の扇・手札の浮き上がり・盤の針は、`transform` で意図して重ねる。箱は変形の前の位置で返るので、重なりも間も意味を持たない',
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
  const byParent = new Map<number, BlockNode[]>();
  for (const n of nodes) {
    if (SKIP_RULES.some((r) => r.test(n))) continue;
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
        if (spacing === null || spacing.gap < 0 || spacing.gap >= spacing.floor - OVERLAP_TOLERANCE) continue;
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

/**
 * 縦に積まれた上下の子の、縦の間と下限。測らない組は null。
 *   - 両方が段落（`p` で 2 行以上）: 箱の間、下限 `minGap`（段落の間が行間と区別できなくなった一覧 #3 の再発を捕まえる）
 *   - 両方が字だけで、上の段落の組でない: 測らない（「字の行どうし」。名前 → 意味・見出し → 説明は行の高さの中に余白がある）
 *   - 片方が字だけ: 字の端から測った間と箱の間の大きいほう、下限 `captionGap`（ラベル・見出し・キャプションは直下の中身と詰めて置く）
 *   - 一覧の行（`li`）どうし: 箱の間、下限 `captionGap`（行を 4px で詰めて並べる作り）
 *   - 上のどれでもない 2 つの箱: 箱の間、下限 `minGap`
 */
function spacingOf(upper: BlockNode, lower: BlockNode, minGap: number, captionGap: number): { gap: number; floor: number } | null {
  if (SPACING_SKIP_RULES.some((r) => r.test(upper, lower))) return null;
  const box = lower.top - upper.bottom;
  if (upper.textOnly && lower.textOnly) {
    return upper.tag === 'p' && lower.tag === 'p' && upper.lines >= 2 && lower.lines >= 2 ? { gap: box, floor: minGap } : null;
  }
  if (upper.textOnly || lower.textOnly) {
    // 字の端から測った間と、箱の間の大きいほう。箱の余白（padding）が字を離す所と、行の高さより字の枠が広い所（箱の間のほうが広い）の両方を、詰まりとは読まない
    const ink = (lower.textOnly ? lower.ink.top : lower.top) - (upper.textOnly ? upper.ink.bottom : upper.bottom);
    return { gap: Math.max(box, ink), floor: captionGap };
  }
  return { gap: box, floor: upper.tag === 'li' && lower.tag === 'li' ? captionGap : minGap };
}

/**
 * ページの中で、見えている要素の箱と性質を木のまま集める。判定はしない（{@link findBlockProblems} がする）。
 *
 * 子を持たない要素・見えない要素（`checkVisibility` が偽・読み上げ専用に潰した箱・`inert` の中）は集めない。
 * 親が見えない要素の子も集めない（`display: none` の中）。
 */
export async function collectBlocks(page: Page, scope: string): Promise<BlockNode[]> {
  return page.evaluate((scope) => {
    const out: {
      id: number; parent: number; path: string; left: number; top: number; right: number; bottom: number;
      position: string; display: string; transformed: boolean; truncates: boolean; textOnly: boolean;
      lines: number; ink: { left: number; top: number; right: number; bottom: number }; tag: string; role: string; ruledTop: boolean; ruledBottom: boolean;
    }[] = [];
    const root = document.querySelector(scope);
    if (root === null) throw new Error(`測る範囲 ${scope} が無い（判定が空振りする）`);
    const label = (el: Element): string => `${el.tagName.toLowerCase()}${el.classList.length > 0 ? `.${[...el.classList].slice(0, 2).join('.')}` : ''}`;
    const text = (el: Element): string => (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 14);
    // 自分の箱を持つ要素: 操作・入力・画像・描画面、または背景・枠・影がある
    const BOXED_TAGS = new Set(['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'IMG', 'SVG', 'CANVAS', 'VIDEO', 'A', 'SUMMARY', 'DIALOG']);
    const paintsBox = (cs: CSSStyleDeclaration): boolean =>
      (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent')
      || cs.backgroundImage !== 'none'
      || ['Top', 'Right', 'Bottom', 'Left'].some((side) => parseFloat(cs.getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0 && cs.getPropertyValue(`border-${side.toLowerCase()}-style`) !== 'none')
      || cs.boxShadow !== 'none';
    const isTextOnly = (el: Element): boolean => {
      for (const child of Array.from(el.children)) {
        const cs = getComputedStyle(child);
        if (cs.display === 'none') continue;
        if (BOXED_TAGS.has(child.tagName.toUpperCase()) || paintsBox(cs)) return false;
        if (!isTextOnly(child)) return false;
      }
      return true;
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
    const walk = (el: Element, parentId: number): void => {
      for (const child of Array.from(el.children)) {
        if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'LINK', 'META', 'BR', 'WBR'].includes(child.tagName.toUpperCase())) continue;
        const cs = getComputedStyle(child);
        if (cs.display === 'contents') { walk(child, parentId); continue; }
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        if (!child.checkVisibility() || child.closest('[inert]') !== null) continue;
        const r = child.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        // 読み上げ専用に潰した箱（`ui-visually-hidden`・`clip-path: inset(50%)`）は見えない
        if (cs.clipPath === 'inset(50%)') continue;
        const id = nextId++;
        const transformed = cs.transform !== 'none' || cs.translate !== 'none' || !['none', '0deg'].includes(cs.rotate) || !['none', '1'].includes(cs.scale);
        const truncates = cs.textOverflow === 'ellipsis' || (cs.getPropertyValue('-webkit-line-clamp') !== 'none' && cs.getPropertyValue('-webkit-line-clamp') !== '');
        const textOnly = isTextOnly(child);
        const ink = textOnly ? inkOf(child) : null;
        out.push({
          id, parent: parentId, path: `${label(child)}${text(child) === '' ? '' : `「${text(child)}」`}`,
          left: r.left, top: r.top, right: r.right, bottom: r.bottom,
          position: cs.position, display: cs.display, transformed, truncates, textOnly,
          lines: ink?.lines ?? 0,
          ink: ink === null ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : { left: ink.left, top: ink.top, right: ink.right, bottom: ink.bottom },
          tag: child.tagName.toLowerCase(), role: child.getAttribute('role') ?? '',
          ruledTop: ruled(cs, 'top'), ruledBottom: ruled(cs, 'bottom'),
        });
        // 絵（svg）の中の図形は部品ではない（描かれた形どうしの重なりは絵の中身）。絵そのものを 1 つの箱として数える
        if (child.namespaceURI !== 'http://www.w3.org/2000/svg') walk(child, id);
      }
    };
    walk(root, -1);
    return out;
  }, scope);
}

/** 終わりのある演出が終わるのを待つ（途中の箱は縮んでいたり動いていたりして、間と重なりを誤る）。描かれていない部分木の演出は待たない。 */
export async function settleAnimations(page: Page): Promise<void> {
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter((a) => a.playState === 'running' && a.effect?.getComputedTiming().endTime !== Infinity)
    .filter((a) => {
      const target = a.effect instanceof KeyframeEffect ? a.effect.target : null;
      return target === null || target.checkVisibility();
    })
    .map((a) => a.finished.catch(() => undefined))));
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
    const nodes = await collectBlocks(page, scope);
    expect(nodes.length, `${scaleLabel}（${String(width)}）: 測った要素が少ない（描かれる前に測っていないか）`).toBeGreaterThanOrEqual(minNodes);
    for (const p of findBlockProblems(nodes, minGap, captionGap)) all.push(`${String(width)}: ${p.message}`);
  }
  if (fontScale !== undefined) await page.evaluate((v) => { document.documentElement.style.fontSize = v; }, priorFontSize);
  if (original !== null) await page.setViewportSize(original);
  expect(all, `${scaleLabel}: 隣り合うブロックの重なりか、間の不足`).toEqual([]);
}
