/**
 * 札の並びの契約（#555・一覧 #4・#8・#9・#21・#27・#28・#30）。
 *
 * 見た目の合否は E2E（`e2e/specs/card-rows.spec.ts`）が矩形で測る。ここは、その前提になる画面の CSS の作り方を字面で固定する
 * （変異検査が走らせられるのは node:test と vitest だけなので、CSS の作り方を、ここで壊して確かめる）。
 * CSS は `@tasuki/test-css` で読む（規則がちょうど 1 つ見つかることを `only` が確かめる。コメントや字下げで範囲を決めない）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mediaBlock, mediaBlocks, only, outsideMedia, rules } from '@tasuki/test-css';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const read = (p) => readFileSync(root + p, 'utf8');

/** 規則の本体を `名前 → 値` にする（コメントは `rules` が落としている）。 */
function decls(body) {
  const map = new Map();
  for (const part of body.split(';')) {
    const i = part.indexOf(':');
    if (i === -1) continue;
    map.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
  }
  return map;
}

/** `list` から `selector` の規則をちょうど 1 つ取り、宣言の表にする。 */
const ruleDecls = (list, selector) => decls(only(list, selector));

/** 幅を固定する宣言の名前。`min-*` は 0（縮められる）だけを許す。 */
const WIDTH_FIXING = ['width', 'inline-size', 'flex-basis', 'max-width', 'max-inline-size'];

/** 幅を固定していないこと（固定すると右に端数の空きが残る）。 */
function assertNoFixedWidth(map, where) {
  for (const name of WIDTH_FIXING) assert.equal(map.has(name), false, `${where}: ${name} を持たない（幅は列が決める）`);
  for (const name of ['min-width', 'min-inline-size']) {
    if (map.has(name)) assert.equal(map.get(name), '0', `${where}: ${name} は 0 だけ`);
  }
}

const POKER = read('apps/poker-web/src/index.css');
const LANDING = read('apps/landing/src/index.css');
const CHECKIN = read('apps/checkin-web/src/table.css');
const SEAT_COLUMNS = 'repeat(auto-fill, minmax(6.5rem, 1fr))';

test('Given poker の席の並び / When 規則を読む / Then 列は 6.5rem の下限で数え（main と同じ数）、幅を人数で絞らず、行の中は上に揃う（#9・#4）', () => {
  const d = ruleDecls(rules(outsideMedia(POKER)), '.participants');
  assert.equal(d.get('display'), 'grid');
  assert.equal(d.get('grid-template-columns'), SEAT_COLUMNS);
  assert.equal(d.get('align-items'), 'start');
  // 列が中身の幅で決まる `.room-main` の中で幅を人数で絞ると、列の数がいつも人数になり、3 人以上で席が 1 行に並んでルーム全体が横にはみ出す
  for (const name of ['max-width', 'max-inline-size', 'width', 'inline-size', 'margin-inline']) assert.equal(d.has(name), false, `.participants: ${name} を持たない`);
  assert.doesNotMatch(read('apps/poker-web/src/components/ParticipantList.tsx'), /--seat-count/);
});

test('Given poker の席 / When 規則を読む / Then 幅を固定しない（固定すると右に端数の空きが残る・#9）', () => {
  assertNoFixedWidth(ruleDecls(rules(outsideMedia(POKER)), '.participants li'), '.participants li');
});

test('Given poker の席の名前 / When 規則を読む / Then 3 行で省略し、省略された名前は押して全文に開ける・title は付けない（#4）', () => {
  const list = rules(outsideMedia(POKER));
  const d = ruleDecls(list, '.participants .name-text');
  assert.equal(d.get('-webkit-line-clamp'), '3');
  assert.equal(d.get('line-clamp'), '3');
  assert.equal(d.get('overflow'), 'hidden');
  const open = ruleDecls(list, ".participants .name-text[data-expanded]");
  assert.equal(open.get('overflow'), 'visible');
  assert.equal(open.get('line-clamp'), 'none');
  assert.equal(open.get('-webkit-line-clamp'), 'unset');
  const tsx = read('apps/poker-web/src/components/ParticipantList.tsx');
  assert.match(tsx, /<ClampedName className="name-text" label=\{label\} \/>/);
  assert.doesNotMatch(tsx, /title=\{label\}/, '名前に title を付けない（名前と説明で二度読まれる）');
  const part = read('packages/web-kit/src/room/clamped-name.tsx');
  assert.match(part, /role: 'button'/);
  assert.match(part, /'aria-expanded': expanded/);
  assert.match(part, /document\.fonts\.addEventListener\('loadingdone'/);
});

test('Given お題も記録も無い poker のルーム / When 規則を読む / Then 操作の面を細い列に絞らない（見出しと左右の端が揃う・#8）', () => {
  for (const { selector, body } of rules(POKER)) {
    assert.doesNotMatch(body, /max-width:\s*46rem/, `${selector}: 46rem に絞らない`);
    if (selector.split(',').some((part) => /(^|\s)\.room-main$/.test(part.trim()))) {
      assert.doesNotMatch(body, /margin-inline:\s*auto/, `${selector}: 中央に寄せない`);
    }
  }
});

test('Given poker の手札 / When 規則を読む / Then 操作の面が手札より広いとき中央に置く（1920px で左に寄らない・#8）', () => {
  assert.equal(ruleDecls(rules(outsideMedia(POKER)), '.card-hand').get('justify-content'), 'center');
  const narrow = rules(mediaBlock(POKER, '@container room-main (width < 39rem)'));
  assert.equal(ruleDecls(narrow, '.card-hand').get('justify-content'), 'center');
});

test('Given landing の道具の札 / When 幅の段の外の規則を読む / Then 札は縦長の比を外した横長（絵が左・文字が右）で、置かれたマスと同じ幅（#21・#684）', () => {
  // 横長が既定で、縦長の実物大は扇（下の @container hub-tools）だけが上書きする。40rem 未満だけでなく、扇に満たない幅のすべてで横長にする（#684）
  const list = rules(outsideMedia(LANDING));
  const d = ruleDecls(list, '.tool-card');
  assert.equal(d.get('aspect-ratio'), 'auto');
  assert.equal(d.get('grid-template-columns'), 'auto minmax(0, 1fr)');
  assert.equal(d.get('width'), '100%');
  assert.equal(ruleDecls(list, '.hand li').get('container-type'), 'inline-size');
});

test('Given landing の道具の札 / When 札の幅が 16rem に満たない（文字を大きくした 320px など）/ Then 絵を上に回して文字の列に全幅を渡す（#21）', () => {
  const list = rules(mediaBlocks(LANDING, '@container (width < 16rem)'));
  assert.equal(ruleDecls(list, '.tool-card').get('grid-template-columns'), 'minmax(0, 1fr)');
  assert.equal(ruleDecls(list, '.tool-mark').get('grid-row'), 'auto');
  assert.equal(ruleDecls(list, '.tool-name, .tool-summary').get('grid-column'), '1');
});

test('Given landing の道具の札の並び / When 幅の段の規則を読む / Then 格子は 1・2・3 列で、札は段の割り方から渡された列に 2 本ぶんで置く（#684）', () => {
  // 段の割り方（短い段を中央へ寄せる始まりの列）は `apps/landing/src/hand-rows.ts` が決め、CSS は `--hand-start-N` を受け取るだけ
  assert.equal(ruleDecls(rules(outsideMedia(LANDING)), '.hand').get('grid-template-columns'), 'minmax(0, 1fr)');
  const two = rules(mediaBlock(LANDING, '@media (width >= 40rem)'));
  assert.equal(ruleDecls(two, '.hand').get('grid-template-columns'), 'repeat(4, minmax(0, 1fr))');
  assert.equal(ruleDecls(two, '.hand li').get('grid-column'), 'var(--hand-start-2, auto) / span 2');
  const three = rules(mediaBlock(LANDING, '@media (width >= 64rem)'));
  assert.equal(ruleDecls(three, '.hand').get('grid-template-columns'), 'repeat(6, minmax(0, 1fr))');
  assert.equal(ruleDecls(three, '.hand li').get('grid-column'), 'var(--hand-start-3, auto) / span 2');
});

test('Given landing の道具の札の扇 / When 札の列の箱が 64.5rem 以上の規則を読む / Then 実物大（15rem・5 / 7）の札を 4 列に置き、段の両端だけを逆向きに傾ける（#684）', () => {
  const fan = rules(mediaBlock(LANDING, '@container hub-tools (width >= 64.5rem)'));
  // 札 1 枚 = 列 2 本 + 間 1 つ = 15rem。15rem を割ると名前と一行説明が折り返す
  assert.equal(ruleDecls(fan, '.hand').get('grid-template-columns'), 'repeat(8, calc((15rem - var(--space-5)) / 2))');
  assert.equal(ruleDecls(fan, '.hand').get('gap'), 'var(--space-5)');
  const li = ruleDecls(fan, '.hand li');
  assert.equal(li.get('grid-column'), 'var(--hand-start-4, auto) / span 2');
  // 縦長の札は自分の幅で並びを変えない（上の 16rem の規則に当てない）
  assert.equal(li.get('container-type'), 'normal');
  assert.equal(ruleDecls(fan, '.tool-card').get('aspect-ratio'), '5 / 7');
  assert.equal(ruleDecls(fan, ".hand li[data-row-edge='start'] .tool-card").get('transform'), 'rotate(-4deg)');
  assert.equal(ruleDecls(fan, ".hand li[data-row-edge='end'] .tool-card").get('transform'), 'rotate(4deg)');
  // 並びの最初と最後（段をまたいで離れた 2 枚）を傾ける決め打ちを置かない
  assert.doesNotMatch(LANDING, /\.hand li:(first|last|nth)-child/);
  // 扇を測る箱は 64rem 以上でだけ名乗る（それより狭い幅では扇の規則が効かない）
  assert.equal(ruleDecls(rules(mediaBlock(LANDING, '@media (width >= 64rem)')), '.hub-tools').get('container'), 'hub-tools / inline-size');
});

test('Given landing の札の下 / When 規則を読む / Then 参加者と招待は 40rem 以上で 2 列に並んで高さが揃い、合言葉はその下の全幅に置く（#673）', () => {
  const base = ruleDecls(rules(outsideMedia(LANDING)), '.hub-room');
  assert.equal(base.get('grid-template-columns'), 'minmax(0, 1fr)');
  // 高さを揃える（既定の stretch）。`align-items: start` を戻すと、下に続く全幅の行の上で 2 枚の下端がずれる
  assert.equal(base.has('align-items'), false);
  const wide = rules(mediaBlock(LANDING, '@media (width >= 40rem)'));
  assert.equal(ruleDecls(wide, '.hub-room').get('grid-template-columns'), 'repeat(2, minmax(0, 1fr))');
  assert.equal(ruleDecls(wide, '.hub-passphrase').get('grid-column'), '1 / -1');
});

test('Given checkin の席の並び / When 規則を読む / Then poker と同じ列（6.5rem の下限で数える）を、人数までに絞った幅で中央に置く（#9・#28）', () => {
  const d = ruleDecls(rules(outsideMedia(CHECKIN)), '.seat-list');
  assert.equal(d.get('display'), 'grid');
  assert.equal(d.get('grid-template-columns'), SEAT_COLUMNS);
  assert.equal(d.get('max-width'), 'calc(var(--seat-count, 1000) * (6.5rem + var(--space-4)))');
  assert.equal(d.get('margin-inline'), 'auto');
  assert.equal(d.get('width'), '100%');
  assert.equal(d.get('align-items'), 'start');
  assert.match(read('apps/checkin-web/src/components/SeatRow.tsx'), /'--seat-count': seats\.length/);
  assertNoFixedWidth(ruleDecls(rules(outsideMedia(CHECKIN)), '.seat'), '.seat');
});

test('Given checkin の人数の行 / When 規則を読む / Then 席の並びと同じく中央に置く（人数が少なくても中心が揃う・#28）', () => {
  const d = ruleDecls(rules(outsideMedia(CHECKIN)), '.seat-count');
  assert.equal(d.get('justify-content'), 'center');
  assert.equal(d.get('text-align'), 'center');
});

test('Given checkin の手札 / When 規則を読む / Then 行の幅を等分する grid で、親の幅いっぱいに取り、同じ行のボタンは高さを揃える（#27）', () => {
  const list = rules(outsideMedia(CHECKIN));
  const hand = ruleDecls(list, '.hand');
  assert.equal(hand.get('display'), 'grid');
  assert.equal(hand.get('grid-template-columns'), 'repeat(auto-fill, minmax(var(--hand-card-min), 1fr))');
  assert.equal(hand.get('align-self'), 'stretch');
  assert.equal(hand.get('align-items'), 'stretch');
  assert.equal(hand.get('--hand-card-min'), 'max(7rem, calc(var(--font-size-sm) * 8 + 0.25rem))');
});

test('Given checkin のやり方の説明 / When 規則を読む / Then 行の長さを揃え、文節の折り方は足さない（320・640 で最後の行が 2 字になった・#30）', () => {
  const d = ruleDecls(rules(outsideMedia(CHECKIN)), '.method-prompt');
  assert.equal(d.get('text-wrap'), 'balance');
  assert.equal(d.has('word-break'), false);
});

test('Given checkin の席の名前 / When 規則を読む / Then 2 行で省略し、押して全文に開ける・title は付けない（poker と同じ作り・#4）', () => {
  const list = rules(outsideMedia(CHECKIN));
  const d = ruleDecls(list, '.seat-name');
  assert.equal(d.get('-webkit-line-clamp'), '2');
  assert.equal(d.get('overflow'), 'hidden');
  const open = ruleDecls(list, '.seat-name[data-expanded]');
  assert.equal(open.get('overflow'), 'visible');
  assert.equal(open.get('line-clamp'), 'none');
  const tsx = read('apps/checkin-web/src/components/SeatRow.tsx');
  assert.match(tsx, /<ClampedName className="seat-name" label=\{seat\.name\} \/>/);
  assert.doesNotMatch(tsx, /title=/);
});
