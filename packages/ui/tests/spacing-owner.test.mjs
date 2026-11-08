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
  const body = bodyOf(read('packages/ui/src/components/stack.css'), '.ui-stack > :where(:not(dialog))');
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

/** 本体の宣言を、注釈を外し、名前を小文字にそろえて順に返す。 */
function declarationsOf(body) {
  const src = body.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...src.matchAll(/(?:^|[;{\s])([a-zA-Z-]+)\s*:\s*([^;}]*)/g)].map((m) => ({ name: m[1].toLowerCase(), value: m[2].trim() }));
}

/**
 * 3 行の写し `.ui-reader-preview` に書いてよい宣言（名前 → 許される値）。**いま実際に書かれているものだけ**。
 * 箱を伸ばす宣言を「禁止の一覧」で拾うと、一覧に無い書き方（`border`・`aspect-ratio`・`inset-block` など）が漏れ続けるので、許可リストにする。
 * 一覧に無い名前、一覧にある名前の別の値は、どれも赤にする（足すときは、箱が伸びないことを確かめてここへ足す）。
 */
const PREVIEW_ALLOWED = {
  'box-sizing': ['border-box'],
  'margin-block': ['var(--space-4)'],
  padding: ['0 var(--space-5)'],
  'overflow-wrap': ['anywhere'],
  display: ['-webkit-box', 'none'],
  '-webkit-box-orient': ['vertical'],
  '-webkit-line-clamp': ['3'],
  overflow: ['hidden'],
};

/** 許可リストに無い宣言（名前が無い・値が違う）を `名前: 値` で返す。名前は注釈を外して小文字にそろえて比べる。 */
function disallowedDeclarations(body, allowed = PREVIEW_ALLOWED) {
  return declarationsOf(body)
    .filter(({ name, value }) => !(name in allowed) || !allowed[name].includes(value.replace(/\s+/g, ' ')))
    .map(({ name, value }) => `${name}: ${value}`);
}

test('Given 許可リストの判定 / When 宣言を渡す / Then 今の CSS は緑で、足した宣言・変えた値は赤になる', () => {
  const now = '\n  box-sizing: border-box;\n  margin-block: var(--space-4);\n  padding: 0 var(--space-5);\n  overflow-wrap: anywhere;\n  display: -webkit-box;\n  -webkit-box-orient: vertical;\n  -webkit-line-clamp: 3;\n  overflow: hidden;\n';
  assert.deepEqual(disallowedDeclarations(now), []);
  assert.deepEqual(disallowedDeclarations('display: none;'), []);
  assert.deepEqual(disallowedDeclarations(now + 'border: 2px solid;'), ['border: 2px solid']);
  assert.deepEqual(disallowedDeclarations(now + 'border-width: 2px;'), ['border-width: 2px']);
  assert.deepEqual(disallowedDeclarations(now + 'aspect-ratio: 1;'), ['aspect-ratio: 1']);
  assert.deepEqual(disallowedDeclarations(now + 'inset-block: 0;'), ['inset-block: 0']);
  assert.deepEqual(disallowedDeclarations(now + 'MIN-BLOCK-SIZE: 12rem; /* line-height: 1; */'), ['min-block-size: 12rem']);
  // 許可リストの値を変えると赤
  assert.deepEqual(disallowedDeclarations(now.replace('0 var(--space-5)', 'var(--space-3) var(--space-5)')), ['padding: var(--space-3) var(--space-5)']);
  assert.deepEqual(disallowedDeclarations(now.replace('-webkit-line-clamp: 3', '-webkit-line-clamp: 4')), ['-webkit-line-clamp: 4']);
  // @media の中の規則も、集めたすべての規則に対して判定する
  const css = '.ui-reader-preview { padding: 0 var(--space-5); }\n@media (width < 40rem) { .ui-reader-preview { padding: var(--space-3) var(--space-5); } }';
  assert.deepEqual(rulesOf(css, '.ui-reader-preview').flatMap((b) => disallowedDeclarations(b)), ['padding: var(--space-3) var(--space-5)']);
});

test('Given 3 行の写し .ui-reader-preview / When 縦の余白を読む / Then margin で取り、縦の padding を持たない（padding の帯に 4 行目の上端が覗く）', () => {
  const reader = read('packages/ui/src/components/reader.css');
  const body = bodyOf(reader, '.ui-reader-preview');
  assert.match(body, /margin-block:\s*var\(--space-4\);/);
  // 箱を縦に伸ばさない（3 行の高さに収める）。@media の中の規則も含めて、すべての規則に対して判定する
  // 許可リストに無い宣言・別の値は赤（`@media` の中の規則も含めて、集めたすべての規則に対して判定する）
  for (const b of rulesOf(reader, '.ui-reader-preview')) assert.deepEqual(disallowedDeclarations(b), [], '許可リストに無い宣言がある');
});

test('Given 部品層の読み込み順 / When components/index.css を読む / Then section-head と stack が最後（stack が最後）で、リセットがどの部品の margin にも勝つ', () => {
  // `.ui-stack > *`・`.ui-section-head > *` のリセット（0,1,0）は、同じ詳細度の部品の margin には後に読むほうが勝つ（ADR-0035 決定 1）。
  // 最後に読めば、縦の margin を持つ部品（`.ui-reader-preview`・`.ui-reader-more`・`.ui-reader-body` など）を直下に置いても gap に足されない。
  const index = read('packages/ui/src/components/index.css');
  const order = [...index.matchAll(/@import '\.\/([a-z-]+)\.css';/g)].map((m) => m[1]);
  assert.deepEqual(order.slice(-3), ['section-head', 'stack', 'visually-hidden'], `部品の最後は section-head → stack → visually-hidden（いまは ${order.slice(-4).join(' → ')}）`);
  // stack の規則は :where() で包まない（詳細度 0 にすると、要素層の h2 の margin に負けて、リセットの役目を失う）
  assert.ok(rulesOf(read('packages/ui/src/components/stack.css'), '.ui-stack > :where(:not(dialog))').length >= 1, '`.ui-stack > :where(:not(dialog))`（`.ui-stack` 自体は :where() で包まない）の規則が無い');
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
