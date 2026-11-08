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

/** `selector { … }` の本体（宣言の文字列）。セレクタは行頭から `{` までの完全一致。無ければ null。 */
function ruleBody(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\>]/g, '\\$&');
  const m = new RegExp(`^${escaped} \\{([^}]*)\\}`, 'm').exec(css);
  return m === null ? null : m[1];
}

test('Given .ui-stack / When 規則を読む / Then 縦の flex で、間は --space-3 の gap', () => {
  const body = ruleBody(read('packages/ui/src/components/stack.css'), '.ui-stack');
  assert.notEqual(body, null);
  assert.match(body, /display:\s*flex;/);
  assert.match(body, /flex-direction:\s*column;/);
  assert.match(body, /gap:\s*var\(--space-3\);/);
});

test('Given .ui-stack / When 直下の子の規則を読む / Then 縦の外側の余白を 0 にする（要素層の h2 の margin が gap に足されない）', () => {
  const body = ruleBody(read('packages/ui/src/components/stack.css'), '.ui-stack > *');
  assert.notEqual(body, null);
  assert.match(body, /margin-block:\s*0;/);
});

test('Given .ui-section-head / When 規則を読む / Then 折り返し可・縦は中央・両端寄せ・間は --space-3', () => {
  const body = ruleBody(read('packages/ui/src/components/section-head.css'), '.ui-section-head');
  assert.notEqual(body, null);
  assert.match(body, /display:\s*flex;/);
  assert.match(body, /flex-wrap:\s*wrap;/);
  assert.match(body, /align-items:\s*center;/);
  assert.match(body, /justify-content:\s*space-between;/);
  assert.match(body, /gap:\s*var\(--space-2\) var\(--space-3\);/);
});

test('Given .ui-section-head / When 直下の子の規則を読む / Then 縦の外側の余白を 0 にする', () => {
  const body = ruleBody(read('packages/ui/src/components/section-head.css'), '.ui-section-head > *');
  assert.notEqual(body, null);
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
  assert.match(ruleBody(css, '.ui-md > * + *') ?? '', /margin-top:\s*var\(--space-2\);/);
  // 同じ詳細度の子のリセットより後ろ（後勝ち）。クラスを重ねて詳細度を上げる書き方はしない
  for (const sel of ['.ui-md-p', '.ui-md-ul,\n.ui-md-ol', '.ui-md-quote', '.ui-md-pre', '.ui-md-h']) {
    const i = css.indexOf(sel + ' {');
    assert.ok(i >= 0 && i < at, `${sel} のリセットより後ろに置く`);
  }
  assert.doesNotMatch(css, /\.ui-md\.ui-md/);
});
test('Given Markdown の入れ子のブロック / When 間の規則を読む / Then 引用とリストの項目の中も --space-2 で、子のリセットより後ろに置かれる（根と同じ後勝ち・詳細度は上げない）', () => {
  const css = read('packages/ui/src/components/markdown.css');
  const sel = '.ui-md-quote > * + *,\n.ui-md-ul > * > * + *,\n.ui-md-ol > * > * + *';
  assert.match(ruleBody(css, sel) ?? '', /margin-top:\s*var\(--space-2\);/, '入れ子のブロックの間の規則が無い');
  const at = css.indexOf(sel + ' {');
  for (const reset of ['.ui-md-p', '.ui-md-ul,\n.ui-md-ol', '.ui-md-quote']) {
    const i = css.indexOf(reset + ' {');
    assert.ok(i >= 0 && i < at, `${reset} のリセットより後ろに置く`);
  }
});

test('Given 部品 .ui-section-head--beside と .ui-stack--tight / When 規則を読む / Then 寄せと間の値を持つ', () => {
  assert.match(ruleBody(read('packages/ui/src/components/section-head.css'), '.ui-section-head--beside') ?? '', /justify-content:\s*flex-start;/);
  assert.match(ruleBody(read('packages/ui/src/components/stack.css'), '.ui-stack--tight') ?? '', /gap:\s*var\(--space-2\);/);
});

test('Given 3 行の写し .ui-reader-preview / When 縦の余白を読む / Then margin で取り、縦の padding を持たない（padding の帯に 4 行目の上端が覗く）', () => {
  const body = ruleBody(read('packages/ui/src/components/reader.css'), '.ui-reader-preview') ?? '';
  assert.match(body, /margin-block:\s*var\(--space-4\);/);
  assert.match(body, /padding:\s*0 var\(--space-5\);/);
  // 箱を縦に伸ばさない（3 行の高さに収める）
  assert.doesNotMatch(body, /min-height|height:|padding-(block|bottom)/);
});

test('Given 部品層の読み込み順 / When components/index.css を読む / Then section-head と stack が最後（stack が最後）で、リセットがどの部品の margin にも勝つ', () => {
  // `.ui-stack > *`・`.ui-section-head > *` のリセット（0,1,0）は、同じ詳細度の部品の margin には後に読むほうが勝つ（ADR-0035 決定 1）。
  // 最後に読めば、縦の margin を持つ部品（`.ui-reader-preview`・`.ui-reader-more`・`.ui-reader-body` など）を直下に置いても gap に足されない。
  const index = read('packages/ui/src/components/index.css');
  const order = [...index.matchAll(/@import '\.\/([a-z-]+)\.css';/g)].map((m) => m[1]);
  assert.deepEqual(order.slice(-2), ['section-head', 'stack'], `部品の最後は section-head → stack（いまは ${order.slice(-3).join(' → ')}）`);
  // stack の規則は :where() で包まない（詳細度 0 にすると、要素層の h2 の margin に負けて、リセットの役目を失う）
  assert.match(read('packages/ui/src/components/stack.css'), /\n\.ui-stack > \* \{/);
});
