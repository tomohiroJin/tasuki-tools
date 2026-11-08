/**
 * 余白の持ち主の約束（#553・ADR 0035）の契約。
 *
 * 見た目の合否は E2E（`e2e/specs/spacing.spec.ts`）が矩形で測る。ここは、その前提になる**部品の CSS と、
 * 画面が部品を当てていること**を字面で固定する（変異検査が走らせられるのは node:test と vitest だけなので、
 * CSS の契約と配線を、ここで壊して確かめる）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const read = (p) => readFileSync(root + p, 'utf8');

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
  return out.map((x) => x.replace(/\s+/g, ' ').trim());
}

/** 規則（宣言ブロックを持つもの）を、`@media` などの入れ子の中・字下げした規則・`,` でつないだセレクタも含めてすべて集める。 */
function collectRules(css) {
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
function rulesOf(css, selector) {
  const want = selector.replace(/\s+/g, ' ').trim();
  return collectRules(css).filter((r) => r.selectors.includes(want)).map((r) => r.body);
}

/** 肯定の検査用: 規則が 1 つ以上見つかることを確かめてから、本体をつないで返す（見つからないまま緑にならない）。 */
function bodyOf(css, selector) {
  const bodies = rulesOf(css, selector);
  assert.ok(bodies.length >= 1, `${selector} の規則が見つからない（判定が空振りする）`);
  return bodies.join('\n');
}

test('Given .ui-stack / When 規則を読む / Then 縦の flex で、間は --space-3 の gap', () => {
  const body = bodyOf(read('packages/ui/src/components/stack.css'), '.ui-stack');
  assert.match(body, /display:\s*flex;/);
  assert.match(body, /flex-direction:\s*column;/);
  assert.match(body, /gap:\s*var\(--space-3\);/);
});

test('Given .ui-stack / When 直下の子の規則を読む / Then 縦の外側の余白を 0 にする（要素層の h2 の margin が gap に足されない）', () => {
  const body = bodyOf(read('packages/ui/src/components/stack.css'), '.ui-stack > *');
  assert.match(body, /margin-block:\s*0;/);
});

test('Given .ui-section-head / When 規則を読む / Then 折り返し可・縦は中央・両端寄せ・間は --space-3', () => {
  const body = bodyOf(read('packages/ui/src/components/section-head.css'), '.ui-section-head');
  assert.match(body, /display:\s*flex;/);
  assert.match(body, /flex-wrap:\s*wrap;/);
  assert.match(body, /align-items:\s*center;/);
  assert.match(body, /justify-content:\s*space-between;/);
  assert.match(body, /gap:\s*var\(--space-2\) var\(--space-3\);/);
});

test('Given .ui-section-head / When 直下の子の規則を読む / Then 縦の外側の余白を 0 にする', () => {
  const body = bodyOf(read('packages/ui/src/components/section-head.css'), '.ui-section-head > *');
  assert.match(body, /margin-block:\s*0;/);
});

test('Given 2 つの部品 / When components/index.css を読む / Then どちらも部品層から読まれる', () => {
  const index = read('packages/ui/src/components/index.css');
  assert.match(index, /@import '\.\/stack\.css';/);
  assert.match(index, /@import '\.\/section-head\.css';/);
});

test('Given Markdown の根 / When ブロックの間の規則を読む / Then 子のリセット（.ui-md-p の margin: 0 など）より後ろに置かれ、--space-2 を持つ（一覧 #3）', () => {
  const css = read('packages/ui/src/components/markdown.css');
  const at = css.indexOf('.ui-md > * + * {');
  assert.ok(at > 0, 'ブロックの間の規則が無い');
  assert.match(bodyOf(css, '.ui-md > * + *'), /margin-top:\s*var\(--space-2\);/);
  // 同じ詳細度の子のリセットより後ろ（後勝ち）。クラスを重ねて詳細度を上げる書き方はしない
  for (const sel of ['.ui-md-p', '.ui-md-ul,\n.ui-md-ol', '.ui-md-quote', '.ui-md-pre', '.ui-md-h']) {
    const i = css.indexOf(sel + ' {');
    assert.ok(i >= 0 && i < at, `${sel} のリセットより後ろに置く`);
  }
  assert.doesNotMatch(css, /\.ui-md\.ui-md/);
});
test('Given 部品 .ui-section-head--beside と .ui-stack--tight / When 規則を読む / Then 寄せと間の値を持つ', () => {
  assert.match(bodyOf(read('packages/ui/src/components/section-head.css'), '.ui-section-head--beside'), /justify-content:\s*flex-start;/);
  assert.match(bodyOf(read('packages/ui/src/components/stack.css'), '.ui-stack--tight'), /gap:\s*var\(--space-2\);/);
});

test('Given 3 行の写し .ui-reader-preview / When 縦の余白を読む / Then margin で取り、縦の padding を持たない（padding の帯に 4 行目の上端が覗く）', () => {
  const reader = read('packages/ui/src/components/reader.css');
  const body = bodyOf(reader, '.ui-reader-preview');
  assert.match(body, /margin-block:\s*var\(--space-4\);/);
  assert.match(body, /padding:\s*0 var\(--space-5\);/);
  // 箱を縦に伸ばさない（3 行の高さに収める）。@media の中の規則も含めて、すべての規則に対して判定する
  for (const b of rulesOf(reader, '.ui-reader-preview')) assert.doesNotMatch(b, /min-height|height:|padding-(block|bottom)/);
});

test('Given 部品層の読み込み順 / When components/index.css を読む / Then section-head と stack が最後（stack が最後）で、リセットがどの部品の margin にも勝つ', () => {
  // `.ui-stack > *`・`.ui-section-head > *` のリセット（0,1,0）は、同じ詳細度の部品の margin には後に読むほうが勝つ（ADR-0035 決定 1）。
  // 最後に読めば、縦の margin を持つ部品（`.ui-reader-preview`・`.ui-reader-more`・`.ui-reader-body` など）を直下に置いても gap に足されない。
  const index = read('packages/ui/src/components/index.css');
  const order = [...index.matchAll(/@import '\.\/([a-z-]+)\.css';/g)].map((m) => m[1]);
  assert.deepEqual(order.slice(-3), ['section-head', 'stack', 'visually-hidden'], `部品の最後は section-head → stack → visually-hidden（いまは ${order.slice(-4).join(' → ')}）`);
  // stack の規則は :where() で包まない（詳細度 0 にすると、要素層の h2 の margin に負けて、リセットの役目を失う）
  assert.ok(rulesOf(read('packages/ui/src/components/stack.css'), '.ui-stack > *').length >= 1, '`.ui-stack > *`（:where() で包まない）の規則が無い');
});

test('Given .ui-stack の直下の読み上げ専用の要素 / When 読み込み順とリセットを読む / Then .ui-visually-hidden はリセットと同じ詳細度で後に読まれ、margin: -1px が勝つ', () => {
  const hidden = bodyOf(read('packages/ui/src/components/visually-hidden.css'), '.ui-visually-hidden');
  assert.match(hidden, /margin:\s*-1px;/);
  const index = read('packages/ui/src/components/index.css');
  const order = [...index.matchAll(/@import '\.\/([a-z-]+)\.css';/g)].map((m) => m[1]);
  const at = (name) => order.indexOf(name);
  assert.ok(at('visually-hidden') > at('stack') && at('visually-hidden') > at('section-head'), 'visually-hidden を stack と section-head より後に読む');
  // 詳細度を上げる回避はしない（同じ (0,1,0) の後勝ち）
  assert.equal(rulesOf(read('packages/ui/src/components/stack.css'), '.ui-stack > :not(.ui-visually-hidden)').length, 0);
});
