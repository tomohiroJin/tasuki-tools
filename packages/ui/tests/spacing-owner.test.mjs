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

/** `className="…"` のうち、クラスの並びの中に `marker` が**完全一致**で入っている最初のもの（`estimate-group` が `estimate-group-head` に当たらない）。 */
const classNameOf = (src, marker) => {
  for (const m of src.matchAll(/className="([^"]*)"/g)) {
    const tokens = m[1].split(/\s+/);
    if (tokens.includes(marker)) return tokens;
  }
  assert.fail(`${marker} を持つ要素が無い`);
};

test('Given poker のルーム / When 参加者の欄を探す / Then 区画は ui-stack・見出しの行は ui-section-head で、画面は並びの写しを持たない（一覧 #1）', () => {
  const src = read('apps/poker-web/src/pages/RoomPage.tsx');
  const at = src.indexOf('id={PARTICIPANTS_HEADING_ID}');
  assert.ok(at > 0);
  const before = src.slice(0, at);
  const section = before.slice(before.lastIndexOf('<section'));
  assert.match(section, /^<section className="ui-stack">/);
  // 見出しの隣へ寄せるのは部品の修飾（画面の上書きは持たない）
  assert.match(section, /<div className="ui-section-head ui-section-head--beside">/);
  assert.doesNotMatch(read('apps/poker-web/src/index.css'), /room-participants-head/);
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

test('Given timer の「ランダム」 / When ロビーと名簿の使い方を探す / Then どちらも ShuffleButton を使い、ボタンの写しを持たない', () => {
  assert.match(read('apps/timer-web/src/ui/Lobby.tsx'), /<ShuffleButton\b/);
  assert.match(read('apps/timer-web/src/ui/components/RosterPanel.tsx'), /<ShuffleButton\b/);
  for (const f of ['apps/timer-web/src/ui/Lobby.tsx', 'apps/timer-web/src/ui/components/RosterPanel.tsx', 'apps/timer-web/src/ui/Session.tsx']) {
    assert.doesNotMatch(read(f), /aria-label="ドライバー順をランダムに並べ替える"/, `${f} にボタンの写しがある`);
  }
  // 名簿はセッションの画面のクラスに寄りかからない
  assert.doesNotMatch(read('apps/timer-web/src/ui/components/RosterPanel.tsx'), /session-shuffle-label|session-action-icon/);
});

/** 規則の本体の宣言を「プロパティ: 値」の集合にする。 */
const declsOf = (body) => new Set([...body.matchAll(/([a-z-]+):\s*([^;]+);/g)].map((m) => `${m[1]}:${m[2].trim()}`));

test('Given roulette の空の知らせ / When :empty の宣言を読む / Then 部品 .ui-visually-hidden の宣言を全部含む（部品の写しであることを固定する）', () => {
  const hidden = declsOf(ruleBody(read('packages/ui/src/components/visually-hidden.css'), '.ui-visually-hidden'));
  const copy = declsOf(ruleBody(read('apps/roulette-web/src/index.css'), '.roulette-regulars-notice:empty'));
  assert.ok(hidden.size >= 8);
  for (const d of hidden) assert.ok(copy.has(d), `:empty の規則に ${d} が無い（部品の宣言と食い違う）`);
});

test('Given roulette の空の知らせ / When 規則と JSX を読む / Then 読み上げの木から外す書き方（display: none・visibility: hidden・hidden・aria-hidden）が無い', () => {
  const css = read('apps/roulette-web/src/index.css');
  for (const sel of ['.roulette-regulars-notice', '.roulette-regulars-notice:empty']) {
    assert.doesNotMatch(ruleBody(css, sel) ?? '', /display:\s*none|visibility:\s*hidden/);
  }
  const tag = /<p className="roulette-regulars-notice[^>]*>/.exec(read('apps/roulette-web/src/components/RegularsSection.tsx'));
  assert.notEqual(tag, null);
  assert.doesNotMatch(tag[0], /\bhidden\b|aria-hidden/);
});

test('Given poker の見積もりの記録 / When 束の見出しの行を探す / Then ui-section-head', () => {
  const src = read('apps/poker-web/src/components/EstimateLog.tsx');
  assert.ok(classNameOf(src, 'estimate-group-head').includes('ui-section-head'));
  assert.ok(classNameOf(src, 'estimate-group').includes('ui-stack--tight'));
});

test('Given roulette のいつものメンツ / When 区画と見出しの行を探す / Then ui-stack と ui-section-head', () => {
  const src = read('apps/roulette-web/src/components/RegularsSection.tsx');
  assert.ok(classNameOf(src, 'roulette-regulars').includes('ui-stack'));
  assert.ok(classNameOf(src, 'roulette-regulars-head').includes('ui-section-head'));
});

test('Given timer の見出しの行 / When SectionHeader と共有メモを探す / Then どちらも ui-section-head', () => {
  // className は beside の有無で選ぶ式なので、2 つの文字列のどちらにも ui-section-head があることを見る
  assert.equal([...read('apps/timer-web/src/ui/primitives.tsx').matchAll(/"section-header ui-section-head[^"]*"/g)].length, 2);
  assert.ok(classNameOf(read('apps/timer-web/src/ui/components/SharedMemo.tsx'), 'shared-memo-header').includes('ui-section-head'));
});

test('Given agenda の保存した流れ / When 区画を探す / Then ui-stack で、画面は縦の並びの写し（display: grid の gap）を持たない', () => {
  assert.ok(classNameOf(read('apps/agenda-web/src/components/SavedScenarioList.tsx'), 'builder-saved').includes('ui-stack'));
  assert.equal(ruleBody(read('apps/agenda-web/src/builder.css'), '.builder-saved'), null);
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

test('Given roulette の空の知らせ / When :empty の規則を読む / Then 子が負の余白で親の gap を打ち消さず、display: none にもしない（ライブリージョンを木に残す）', () => {
  const body = ruleBody(read('apps/roulette-web/src/index.css'), '.roulette-regulars-notice:empty');
  assert.notEqual(body, null);
  assert.doesNotMatch(body, /margin[^:]*:\s*calc\(\s*-/);
  assert.doesNotMatch(body, /display:\s*none/);
  assert.match(body, /position:\s*absolute;/);
});

test('Given timer の名簿の見出しの行 / When SectionHeader の使い方と規則を読む / Then ロビーと名簿は beside で操作を見出しの隣へ寄せる（行の反対の端へ離さない）', () => {
  assert.match(read('apps/timer-web/src/ui/Lobby.tsx'), /<SectionHeader\s[^>]*\bbeside\b/);
  assert.match(read('apps/timer-web/src/ui/components/RosterPanel.tsx'), /<SectionHeader\s[^>]*\bbeside\b/);
  assert.match(read('apps/timer-web/src/ui/primitives.tsx'), /ui-section-head ui-section-head--beside/);
  // 画面の上書きは持たない（部品の修飾を当てる）
  assert.doesNotMatch(read('apps/timer-web/src/styles/primitives.css'), /section-header--beside/);
});

test('Given poker の束のポイントの選択 / When 規則を読む / Then 字を切らず・縮めず右端へ寄せ、行は折り返してよく、名前の列が主', () => {
  const css = read('apps/poker-web/src/index.css');
  const points = ruleBody(css, '.estimate-log .estimate-group-points') ?? '';
  assert.match(points, /flex:\s*0 0 auto;/);
  assert.match(points, /margin-inline-start:\s*auto;/);
  assert.doesNotMatch(points, /overflow:\s*hidden|text-overflow|max-inline-size/);
  assert.doesNotMatch(points, /font-size:\s*[0-9.]+(px|rem)/);
});

test('Given agenda の保存した流れの一覧 / When ul を探す / Then ui-stack--tight（2 画面目の使い手）で、画面は縦の並びの写しを持たない', () => {
  assert.ok(classNameOf(read('apps/agenda-web/src/components/SavedScenarioList.tsx'), 'builder-saved-list').includes('ui-stack--tight'));
  assert.doesNotMatch(ruleBody(read('apps/agenda-web/src/builder.css'), '.builder-saved-list') ?? '', /display:|gap:/);
});

test('Given timer の「ランダム」の導き方 / When Session と Lobby を読む / Then 2 つの名簿へ 1 度だけ導いた値を渡し、ShuffleButton のスタイルは shuffle-button.css が持つ', () => {
  const session = read('apps/timer-web/src/ui/Session.tsx');
  assert.equal([...session.matchAll(/onShuffle && rotationLen > 1 \? onShuffle : undefined/g)].length, 1);
  assert.equal([...session.matchAll(/onShuffle=\{rosterShuffle\}/g)].length, 2);
  assert.match(read('apps/timer-web/src/ui/Lobby.tsx'), /rosterShuffle \? <ShuffleButton/);
  assert.match(read('apps/timer-web/src/styles/shuffle-button.css'), /\.shuffle-button-label[\s\S]*\.shuffle-button-icon/);
  assert.match(read('apps/timer-web/src/index.css'), /@import '\.\/styles\/shuffle-button\.css';/);
  assert.doesNotMatch(read('apps/timer-web/src/styles/roster-panel.css'), /shuffle-button/);
});

test('Given 3 行の写し .ui-reader-preview / When 縦の余白を読む / Then margin で取り、縦の padding を持たない（padding の帯に 4 行目の上端が覗く）', () => {
  const body = ruleBody(read('packages/ui/src/components/reader.css'), '.ui-reader-preview') ?? '';
  assert.match(body, /margin-block:\s*var\(--space-4\);/);
  assert.match(body, /padding:\s*0 var\(--space-5\);/);
});
