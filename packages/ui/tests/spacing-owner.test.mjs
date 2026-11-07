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

/** セレクタ中の `.クラス` の数（詳細度の (0,n,0) の n。要素・擬似要素は数えない粗い物差し）。 */
function classCount(selector) {
  return (selector.match(/\.[a-z]/g) ?? []).length;
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

test('Given poker の束の見出しの行 / When 規則を読む / Then 名前の列は flex: 1 1 auto・min-width: 0（基準幅を持たず、収まる名前は同じ行）で、折り返しは部品に任せる', () => {
  const css = read('apps/poker-web/src/index.css');
  assert.match(css, /\.estimate-group-head > \.estimate-group-item \{[^}]*flex:\s*1 1 auto;[^}]*min-width:\s*0;/);
  assert.doesNotMatch(css, /estimate-group-head > \.estimate-group-item \{[^}]*flex:\s*1 1 [0-9]/);
  // 折り返し（部品の宣言の写し）と、どこにも当たらない子の規則は画面に持たない
  assert.equal(ruleBody(css, '.estimate-group-head'), null);
  assert.doesNotMatch(css, /\.estimate-group-head > \.estimate-item--inline/);
});

test('Given 部品 .ui-section-head--beside と .ui-stack--tight / When 規則を読む / Then 寄せと間の値を持つ', () => {
  assert.match(ruleBody(read('packages/ui/src/components/section-head.css'), '.ui-section-head--beside') ?? '', /justify-content:\s*flex-start;/);
  assert.match(ruleBody(read('packages/ui/src/components/stack.css'), '.ui-stack--tight') ?? '', /gap:\s*var\(--space-2\);/);
});

test('Given roulette の見出しの行 / When 規則を読む / Then 見出しと小さな字を基準線で揃える', () => {
  assert.match(ruleBody(read('apps/roulette-web/src/index.css'), '.roulette-regulars-head') ?? '', /align-items:\s*baseline;/);
});

test('Given timer の見出しの行の操作の塊 / When 規則を読む / Then 右へ寄せない（折り返したとき見出しの下に左端そろいで置く）', () => {
  const body = ruleBody(read('apps/timer-web/src/styles/roster-panel.css'), '.roster-panel-head-actions');
  assert.notEqual(body, null);
  assert.doesNotMatch(body, /justify-content:\s*(flex-end|end|right)/);
  assert.doesNotMatch(body, /flex:\s*1/);
});

test('Given .ui-section-head / When 間を読む / Then 折り返した行の間は --space-2・横の間は --space-3（ADR-0035 と README の値）', () => {
  const body = ruleBody(read('packages/ui/src/components/section-head.css'), '.ui-section-head');
  assert.match(body, /gap:\s*var\(--space-2\) var\(--space-3\);/);
});

test('Given poker の束のポイントの選択 / When 規則を読む / Then 字を切らず・縮めず右端へ寄せ、行は折り返してよく、名前の列が主', () => {
  const css = read('apps/poker-web/src/index.css');
  const points = ruleBody(css, '.estimate-log .estimate-group-points') ?? '';
  assert.match(points, /flex:\s*0 0 auto;/);
  assert.match(points, /margin-inline-start:\s*auto;/);
  assert.doesNotMatch(points, /overflow:\s*hidden|text-overflow|max-inline-size/);
  assert.doesNotMatch(points, /font-size:\s*[0-9.]+(px|rem)/);
});

test('Given 3 行の写し .ui-reader-preview / When 縦の余白を読む / Then margin で取り、縦の padding を持たない（padding の帯に 4 行目の上端が覗く）', () => {
  const body = ruleBody(read('packages/ui/src/components/reader.css'), '.ui-reader-preview') ?? '';
  assert.match(body, /margin-block:\s*var\(--space-4\);/);
  assert.match(body, /padding:\s*0 var\(--space-5\);/);
  // 箱を縦に伸ばさない（3 行の高さに収める）
  assert.doesNotMatch(body, /min-height|height:|padding-(block|bottom)/);
});

// アプリのソースの文字列（className の式・JSX の書き方）はここでは固定しない。画面が部品を当てていること・条件の振る舞いは、
// 各アプリの vitest（描いた結果）と E2E（`e2e/specs/spacing.spec.ts`）が確かめる。ここに残すのは CSS の契約だけ。

test('Given 画面の CSS / When 並びの写しを探す / Then 部品に寄せたクラスの規則を画面が持たない（poker・timer・agenda）', () => {
  assert.doesNotMatch(read('apps/poker-web/src/index.css'), /room-participants-head/);
  assert.doesNotMatch(read('apps/timer-web/src/styles/primitives.css'), /section-header--beside/);
  assert.equal(ruleBody(read('apps/agenda-web/src/builder.css'), '.builder-saved'), null);
  assert.doesNotMatch(ruleBody(read('apps/agenda-web/src/builder.css'), '.builder-saved-list') ?? '', /display:|gap:/);
});

test('Given roulette の空の知らせの CSS / When 規則を読む / Then 負の余白・読み上げの木から外す書き方が無く、:empty の写しも持たない（部品 ui-visually-hidden を JSX が足す）', () => {
  const css = read('apps/roulette-web/src/index.css');
  assert.doesNotMatch(css, /roulette-regulars-notice:empty/);
  const body = ruleBody(css, '.roulette-regulars-notice') ?? '';
  assert.doesNotMatch(body, /display:\s*none|visibility:\s*hidden|margin[^:]*:\s*calc\(\s*-/);
});

test('Given timer の「ランダム」のスタイル / When 読み込みを読む / Then shuffle-button.css が持ち、index.css が読む（名簿の CSS には置かない）', () => {
  assert.match(read('apps/timer-web/src/styles/shuffle-button.css'), /\.shuffle-button-label[\s\S]*\.shuffle-button-icon/);
  assert.match(read('apps/timer-web/src/index.css'), /@import '\.\/styles\/shuffle-button\.css';/);
  assert.doesNotMatch(read('apps/timer-web/src/styles/roster-panel.css'), /shuffle-button/);
});

test('Given 共有メモの見出しの行 / When .shared-memo-lead を読む / Then 縮められ（flex: 1 1 8rem・折り返し可）、「編集」が見出しの行の右に残る（一覧 #18）', () => {
  const body = ruleBody(read('apps/timer-web/src/styles/shared-memo.css'), '.shared-memo-lead') ?? '';
  assert.match(body, /flex:\s*1 1 8rem;/);
  assert.match(body, /flex-wrap:\s*wrap;/);
  assert.match(body, /min-width:\s*0;/);
});

test('Given poker の閉じた束の名前の入力 / When 規則を読む / Then 固有の幅（size=20・約 180px）を持ち込まない（基準幅 0）ので、変更を始めても選択欄が次の行へ落ちない', () => {
  const rules = read('apps/poker-web/src/index.css').match(/(?:^|\n)\.estimate-item--inline \.estimate-item-input \{[^}]*\}/g) ?? [];
  assert.ok(rules.some((r) => /inline-size:\s*0;/.test(r) && /min-inline-size:\s*0;/.test(r)), '基準幅 0 の規則が無い');
});
