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

/** コメントと @media の塊を除いた残り。@media の外に置いた規則を読むのに使う。 */
export function outsideMedia(css) {
  let plain = stripComments(css);
  for (let at = plain.indexOf('@media'); at !== -1; at = plain.indexOf('@media')) {
    const [, end] = blockRange(plain, plain.indexOf('{', at));
    plain = plain.slice(0, at) + plain.slice(end + 1);
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
