/**
 * 広い幅（40rem 以上）で「仲間を招く」を隠す規則が、`.ui-button` の `display` に勝つことを検査する（#447 段 1・設計 §7 R6）。
 *
 * 開閉のボタンは `ui-button` の組と `ui-room-header-share-toggle` を併せ持つ。`button.css` は `room-header.css` より
 * 後に読み込まれるので、隠す規則が同じ詳細度 (0,1,0) だと `.ui-button` の `display: inline-flex` が後勝ちし、
 * 広い幅にも開閉のボタンが出る。jsdom は @media を解かないので、部品の試験では見えない。実際の見え方は
 * E2E（`e2e/specs/panels-headers.spec.ts` の「1280×800 と 320×640」）が見る。ここは変異検査の中で走る側として、
 * 規則の詳細度と読み込みの順を字で読む。
 *
 * 切り出しを誤って空を読むと恒真になるので、規則が見つかることと `display: none` であることを先に見る。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const COMPONENTS = resolve(dirname(fileURLToPath(import.meta.url)), '../src/components');
const read = (name) => readFileSync(resolve(COMPONENTS, name), 'utf8');

/** `head` で始まる @media の中身（波括弧の対応で切り出す）。 */
function mediaBlock(css, head) {
  const at = css.indexOf(head);
  assert.notEqual(at, -1, `${head} が無い`);
  const open = css.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error(`${head} が閉じていない`);
}

/** コメントを落とした CSS から、`selector { body }` の組を拾う（入れ子の無いブロックの中身に使う）。 */
function rules(css) {
  const plain = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...plain.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }));
}

/**
 * 単純な詳細度（id, 組・属性・擬似クラス, 要素）。`:where()` は 0 なので中身ごと落とす。
 * ここで読むのは組だけの選択子なので、擬似要素などの細部は扱わない。
 */
function specificity(selector) {
  const s = selector.replace(/:where\([^)]*\)/g, '');
  const ids = (s.match(/#[\w-]+/g) ?? []).length;
  const classes = (s.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g) ?? []).length;
  const types = (s.replace(/[.#:][\w-]+|\[[^\]]*\]/g, ' ').match(/[a-z][\w-]*/gi) ?? []).length;
  return [ids, classes, types];
}

function greater(a, b) {
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

function wideHideRule() {
  const block = mediaBlock(read('room-header.css'), '@media (width >= 40rem)');
  const rule = rules(block).find((r) => r.selector.includes('.ui-room-header-share-toggle'));
  assert.ok(rule, '40rem 以上の @media に「仲間を招く」を指す規則が無い');
  return rule;
}

function buttonDisplayRule() {
  const rule = rules(read('button.css')).find((r) => r.selector === '.ui-button' && /display:\s*inline-flex/.test(r.body));
  assert.ok(rule, 'button.css に `.ui-button { display: inline-flex }` が無い');
  return rule;
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

test('Given 広い幅で隠す規則 / When .ui-button の display の規則と詳細度を比べる / Then 隠す規則の方が高い', () => {
  const hide = specificity(wideHideRule().selector);
  const button = specificity(buttonDisplayRule().selector);
  assert.ok(greater(hide, button), `隠す規則 (${hide.join(',')}) が .ui-button (${button.join(',')}) に勝たない`);
});
