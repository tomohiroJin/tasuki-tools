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

/** 狭い幅でたたむ規則の選択子。許可リストの外の形なので、字の完全一致で見る。 */
const WIDE_HIDE_SELECTOR = '.ui-room-header .ui-room-header-share-toggle';

/** 詰めた見た目で、広い幅でも「仲間を招く」を出す規則の選択子（組を重ねた形。この検査の読める形の外なので、字の完全一致で見る）。 */
const COMPACT_SHOW_SELECTOR = '.ui-room-header.ui-room-header--compact .ui-room-header-share-toggle';

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
  const found = rules(block).filter((r) => r.selector === WIDE_HIDE_SELECTOR);
  assert.equal(found.length, 1, `40rem 以上の @media で「仲間を招く」を隠す規則がちょうど 1 つではない（${found.length} 件）`);
  return found[0];
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

test('Given 40rem 以上の @media / When 詰めた見た目の規則を読む / Then 「仲間を招く」を出す規則がちょうど 1 つあり、隠す規則より後で、組の数も多い', () => {
  const list = rules(mediaBlock(read('room-header.css'), '@media (width >= 40rem)'));
  const shown = list.filter((r) => r.selector === COMPACT_SHOW_SELECTOR);
  assert.equal(shown.length, 1, `詰めた見た目の規則がちょうど 1 つではない（${shown.length} 件）`);
  assert.match(shown[0].body, /display:\s*inline-flex/);
  const hideAt = list.findIndex((r) => r.selector === WIDE_HIDE_SELECTOR);
  const showAt = list.findIndex((r) => r.selector === COMPACT_SHOW_SELECTOR);
  assert.ok(showAt > hideAt, '詰めた見た目の規則が隠す規則より先にある（後勝ちで負ける）');
  // 組の数: `.a.b .c` は 3 個。隠す規則（2 個）より多いこと
  const count = (sel) => sel.split(/[\s.]+/).filter(Boolean).length;
  assert.ok(count(COMPACT_SHOW_SELECTOR) > count(WIDE_HIDE_SELECTOR));
});
