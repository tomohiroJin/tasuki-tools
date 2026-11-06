/**
 * 下端の帯の約束と、共通の見出しの狭い幅の組み方を字で読む（#554・親 #479）。
 *
 * jsdom は @media を解かないので、部品の試験では見えない。実際の見え方（不透明か・2 段か・字の左端が揃うか・URL が 1 行か）は
 * E2E（`e2e/specs/header-and-dock.spec.ts`）が見る。ここは E2E が変異検査のランナーに載らないため、変異検査の中で走る側として字で読む。
 * 切り出しを誤って空を読むと恒真になるので、規則がちょうど 1 つ見つかることを先に見る。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const COMPONENTS = resolve(dirname(fileURLToPath(import.meta.url)), '../src/components');
const read = (name) => readFileSync(resolve(COMPONENTS, name), 'utf8');
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** `head` で始まる @media の中身（波括弧の対応で切り出す）。同じ頭が 2 つあれば読み分けられないので赤にする。 */
function mediaBlock(css, head) {
  const plain = stripComments(css);
  const at = plain.indexOf(head);
  assert.notEqual(at, -1, `${head} が無い`);
  assert.equal(plain.indexOf(head, at + 1), -1, `${head} が 2 つ以上ある。この検査では読み分けられない`);
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

function rules(css) {
  return [...stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }));
}

/** 選択子が `selector` の規則がちょうど 1 つあることを確かめて返す。 */
function only(list, selector) {
  const found = list.filter((r) => r.selector === selector);
  assert.equal(found.length, 1, `\`${selector}\` の規則がちょうど 1 つではない（${found.length} 件）`);
  return found[0].body;
}

const dockRules = () => rules(mediaBlock(read('actions.css'), '@media (width < 40rem)'));
const headerRules = () => rules(mediaBlock(read('room-header.css'), '@media (width < 40rem)'));
const NOT_COMPACT = '.ui-room-header:not(.ui-room-header--compact)';

test('Given 40rem 未満の帯 / When 地を読む / Then 不透明な色のトークンで、グラデーション・透明・暗幕（α < 1）ではない', () => {
  const body = only(dockRules(), '.ui-actions--dock');
  assert.match(body, /background:\s*var\(--felt-950\);/);
  assert.doesNotMatch(body, /gradient|transparent|rgba|scrim/);
});

test('Given 40rem 未満の帯 / When 上端の余白を読む / Then 上の内側の余白は --space-3（下限 --space-2）', () => {
  const body = only(dockRules(), '.ui-actions--dock');
  assert.match(body, /padding:\s*var\(--space-3\) /);
});

test('Given 40rem 未満の帯 / When 並びを読む / Then 2 列の格子で、奇数の最後の子（主）は全幅の 1 段になる（操作は 2 段まで）', () => {
  const list = dockRules();
  const body = only(list, '.ui-actions--dock');
  assert.match(body, /display:\s*grid;/);
  assert.match(body, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/);
  assert.match(only(list, '.ui-actions--dock > :last-child:nth-child(odd)'), /grid-column:\s*1\s*\/\s*-1;/);
});

test('Given 40rem 未満の帯 / When ボタンの余白を読む / Then 320px の 1 列（約 138px）に収まるよう左右の余白を詰める', () => {
  const body = only(dockRules(), '.ui-actions--dock > .ui-button');
  assert.match(body, /padding-inline:\s*var\(--space-2\);/);
  assert.match(body, /min-width:\s*0;/);
});

test('Given 40rem 未満の帯 / When 選択欄の規則を読む / Then 選択欄は 1 段を使い、続く 2 つの操作は横に並ぶ', () => {
  const list = dockRules();
  assert.match(only(list, '.ui-actions--dock > select'), /grid-column:\s*1\s*\/\s*-1;/);
  assert.match(only(list, '.ui-actions--dock:has(> select) > :last-child:nth-child(odd)'), /grid-column:\s*auto;/);
});

test('Given 40rem 未満の通常の見出し / When 並びを読む / Then 折り返す flex に並べ直し、題は全幅の 1 段（4 段に積まない）', () => {
  const list = headerRules();
  const body = only(list, NOT_COMPACT);
  assert.match(body, /display:\s*flex;/);
  assert.match(body, /flex-wrap:\s*wrap;/);
  assert.match(only(list, `${NOT_COMPACT} .ui-page-header,\n  ${NOT_COMPACT} .ui-room-header-title`), /display:\s*contents;/);
  assert.match(only(list, `${NOT_COMPACT} .ui-room-header-title > h1`), /flex:\s*1 1 100%;/);
});

test('Given 40rem 未満の通常の見出し / When 戻るの規則を読む / Then 下線の字の横の余白（--space-2 と枠 1px）を打ち消して題に左端を揃え、order は持たない', () => {
  const body = only(headerRules(), `${NOT_COMPACT} .ui-page-header-back`);
  assert.match(body, /margin-inline-start:\s*calc\(-1 \* \(var\(--space-2\) \+ 1px\)\);/);
  assert.doesNotMatch(body, /order:/);
});

test('Given 40rem 未満の @media / When 見出しの規則を読む / Then order で目の順だけを変えない（Tab・読み上げの順が見た目と食い違う。WCAG 2.4.3・1.3.2）', () => {
  assert.doesNotMatch(mediaBlock(read('room-header.css'), '@media (width < 40rem)'), /\border\s*:/);
});

test('Given 招待の URL / When 字の規則を読む / Then 1 行に収め、収まらない分は省略する（2 行に折れない）', () => {
  const body = only(rules(read('invite.css')), '.ui-invite-url');
  assert.match(body, /white-space:\s*nowrap;/);
  assert.match(body, /text-overflow:\s*ellipsis;/);
  assert.match(body, /overflow:\s*hidden;/);
  assert.doesNotMatch(body, /word-break/);
});
