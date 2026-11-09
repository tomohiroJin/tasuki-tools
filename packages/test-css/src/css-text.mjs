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
  if (open === -1) throw new Error('波括弧が開かない（{ が見つからない）');
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

/** 同じ頭の @media の中身を全部つないで返す（同じ頭が複数あってよい）。1 つも無ければ赤。閉じ括弧が欠けていれば throw する。 */
export function mediaBlocks(css, head) {
  const plain = stripComments(css);
  let joined = '';
  let found = 0;
  for (let at = plain.indexOf(head); at !== -1; at = plain.indexOf(head, at + 1)) {
    // 頭のすぐ後ろが空白か `{` のときだけ一致とする（`@media (width < 64rem) and (...)` のような長い条件の @media を拾わない）
    const next = plain[at + head.length];
    if (next !== undefined && next !== '{' && next !== ';' && next !== '}' && !/\s/.test(next)) continue;
    const open = plain.indexOf('{', at);
    if (open === -1) throw new Error(`${head} の後ろに { が無い（壊れた CSS）`);
    const rest = plain.slice(at + head.length, open);
    // 頭と { の間に ; や } や別の規則の始まりがあれば、規則の塊を持たない壊れた書き方なので throw する
    if (/[;}]|@/.test(rest)) throw new Error(`${head} と { の間に ; か } か別の規則がある（壊れた CSS）`);
    if (rest.trim() === '') {
      // 頭そのもの
    } else if (/^(and|or|not|only)\b|^,/.test(rest.trim())) {
      continue; // 長い条件の @media（`and (...)`・`, (...)`）は別の頭
    } else {
      throw new Error(`${head} と { の間に条件でないものがある（壊れた CSS）`);
    }
    const [start, end] = blockRange(plain, open);
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

/**
 * `head` の @media の中身を 1 つだけ返す。同じ頭が複数あれば赤にする（読み分けられない）。頭の解釈は `mediaBlocks` と同じ
 * （長い条件の `@media (width < 64rem) and (...)` を同じ頭として拾わない）。
 */
export function mediaBlock(css, head) {
  const plain = stripComments(css);
  const count = [...plain.matchAll(new RegExp(`${head.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s*\\{)`, 'g'))].length;
  assert.equal(count, 1, `${head} が ${count} 個ある（1 個だけのはず。この検査では読み分けられない）`);
  return mediaBlocks(css, head);
}
