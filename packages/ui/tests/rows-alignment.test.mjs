/**
 * 一覧の行の並びの契約（#556・#479 A）。
 *
 * 見た目の合否は E2E（`e2e/specs/rows-alignment.spec.ts`・`buttons.spec.ts`）が矩形で測る。ここは、その前提になる
 * **画面の CSS の約束**を字面で固定する（変異検査が走らせられるのは node:test と vitest だけなので、壊して確かめる場所）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { rules } from '@tasuki/test-css';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const read = (p) => readFileSync(root + p, 'utf8');

function ruleBody(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\>]/g, '\\$&');
  const m = new RegExp(`^${escaped} \\{([^}]*)\\}`, 'm').exec(css);
  return m === null ? null : m[1];
}

test('Given roulette の入る人の行 / When 規則を読む / Then 名前の列は縮むが読める幅（7rem）を保ち、操作の塊は縮まず、入らない幅では塊が次の行へ回る（一覧 #20・E3）', () => {
  const css = read('apps/roulette-web/src/index.css');
  const row = ruleBody(css, '.roulette-row');
  assert.notEqual(row, null);
  assert.match(row, /flex-wrap:\s*wrap;/);
  const label = ruleBody(css, '.roulette-row-label');
  assert.match(label, /flex:\s*1 1 0;/);
  assert.match(label, /min-width:\s*min\(7rem, 100%\);/);
  assert.match(ruleBody(css, '.roulette-row-tail'), /flex:\s*none;/);
});

test('Given roulette の名前 / When 規則を読む / Then 2 行まで折り返して残りは省略する', () => {
  const body = ruleBody(read('apps/roulette-web/src/index.css'), '.roulette-name');
  assert.match(body, /-webkit-line-clamp:\s*2;/);
});

test('Given timer の名簿の名前 / When 規則を読む / Then 基準の幅が一定（5rem・収まる幅で短い名前の行が 2 段にならない）で、2 行まで折り返して残りは省略する（一覧 #15）', () => {
  const body = ruleBody(read('apps/timer-web/src/styles/roster-panel.css'), '.roster-panel-name');
  assert.match(body, /flex:\s*1 1 5rem;/);
  assert.match(body, /-webkit-line-clamp:\s*2;/);
});

test('Given timer のロビーの操作 / When 規則を読む / Then 行の幅いっぱいの段に固定せず（収まる幅では名前と同じ段）、折り返した段は右寄せ（一覧 #7・E5）', () => {
  const body = ruleBody(read('apps/timer-web/src/styles/lobby.css'), '.lobby-participant-actions');
  assert.doesNotMatch(body, /flex:\s*1 1 100%;/);
  assert.match(body, /justify-content:\s*flex-end;/);
  assert.match(body, /margin-inline-start:\s*auto;/);
});

test('Given agenda の組む画面の「上へ」「下へ」 / When 規則を読む / Then 幅は 44px 以上（一覧 #23）', () => {
  const body = ruleBody(read('apps/agenda-web/src/builder.css'), '.builder-row-tools .ui-button');
  assert.notEqual(body, null);
  assert.match(body, /min-width:\s*var\(--tap-target\);/);
});

test('Given agenda の 2 段目 / When 規則を読む / Then 既定は行の全幅から始まり、行の幅が操作の幅に対して十分なときだけ名前の欄の列（2 列目）から始まる（一覧 #24・E4）', () => {
  const css = read('apps/agenda-web/src/builder.css');
  assert.match(ruleBody(css, '.builder-row-controls'), /grid-column:\s*1 \/ -1;/);
  assert.match(ruleBody(css, '.builder-row'), /container:\s*builder-row \/ inline-size;/);
  assert.match(css, /@container builder-row \(min-width: 44em\) \{\s*\.builder-row-controls \{\s*grid-column:\s*2;/);
});

test('Given timer の交代間隔 / When 規則を読む / Then 折り返せる並びで、選択肢は最小の幅（44px）を保つ（一覧 #17・E2）', () => {
  const css = read('apps/timer-web/src/styles/session-config-panel.css');
  const group = ruleBody(css, '.session-config-intervals');
  assert.match(group, /display:\s*flex;/);
  assert.match(group, /flex-wrap:\s*wrap;/);
  assert.doesNotMatch(group, /grid-auto-flow/);
  const chip = ruleBody(css, '.session-config-interval');
  assert.match(chip, /min-width:\s*var\(--tap-target\);/);
  assert.match(chip, /white-space:\s*nowrap;/);
});

test('Given timer の状態の帯 / When 規則を読む / Then 40rem 未満は DOM の順のまま 2 本の等分の列の grid で 2 段に組み（左の列が広がって右が 0 に潰れない）、右の列は右寄せ（一覧 #14・E1）', () => {
  const css = read('apps/timer-web/src/styles/status-strip.css');
  assert.match(css, /@media \(width < 40rem\) \{\s*\.status-strip \{\s*display:\s*grid;\s*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(css, /\.status-strip > :nth-child\(even\) \{\s*justify-self:\s*end;/);
});

test('Given 画面の CSS / When order を探す / Then 無い（目の順と DOM の順（Tab・読み上げ）をずらさない・WCAG 1.3.2・2.4.3）', () => {
  const css = read('apps/timer-web/src/styles/status-strip.css');
  assert.doesNotMatch(css, /^\s*order:/m);
});

test('Given timer の Card の縦の間 / When 規則と配線を読む / Then 親が gap で持ち、共有メモ・参加者の見出しは margin を持たない（ADR 0035 決定 1）', () => {
  const css = read('apps/timer-web/src/styles/primitives.css');
  assert.match(css, /\.meter-panel-stack,\n\.panel-stack \{[^}]*gap:\s*var\(--panel-stack-gap, var\(--space-4\)\);/);
  assert.match(read('apps/timer-web/src/ui/components/SharedMemo.tsx'), /<Card className=\{updated \? "meter-panel-stack /);
  assert.match(read('apps/timer-web/src/ui/Lobby.tsx'), /<Card className="meter-panel-stack">/);
});

/** 規則の本体から、縦の余白（上下）を 0 以外にしている宣言を返す。`margin`・`margin-block`・`margin-block-end`・`margin-bottom`（と上側）を読む。 */
function nonZeroVerticalMargins(body) {
  const zero = (v) => /^0(px|rem|em)?$/.test(v);
  const bad = [];
  for (const decl of body.split(';')) {
    const m = /^\s*(margin(?:-block(?:-start|-end)?|-top|-bottom)?)\s*:\s*([^]*?)\s*$/.exec(decl);
    if (m === null) continue;
    const [, prop, rawValue] = m;
    const values = rawValue.split(/\s+(?![^(]*\))/);
    let vertical;
    if (prop === 'margin') {
      // 1 値 = 全辺、2 値 = 上下 左右、3 値 = 上 左右 下、4 値 = 上 右 下 左
      vertical = values.length === 1 ? [values[0]] : values.length === 2 ? [values[0]] : values.length === 3 ? [values[0], values[2]] : [values[0], values[2]];
    } else if (prop === 'margin-block') {
      vertical = values;
    } else {
      vertical = [rawValue.trim()];
    }
    if (!vertical.every(zero)) bad.push(decl.trim());
  }
  return bad;
}

test('Given 縦の余白の判定 / When 別の書き方を渡す / Then 0 以外の縦の値をすべて見つける（字面の margin-bottom だけを見ない）', () => {
  assert.deepEqual(nonZeroVerticalMargins('margin-block: 0;'), []);
  assert.deepEqual(nonZeroVerticalMargins('margin: 0;'), []);
  assert.deepEqual(nonZeroVerticalMargins('margin: 0 auto;'), []);
  assert.equal(nonZeroVerticalMargins('margin-block: 0 var(--space-4);').length, 1);
  assert.equal(nonZeroVerticalMargins('margin-block-end: 1rem;').length, 1);
  assert.equal(nonZeroVerticalMargins('margin: 0 0 var(--space-4);').length, 1);
  assert.equal(nonZeroVerticalMargins('margin: var(--space-2) auto;').length, 1);
  assert.equal(nonZeroVerticalMargins('margin-bottom: var(--space-4);').length, 1);
});

test('Given timer の見出しの行 / When 規則を集める / Then どの書き方でも縦の余白は 0（`.section-header`・`.shared-memo-header`・ADR 0035 決定 1・#556）', () => {
  for (const [file, cls] of [['apps/timer-web/src/styles/primitives.css', '.section-header'], ['apps/timer-web/src/styles/shared-memo.css', '.shared-memo-header']]) {
    const mine = rules(read(file)).filter((r) => r.selector.split(', ').includes(cls));
    assert.ok(mine.length >= 1, `${cls} の規則が見つからない`);
    for (const r of mine) assert.deepEqual(nonZeroVerticalMargins(r.body), [], `${cls}（${r.selector}）が縦の余白を持つ`);
  }
});

test('Given timer の見出しの行 / When CSS と配線を読む / Then margin-bottom を持たず、各パネルの根が gap で間を持つ（ADR 0035 決定 1・#556）', () => {
  const prim = read('apps/timer-web/src/styles/primitives.css');
  assert.match(prim, /\.panel-stack \{[^}]*gap:\s*var\(--panel-stack-gap, var\(--space-4\)\);/);
  assert.match(read('apps/timer-web/src/ui/components/PassphrasePanel.tsx'), /<div className="panel-stack">/);
  assert.match(read('apps/timer-web/src/ui/components/RosterPanel.tsx'), /<div className="panel-stack">/);
  assert.match(read('apps/timer-web/src/ui/History.tsx'), /<Card className="meter-panel-stack">/);
  assert.match(read('apps/timer-web/src/ui/Lobby.tsx'), /交代通知/);
  assert.equal((read('apps/timer-web/src/ui/Lobby.tsx').match(/<Card className="meter-panel-stack">/g) ?? []).length, 2);
  assert.match(read('apps/timer-web/src/ui/components/SessionConfigPanel.tsx'), /<div className="panel-stack">\s*<SectionHeader/);
});
