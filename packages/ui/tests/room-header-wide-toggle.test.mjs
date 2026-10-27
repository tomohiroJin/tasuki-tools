/**
 * 「仲間を招く」のたたみの規則を字で読む（#447 段 1・設計 §8 R6）。
 *
 * 広い幅（40rem 以上）: 開閉のボタンは `ui-button` の組と `ui-room-header-share-toggle` を併せ持つ。`button.css` は
 * `room-header.css` より後に読み込まれるので、隠す規則が同じ詳細度 (0,1,0) だと `.ui-button` の `display: inline-flex`
 * が後勝ちし、広い幅にも開閉のボタンが出る。狭い幅（40rem 未満）: 開いていない間は招待の欄を `display: none` でたたむ。
 * jsdom は @media を解かないので、部品の試験ではどちらも見えない。実際の見え方は E2E
 * （`e2e/specs/panels-headers.spec.ts` の「1280×800 と 320×640」）が見る。ここは変異検査の中で走る側として字で読む。
 *
 * 詳細度は自前で計算しない（計算を賢くすると `:is()`・カンマ・擬似要素で穴が開く）。読めるのは「組を子孫結合子で
 * 繋いだだけ」の選択子に限り、それ以外は「この検査では読めない」で赤にする（許可リストで閉じる）。
 * 切り出しを誤って空を読むと恒真になるので、規則がちょうど 1 つ見つかることを先に見る。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const COMPONENTS = resolve(dirname(fileURLToPath(import.meta.url)), '../src/components');
const read = (name) => readFileSync(resolve(COMPONENTS, name), 'utf8');

/** この検査が読める選択子の形（組を子孫結合子で繋いだだけ）。 */
const CLASS_CHAIN = /^\.[\w-]+(?:\s+\.[\w-]+)*$/;

/** 広い幅（40rem 以上）で「仲間を招く」を隠す規則の選択子。 */
const WIDE_HIDE_SELECTOR = '.ui-room-header .ui-room-header-share-toggle';

/** 詰めた見た目で、広い幅でも「仲間を招く」を出す規則の選択子（組を重ねた形。この検査の読める形の外なので、字の完全一致で見る）。 */
const COMPACT_SHOW_SELECTOR = '.ui-room-header.ui-room-header--compact .ui-room-header-share-toggle';

/** 狭い幅でたたむ規則の選択子。許可リストの外の形なので、字の完全一致で見る。 */
const NARROW_FOLD_SELECTOR = ".ui-room-header-share:not([data-open='true'])";

/** コメントを落とす。 */
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** `head` で始まる @media の中身（波括弧の対応で切り出す）。同じ頭の @media が 2 つあれば読み分けられないので赤にする。 */
function mediaBlock(css, head) {
  const plain = stripComments(css);
  const at = plain.indexOf(head);
  assert.notEqual(at, -1, `${head} が無い`);
  assert.equal(plain.indexOf(head, at + 1), -1, `${head} が 2 つ以上ある。この検査では読み分けられない。検査を書き直す`);
  const open = plain.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < plain.length; i += 1) {
    if (plain[i] === '{') depth += 1;
    if (plain[i] === '}') {
      depth -= 1;
      if (depth === 0) return plain.slice(open + 1, i);
    }
  }
  throw new Error(`${head} が閉じていない`);
}

/** コメントを落とした CSS から、`selector { body }` の組を拾う（入れ子の無いブロックの中身に使う）。 */
function rules(css) {
  return [...stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }));
}

/** 組だけの選択子の組の数。許可リストの外の形は読まずに赤にする。 */
function classCount(selector) {
  assert.match(selector, CLASS_CHAIN, `\`${selector}\` はこの検査では読めない（組を子孫結合子で繋いだ形だけを読む）。検査を書き直す`);
  return selector.split(/\s+/).length;
}

function wideHideRule() {
  const block = mediaBlock(read('room-header.css'), '@media (width >= 40rem)');
  // 「仲間を招く」を指す規則はすべて拾い、知っている 2 本とちょうど一致することを求める（知らない規則が 1 本でも入れば赤）。
  const all = rules(block).filter((r) => r.selector.includes('.ui-room-header-share-toggle'));
  assert.deepEqual(
    all.map((r) => r.selector).sort(),
    [WIDE_HIDE_SELECTOR, COMPACT_SHOW_SELECTOR].sort(),
    '40rem 以上の @media の「仲間を招く」の規則が、隠す規則と詰めた見た目の規則の 2 本と一致しない。検査を見直す',
  );
  return all.find((r) => r.selector === WIDE_HIDE_SELECTOR);
}

function buttonDisplayRule() {
  const found = rules(read('button.css')).filter((r) => /(?:^|[;{\s])display\s*:/.test(r.body));
  assert.equal(found.length, 1, `button.css で display を宣言する規則がちょうど 1 つではない（${found.length} 件）。比べる相手を見直す`);
  assert.equal(found[0].selector, '.ui-button', 'button.css で display を宣言する規則が `.ui-button` ではない。比べる相手を見直す');
  assert.match(found[0].body, /display:\s*inline-flex/);
  return found[0];
}

test('Given 40rem 以上の @media / When 「仲間を招く」の規則を読む / Then display: none を持つ（対照）', () => {
  assert.match(wideHideRule().body, /display:\s*none/);
});

test('Given 部品層の読み込み順 / When index.css を読む / Then button.css は room-header.css より後（後勝ちされる前提の対照）', () => {
  const index = read('index.css');
  const roomHeader = index.indexOf("@import './room-header.css'");
  const button = index.indexOf("@import './button.css'");
  assert.notEqual(roomHeader, -1);
  assert.notEqual(button, -1);
  assert.ok(button > roomHeader, 'button.css が先に読まれるなら、この検査の前提を見直す');
});

test('Given 広い幅で隠す規則 / When .ui-button の display の規則と組の数を比べる / Then 隠す規則の方が多い', () => {
  const hide = classCount(wideHideRule().selector);
  const button = classCount(buttonDisplayRule().selector);
  assert.ok(hide > button, `隠す規則（組 ${hide} 個）が .ui-button（組 ${button} 個）に勝たない`);
});

test('Given 40rem 未満の @media / When 招待の欄をたたむ規則を読む / Then 開いていない間を display: none にする規則がちょうど 1 つある', () => {
  const block = mediaBlock(read('room-header.css'), '@media (width < 40rem)');
  const found = rules(block).filter((r) => r.selector === NARROW_FOLD_SELECTOR && /display:\s*none/.test(r.body));
  assert.equal(found.length, 1, `40rem 未満の @media に \`${NARROW_FOLD_SELECTOR} { display: none }\` がちょうど 1 つではない（${found.length} 件）`);
});

test('Given 40rem 以上の @media / When 詰めた見た目の規則を読む / Then 「仲間を招く」を出す規則がちょうど 1 つあり、隠す規則より後', () => {
  const list = rules(mediaBlock(read('room-header.css'), '@media (width >= 40rem)'));
  const shown = list.filter((r) => r.selector === COMPACT_SHOW_SELECTOR);
  assert.equal(shown.length, 1, `詰めた見た目の規則がちょうど 1 つではない（${shown.length} 件）`);
  assert.match(shown[0].body, /display:\s*inline-flex/);
  const hideAt = list.findIndex((r) => r.selector === WIDE_HIDE_SELECTOR);
  const showAt = list.findIndex((r) => r.selector === COMPACT_SHOW_SELECTOR);
  assert.ok(showAt > hideAt, '詰めた見た目の規則が隠す規則より先にある（読む順を揃える。勝ち負けは詳細度で決まる）');
});

/** 詰めた見た目で、幅によらず招待の欄をたたむ規則の選択子（@media の外に置く）。 */
const COMPACT_FOLD_SELECTOR = ".ui-room-header--compact .ui-room-header-share:not([data-open='true'])";

/** 詰めた見た目の狭い幅で、道具名を目に出さず読み上げにだけ残す規則の選択子。 */
const COMPACT_NARROW_TITLE_SELECTOR = '.ui-room-header--compact .ui-room-header-title > h1';

/** コメントを落とし、@media の塊（波括弧の対応で切り出す）を除いた残り。@media の外に置いた規則を読むのに使う。 */
function outsideMedia(css) {
  let plain = stripComments(css);
  for (let at = plain.indexOf('@media'); at !== -1; at = plain.indexOf('@media')) {
    const open = plain.indexOf('{', at);
    let depth = 0;
    let end = -1;
    for (let i = open; i < plain.length && end === -1; i += 1) {
      if (plain[i] === '{') depth += 1;
      if (plain[i] === '}') {
        depth -= 1;
        if (depth === 0) end = i;
      }
    }
    assert.notEqual(end, -1, '@media が閉じていない');
    plain = plain.slice(0, at) + plain.slice(end + 1);
  }
  return plain;
}

test('Given @media の外 / When 詰めた見た目の招待の欄の規則を読む / Then 幅によらず開いていない間を display: none にする規則がちょうど 1 つある', () => {
  // 広い幅の詰めた見た目は「仲間を招く」を出すので、欄をたたむ規則が @media の外に無いと、開く前から欄が出て見出しが高くなる
  const found = rules(outsideMedia(read('room-header.css'))).filter(
    (r) => r.selector === COMPACT_FOLD_SELECTOR && /display:\s*none/.test(r.body),
  );
  assert.equal(found.length, 1, `@media の外に \`${COMPACT_FOLD_SELECTOR} { display: none }\` がちょうど 1 つではない（${found.length} 件）`);
});

test('Given 40rem 未満の @media / When 詰めた見た目の道具名の規則を読む / Then 目に出さず読み上げに残す規則（.ui-visually-hidden と同じ宣言）がちょうど 1 つある', () => {
  // 実際の見え方（390×844 で計器が下端の帯に潜らない）は E2E の layout.spec が見る。ここは変異検査の中で走る側として字で読む
  const found = rules(mediaBlock(read('room-header.css'), '@media (width < 40rem)')).filter(
    (r) => r.selector === COMPACT_NARROW_TITLE_SELECTOR,
  );
  assert.equal(found.length, 1, `40rem 未満の @media に \`${COMPACT_NARROW_TITLE_SELECTOR}\` の規則がちょうど 1 つではない（${found.length} 件）`);
  assert.match(found[0].body, /position:\s*absolute/);
  assert.match(found[0].body, /clip-path:\s*inset\(50%\)/);
  assert.match(found[0].body, /width:\s*1px/);
  assert.match(found[0].body, /height:\s*1px/);
});
