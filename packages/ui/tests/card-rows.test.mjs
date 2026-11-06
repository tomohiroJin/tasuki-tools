/**
 * 札の並びの契約（#555・一覧 #4・#8・#9・#21・#27・#28・#30）。
 *
 * 見た目の合否は E2E（`e2e/specs/card-rows.spec.ts`）が矩形で測る。ここは、その前提になる画面の CSS の作り方を字面で固定する
 * （変異検査が走らせられるのは node:test と vitest だけなので、CSS の作り方を、ここで壊して確かめる）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const read = (p) => readFileSync(root + p, 'utf8');

/** `selector { … }` の本体。セレクタは行頭（インデント可）から `{` までの完全一致。無ければ null。 */
function ruleBody(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\>:]/g, '\\$&');
  const m = new RegExp(`^[ ]*${escaped} \\{([^}]*)\\}`, 'm').exec(css);
  return m === null ? null : m[1];
}

const POKER = read('apps/poker-web/src/index.css');
const LANDING = read('apps/landing/src/index.css');
const CHECKIN = read('apps/checkin-web/src/table.css');

test('Given poker の席の並び / When 規則を読む / Then 行の幅を等分する grid で、行の中は上に揃う（#9・#4）', () => {
  const body = ruleBody(POKER, '.participants');
  assert.notEqual(body, null);
  assert.match(body, /display:\s*grid;/);
  assert.match(body, /grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(6\.5rem,\s*1fr\)\);/);
  assert.match(body, /align-items:\s*start;/);
});

test('Given poker の席 / When 規則を読む / Then 幅を固定しない（固定すると右に端数の空きが残る・#9）', () => {
  const body = ruleBody(POKER, '.participants li');
  assert.notEqual(body, null);
  assert.doesNotMatch(body, /(^|[;\s])width:/);
});

test('Given poker の席の名前 / When 規則を読む / Then 3 行で省略し、全文は title に残る（#4）', () => {
  const body = ruleBody(POKER, '.participants .name-text');
  assert.notEqual(body, null);
  assert.match(body, /-webkit-line-clamp:\s*3;/);
  assert.match(body, /overflow:\s*hidden;/);
  assert.match(read('apps/poker-web/src/components/ParticipantList.tsx'), /className="name-text" title=\{label\}/);
});

test('Given お題も記録も無い poker のルーム / When 規則を読む / Then 操作の面を細い列に絞らない（見出しと左右の端が揃う・#8）', () => {
  assert.doesNotMatch(POKER, /\.room-main\s*\{[^}]*margin-inline:\s*auto/);
  assert.doesNotMatch(POKER, /max-width:\s*46rem/);
});

test('Given landing の道具の札 / When 40rem 未満の規則を読む / Then 札は縦長の比を外した横長（絵が左・文字が右）で、下の欄と同じ幅（#21）', () => {
  const block = LANDING.slice(LANDING.indexOf('@media (width < 40rem)'));
  const body = ruleBody(block, '.hub-tools .tool-card');
  assert.notEqual(body, null);
  assert.match(body, /aspect-ratio:\s*auto;/);
  assert.match(body, /grid-template-columns:\s*auto minmax\(0,\s*1fr\);/);
  assert.match(body, /width:\s*100%;/);
});

test('Given checkin の席と手札 / When 規則を読む / Then どちらも行の幅を等分する grid で、手札は親の幅いっぱいに取る（#27・#28）', () => {
  const seats = ruleBody(CHECKIN, '.seat-list');
  assert.notEqual(seats, null);
  assert.match(seats, /display:\s*grid;/);
  assert.match(seats, /grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(6\.5rem,\s*1fr\)\);/);
  const hand = ruleBody(CHECKIN, '.hand');
  assert.notEqual(hand, null);
  assert.match(hand, /display:\s*grid;/);
  assert.match(hand, /repeat\(auto-fill,\s*minmax\(var\(--hand-card-min\),\s*1fr\)\)/);
  assert.match(hand, /align-self:\s*stretch;/);
});

test('Given checkin の人数の行 / When 40rem 未満の規則を読む / Then 席の並びの中央に置く（#28）', () => {
  const block = CHECKIN.slice(CHECKIN.indexOf('/* 席が行の幅を等分して全幅に並ぶ幅'));
  const body = ruleBody(block, '.seat-count');
  assert.notEqual(body, null);
  assert.match(body, /justify-content:\s*center;/);
});

test('Given checkin のやり方の説明 / When 規則を読む / Then 文節で折り、行の長さを揃える（最後の 1〜2 字が落ちない・#30）', () => {
  const body = ruleBody(CHECKIN, '.method-prompt');
  assert.notEqual(body, null);
  assert.match(body, /text-wrap:\s*balance;/);
  assert.match(body, /word-break:\s*auto-phrase;/);
});
