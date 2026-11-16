/**
 * 画面の CSS の契約の試験（`spacing-css.test.ts`）が共有する補助（#594）。
 *
 * 4 か所（agenda-web・poker-web・roulette-web・timer-web）にあった写し（`read`・`collectRules`・`rulesOf`・`rulesMatching`・`foundBody`）を
 * 1 つにした。検査の本体（どの規則に何を要求するか）はアプリごとに違うので、各アプリの試験に残る。
 * `css-text.mjs`（入れ子の無いブロックを読む解析器）とは別物: こちらは `@media` の入れ子の中の規則も、`,` でつないだ選択子も集める。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** アプリ自身のファイルを、実行中のディレクトリ（vitest はパッケージの直下で動く）からの相対で読む。 */
export const readFromCwd = (p) => readFileSync(`${process.cwd()}/${p}`, 'utf8');

/** `,` で区切る（`:is(a, b)` の括弧の中の `,` では区切らない）。 */
function splitSelectors(prelude) {
  const out = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < prelude.length; i++) {
    const c = prelude[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) {
      out.push(prelude.slice(from, i));
      from = i + 1;
    }
  }
  out.push(prelude.slice(from));
  return out.map((s) => s.replace(/\s+/g, ' ').trim());
}

/** 規則（宣言ブロックを持つもの）を、`@media` などの入れ子の中・字下げした規則・`,` でつないだセレクタも含めてすべて集める。 */
export function collectRules(css) {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  const stack = [];
  let last = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '{') {
      stack.push({ prelude: src.slice(last, i).trim(), start: i + 1 });
      last = i + 1;
    } else if (c === '}') {
      const top = stack.pop();
      if (top !== undefined && !top.prelude.startsWith('@')) rules.push({ selectors: splitSelectors(top.prelude), body: src.slice(top.start, i) });
      last = i + 1;
    } else if (c === ';') {
      last = i + 1;
    }
  }
  return rules;
}

/** セレクタの並びに `selector` を（完全一致で）含む規則の本体を、すべて返す。無ければ空。 */
export function rulesOf(css, selector) {
  const want = selector.replace(/\s+/g, ' ').trim();
  return collectRules(css).filter((r) => r.selectors.includes(want)).map((r) => r.body);
}

/** セレクタのどれかが `pattern` に当たる規則の本体を、すべて返す。 */
export function rulesMatching(css, pattern) {
  return collectRules(css).filter((r) => r.selectors.some((s) => pattern.test(s))).map((r) => r.body);
}

/** 肯定の検査用: 規則が 1 つ以上見つかることを確かめてから、本体をつないで返す（見つからないまま緑にならない）。 */
export function foundBody(bodies, what) {
  assert.ok(bodies.length >= 1, `${what} の規則が見つからない（判定が空振りする）`);
  return bodies.join('\n');
}
