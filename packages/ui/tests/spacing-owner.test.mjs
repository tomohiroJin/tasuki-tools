/**
 * 余白の持ち主の約束（#553・ADR 0034）の契約。
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

test('Given Markdown の根 / When ブロックの間の規則を読む / Then 子の margin: 0（.ui-md-p など）に勝つ詳細度で --space-2 を持つ（一覧 #3）', () => {
  const css = read('packages/ui/src/components/markdown.css');
  const m = /^(\.ui-md[^{]*>\s*\*\s*\+\s*\*)\s*\{([^}]*)\}/m.exec(css);
  assert.notEqual(m, null, 'ブロックの間の規則が無い');
  assert.match(m[2], /margin-top:\s*var\(--space-2\);/);
  // 子の `margin: 0` は 1 クラス（0,1,0）。兄弟セレクタは、それより多いクラスを持たなければ後勝ちで負ける
  const childMargin = ruleBody(css, '.ui-md-p');
  assert.match(childMargin, /margin:\s*0;/);
  assert.ok(classCount(m[1]) > classCount('.ui-md-p'), `ブロックの間の規則 ${m[1]} は .ui-md-p の margin: 0 に詳細度で勝たない`);
});

const classNameOf = (src, marker) => {
  const m = new RegExp(`className="([^"]*\\b${marker}\\b[^"]*)"`).exec(src);
  assert.notEqual(m, null, `${marker} を持つ要素が無い`);
  return m[1].split(/\s+/);
};

test('Given poker のルーム / When 参加者の欄を探す / Then 区画は ui-stack・見出しの行は ui-section-head で、画面は並びの写しを持たない（一覧 #1）', () => {
  const src = read('apps/poker-web/src/pages/RoomPage.tsx');
  const at = src.indexOf('id={PARTICIPANTS_HEADING_ID}');
  assert.ok(at > 0);
  const before = src.slice(0, at);
  const section = before.slice(before.lastIndexOf('<section'));
  assert.match(section, /^<section className="ui-stack">/);
  assert.match(section, /<div className="ui-section-head">/);
  assert.doesNotMatch(read('apps/poker-web/src/index.css'), /room-participants-head/);
});

test('Given poker の見積もりの記録 / When 束の見出しの行を探す / Then ui-section-head', () => {
  const src = read('apps/poker-web/src/components/EstimateLog.tsx');
  assert.ok(classNameOf(src, 'estimate-group-head').includes('ui-section-head'));
  assert.ok(classNameOf(src, 'estimate-group').includes('ui-stack'));
});

test('Given roulette のいつものメンツ / When 区画と見出しの行を探す / Then ui-stack と ui-section-head', () => {
  const src = read('apps/roulette-web/src/components/RegularsSection.tsx');
  assert.ok(classNameOf(src, 'roulette-regulars').includes('ui-stack'));
  assert.ok(classNameOf(src, 'roulette-regulars-head').includes('ui-section-head'));
});

test('Given timer の見出しの行 / When SectionHeader と共有メモを探す / Then どちらも ui-section-head', () => {
  assert.ok(classNameOf(read('apps/timer-web/src/ui/primitives.tsx'), 'section-header').includes('ui-section-head'));
  assert.ok(classNameOf(read('apps/timer-web/src/ui/components/SharedMemo.tsx'), 'shared-memo-header').includes('ui-section-head'));
});

test('Given agenda の保存した流れ / When 区画を探す / Then ui-stack で、画面は縦の並びの写し（display: grid の gap）を持たない', () => {
  assert.ok(classNameOf(read('apps/agenda-web/src/components/SavedScenarioList.tsx'), 'builder-saved').includes('ui-stack'));
  assert.equal(ruleBody(read('apps/agenda-web/src/builder.css'), '.builder-saved'), null);
});
