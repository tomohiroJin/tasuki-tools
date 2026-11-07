/**
 * CSS を字で読む小さな解析器（部品の試験が共有する・#554）。
 *
 * jsdom は @media を解かず寸法も測れないので、部品の試験は書いてある宣言そのものを読む。実際の見え方は E2E が見る。
 * 詳細度は自前で計算しない（賢くすると `:is()`・カンマ・擬似要素で穴が開く）。切り出しを誤って空を読むと恒真になるので、
 * 呼び出し側は規則がちょうど 1 つ見つかることを先に見る。
 */
import assert from 'node:assert/strict';

/** コメントを落とす。 */
export const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** 波括弧の対応で、`open` の `{` から始まるブロックの中身の範囲 [start, end) を返す。 */
function blockRange(plain, open) {
  let depth = 0;
  for (let i = open; i < plain.length; i += 1) {
    if (plain[i] === '{') depth += 1;
    if (plain[i] === '}') {
      depth -= 1;
      if (depth === 0) return [open + 1, i];
    }
  }
  throw new Error('波括弧が閉じていない');
}

/** `head` で始まる @media の中身。同じ頭が 2 つあれば読み分けられないので赤にする。 */
export function mediaBlock(css, head) {
  const plain = stripComments(css);
  const at = plain.indexOf(head);
  assert.notEqual(at, -1, `${head} が無い`);
  assert.equal(plain.indexOf(head, at + 1), -1, `${head} が 2 つ以上ある。この検査では読み分けられない`);
  const [start, end] = blockRange(plain, plain.indexOf('{', at));
  return plain.slice(start, end);
}

/** 同じ頭の @media の中身を全部つないで返す（同じ頭が複数あってよい）。1 つも無ければ赤。閉じ括弧が欠けていれば throw する。 */
export function mediaBlocks(css, head) {
  const plain = stripComments(css);
  let joined = '';
  let found = 0;
  for (let at = plain.indexOf(head); at !== -1; at = plain.indexOf(head, at + 1)) {
    const [start, end] = blockRange(plain, plain.indexOf('{', at));
    joined += `${plain.slice(start, end)}\n`;
    found += 1;
  }
  assert.notEqual(found, 0, `${head} が無い`);
  return joined;
}

/** 条件つきの at 規則（@media・@container・@supports・@starting-style）。この中の規則は「条件によらない」とは言えない。 */
const CONDITIONAL_AT_RULE = /@(media|container|supports|starting-style)\b/;

/** `@layer` の塊（または `@layer a, b;`）。層は条件ではない（中の規則は条件によらず効く）。 */
const LAYER_AT_RULE = /@layer\b/;

/**
 * コメントと、条件つきの at 規則の塊（@media・@container・@supports・@starting-style）を除いた残り。条件によらず効く規則を読むのに使う。
 * `@layer` は条件ではないので、塊は外さず中身を外側として数える（`@layer a, b;` の宣言だけの文は落とす）。
 */
export function outsideMedia(css) {
  let plain = stripComments(css);
  for (let m = CONDITIONAL_AT_RULE.exec(plain); m !== null; m = CONDITIONAL_AT_RULE.exec(plain)) {
    const [, end] = blockRange(plain, plain.indexOf('{', m.index));
    plain = plain.slice(0, m.index) + plain.slice(end + 1);
  }
  for (let m = LAYER_AT_RULE.exec(plain); m !== null; m = LAYER_AT_RULE.exec(plain)) {
    const open = plain.indexOf('{', m.index);
    const semi = plain.indexOf(';', m.index);
    if (semi !== -1 && (open === -1 || semi < open)) {
      plain = plain.slice(0, m.index) + plain.slice(semi + 1);
      continue;
    }
    const [start, end] = blockRange(plain, open);
    plain = plain.slice(0, m.index) + plain.slice(start, end) + plain.slice(end + 1);
  }
  return plain;
}

/** 選択子の空白（改行・字下げ・連続した空白・カンマの前後）を 1 つに正規化する。字の並べ方（整形）が変わっても比べられるように。 */
export const normalizeSelector = (selector) => selector.trim().replace(/\s*,\s*/g, ', ').replace(/\s+/g, ' ');

/** コメントを落とした CSS から、`selector { body }` の組を拾う（入れ子の無いブロックの中身に使う）。選択子は空白を正規化して返す。 */
export function rules(css) {
  return [...stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: normalizeSelector(m[1]), body: m[2] }));
}

/** 選択子が `selector` の規則がちょうど 1 つあることを確かめて、その本体を返す。 */
export function only(list, selector) {
  const want = normalizeSelector(selector);
  const found = list.filter((r) => r.selector === want);
  assert.equal(found.length, 1, `\`${want}\` の規則がちょうど 1 つではない（${found.length} 件）`);
  return found[0].body;
}
