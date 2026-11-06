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

const root = fileURLToPath(new URL('../../../', import.meta.url));
const read = (p) => readFileSync(root + p, 'utf8');

function ruleBody(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\>]/g, '\\$&');
  const m = new RegExp(`^${escaped} \\{([^}]*)\\}`, 'm').exec(css);
  return m === null ? null : m[1];
}

test('Given roulette の入る人の行 / When 規則を読む / Then 折り返さず、名前の列は縮み、操作の塊は縮まない（長い名前でも段が変わらない・一覧 #20）', () => {
  const css = read('apps/roulette-web/src/index.css');
  const row = ruleBody(css, '.roulette-row');
  assert.notEqual(row, null);
  assert.doesNotMatch(row, /flex-wrap:\s*wrap;/);
  const label = ruleBody(css, '.roulette-row-label');
  assert.match(label, /flex:\s*1 1 0;/);
  assert.match(label, /min-width:\s*0;/);
  assert.match(ruleBody(css, '.roulette-row-tail'), /flex:\s*none;/);
});

test('Given roulette の名前 / When 規則を読む / Then 2 行まで折り返して残りは省略する', () => {
  const body = ruleBody(read('apps/roulette-web/src/index.css'), '.roulette-name');
  assert.match(body, /-webkit-line-clamp:\s*2;/);
});

test('Given timer の名簿の名前 / When 規則を読む / Then 基準の幅が一定で、2 行まで折り返して残りは省略する（一覧 #15）', () => {
  const body = ruleBody(read('apps/timer-web/src/styles/roster-panel.css'), '.roster-panel-name');
  assert.match(body, /flex:\s*1 1 8rem;/);
  assert.match(body, /-webkit-line-clamp:\s*2;/);
});

test('Given timer のロビーの操作 / When 規則を読む / Then 行の幅いっぱいの段に右寄せで置く（自分の行も他の行と同じ並び・一覧 #7）', () => {
  const body = ruleBody(read('apps/timer-web/src/styles/lobby.css'), '.lobby-participant-actions');
  assert.match(body, /flex:\s*1 1 100%;/);
  assert.match(body, /justify-content:\s*flex-end;/);
});

test('Given agenda の組む画面の「上へ」「下へ」 / When 規則を読む / Then 幅は 44px 以上（一覧 #23）', () => {
  const body = ruleBody(read('apps/agenda-web/src/builder.css'), '.builder-row-tools .ui-button');
  assert.notEqual(body, null);
  assert.match(body, /min-width:\s*var\(--tap-target\);/);
});

test('Given agenda の 2 段目 / When 規則を読む / Then 名前の欄の列（2 列目）から始まる（一覧 #24）', () => {
  const body = ruleBody(read('apps/agenda-web/src/builder.css'), '.builder-row-controls');
  assert.match(body, /grid-column:\s*2;/);
});

test('Given timer の交代間隔 / When 規則を読む / Then 選択肢は 1 行に等分する（一覧 #17）', () => {
  const body = ruleBody(read('apps/timer-web/src/styles/session-config-panel.css'), '.session-config-intervals');
  assert.match(body, /grid-auto-flow:\s*column;/);
});

test('Given timer の状態の帯 / When 規則を読む / Then 40rem 未満は DOM の順のまま 2 列の grid で 2 段に組み、右の列は右寄せ（一覧 #14）', () => {
  const css = read('apps/timer-web/src/styles/status-strip.css');
  assert.match(css, /@media \(width < 40rem\) \{\s*\.status-strip \{\s*display:\s*grid;\s*grid-template-columns:\s*auto minmax\(0, 1fr\);/);
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

test('Given timer の見出しの行 / When CSS と配線を読む / Then margin-bottom を持たず、各パネルの根が gap で間を持つ（ADR 0035 決定 1・#556）', () => {
  const prim = read('apps/timer-web/src/styles/primitives.css');
  assert.doesNotMatch(ruleBody(prim, '.section-header'), /margin-bottom/);
  assert.doesNotMatch(read('apps/timer-web/src/styles/shared-memo.css'), /margin-bottom/);
  assert.match(prim, /\.panel-stack \{[^}]*gap:\s*var\(--panel-stack-gap, var\(--space-4\)\);/);
  assert.match(read('apps/timer-web/src/ui/components/PassphrasePanel.tsx'), /<div className="panel-stack">/);
  assert.match(read('apps/timer-web/src/ui/components/RosterPanel.tsx'), /<div className="panel-stack">/);
  assert.match(read('apps/timer-web/src/ui/History.tsx'), /<Card className="meter-panel-stack">/);
  assert.match(read('apps/timer-web/src/ui/Lobby.tsx'), /交代通知/);
  assert.equal((read('apps/timer-web/src/ui/Lobby.tsx').match(/<Card className="meter-panel-stack">/g) ?? []).length, 2);
  assert.match(read('apps/timer-web/src/ui/components/SessionConfigPanel.tsx'), /<div className="panel-stack">\s*<SectionHeader/);
});
