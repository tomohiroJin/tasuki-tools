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
import { mediaBlock, mediaBlocks, only, outsideMedia, rules } from './support/css-text.mjs';

const COMPONENTS = resolve(dirname(fileURLToPath(import.meta.url)), '../src/components');
const read = (name) => readFileSync(resolve(COMPONENTS, name), 'utf8');
const dockRules = () => rules(mediaBlock(read('actions.css'), '@media (width < 40rem)'));
const headerRules = () => rules(mediaBlock(read('room-header.css'), '@media (width < 40rem)'));
const NOT_COMPACT = '.ui-room-header:not(.ui-room-header--compact)';

test('Given 40rem 未満の帯 / When 地を読む / Then 不透明な色のトークンで、グラデーション・透明・暗幕（α < 1）ではない', () => {
  const body = only(dockRules(), '.ui-actions--dock');
  assert.match(body, /background:\s*var\(--dock-ground\);/);
  assert.doesNotMatch(body, /gradient|transparent|rgba|scrim/);
});

test('Given トークン層 / When 帯の地と線の値を読む / Then --dock-ground は不透明な felt-950、--dock-edge は line-strong（部品も倣う画面の帯も同じ値を引く）', () => {
  const css = readFileSync(resolve(COMPONENTS, '../tokens/palette.css'), 'utf8');
  assert.match(css, /--dock-ground:\s*var\(--felt-950\);/);
  assert.match(css, /--dock-edge:\s*var\(--line-strong\);/);
});

test('Given 40rem 未満の帯 / When 上端の余白を読む / Then 上の内側の余白は --space-3（下限 --space-2）', () => {
  const body = only(dockRules(), '.ui-actions--dock');
  assert.match(body, /padding:\s*var\(--space-3\) /);
});

const COUNTED = ':not([hidden], .ui-visually-hidden, select, .ui-actions-start)';

test('Given 40rem 未満の帯 / When 並びを読む / Then 2 列の格子で、目に見える操作の奇数の最後（主）だけが全幅の 1 段になる（数える集合と最後を決める集合は同じ・操作は 2 段まで）', () => {
  const list = dockRules();
  const body = only(list, '.ui-actions--dock');
  assert.match(body, /display:\s*grid;/);
  assert.match(body, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/);
  // 数えるのは目に見える操作だけ（hidden・読み上げ専用・選択欄・控えの包みは数えない）。全部の子を数える :last-child:nth-child(odd) に戻さない
  const full = only(list, `.ui-actions--dock > :where(:nth-child(odd of ${COUNTED}):nth-last-child(1 of ${COUNTED}))`);
  assert.match(full, /grid-column:\s*1\s*\/\s*-1;/);
  assert.ok(!list.some((r) => /:last-child:nth-child\(odd\)/.test(r.selector)), '全部の子を数える :last-child:nth-child(odd) が残っている');
});

test('Given 40rem 未満の帯 / When ボタンの余白を読む / Then 320px の 1 列（約 138px）に収まるよう左右の余白を詰める', () => {
  const body = only(dockRules(), '.ui-actions--dock > .ui-button');
  assert.match(body, /padding-inline:\s*var\(--space-2\);/);
  assert.match(body, /min-width:\s*0;/);
});

test('Given 帯の [hidden] の規則 / When @media・@container などの外を読む / Then 数えない子を描かない規則が幅によらずある（README は幅によらないと読める）', () => {
  const plain = readFileSync(resolve(COMPONENTS, 'actions.css'), 'utf8');
  assert.match(only(rules(outsideMedia(plain)), '.ui-actions--dock > [hidden]'), /display:\s*none;/);
  assert.ok(!rules(mediaBlock(plain, '@media (width < 40rem)')).some((r) => r.selector === '.ui-actions--dock > [hidden]'), '40rem 未満の @media の中にも [hidden] の規則が残っている');
});

test('Given 条件つきの at 規則 / When outsideMedia を通す / Then @media・@container・@supports・@starting-style の中の規則は外へ出さず、@layer の中の規則は外側として数える', () => {
  const css = [
    '.a { x: 1; }',
    '@media (width < 40rem) { .m { x: 1; } }',
    '@container c (width < 44rem) { .c { x: 1; } }',
    '@supports (display: grid) { .s { x: 1; } }',
    '@starting-style { .t { x: 1; } }',
    '@layer base { .l { x: 1; } }',
    '@layer a, b;',
    '.z { x: 1; }',
  ].join('\n');
  assert.deepEqual(rules(outsideMedia(css)).map((r) => r.selector), ['.a', '.l', '.z']);
});

test('Given 同じ頭の @media が複数ある CSS / When mediaBlocks を通す / Then 全部をつないで返し、無ければ赤、閉じ括弧が欠けていれば throw する', () => {
  const css = '@media (width < 64rem) { .a { x: 1; } }\n.b { x: 1; }\n@media (width < 64rem) { .c { x: 1; } }';
  assert.deepEqual(rules(mediaBlocks(css, '@media (width < 64rem)')).map((r) => r.selector), ['.a', '.c']);
  assert.throws(() => mediaBlocks(css, '@media (width >= 0rem)'));
  assert.throws(() => mediaBlocks('@media (width < 64rem) { .a { x: 1; }', '@media (width < 64rem)'), /閉じていない/);
  // 長い条件の @media は同じ頭として拾わない
  const mixed = '@media (width < 64rem) { .a { x: 1; } }\n@media (width < 64rem) and (height < 30rem) { .long { x: 1; } }';
  assert.deepEqual(rules(mediaBlocks(mixed, '@media (width < 64rem)')).map((r) => r.selector), ['.a']);
  // outsideMedia も、{ の無い @media（壊れた CSS）は throw する（blockRange）
  assert.throws(() => outsideMedia('.a { x: 1; }\n@media (width < 64rem)'), /波括弧が開かない/);
  // { が見つからない（壊れた CSS）は throw する
  assert.throws(() => mediaBlocks('@media (width < 64rem)', '@media (width < 64rem)'), /{ が無い/);
  // 頭の直後から { までの間に ; や別の規則がある壊れた書き方は throw する
  assert.throws(() => mediaBlocks('@media (width < 64rem)\n.a { x: 1; }', '@media (width < 64rem)'), /壊れた CSS/);
  assert.throws(() => mediaBlocks('@media (width < 64rem); .a { x: 1; }', '@media (width < 64rem)'), /壊れた CSS/);
});

test('Given 帯の逃がし余白 / When reset.css・トークンを読む / Then 要素層は旧い 6rem、帯のある画面だけ 2 段の帯の最大の高さ（--dock-max-height）＋ ホームバー', () => {
  const reset = readFileSync(resolve(COMPONENTS, '../elements/reset.css'), 'utf8');
  const narrow = rules(mediaBlock(reset, '@media (width < 40rem)'));
  assert.match(only(narrow, 'html'), /scroll-padding-block-end:\s*6rem;/);
  assert.match(only(narrow, 'html:has(.ui-actions--dock)'), /scroll-padding-block-end:\s*calc\(var\(--dock-max-height\) \+ env\(safe-area-inset-bottom\)\);/);
  const tokens = readFileSync(resolve(COMPONENTS, '../tokens/shape.css'), 'utf8');
  assert.match(tokens, /--dock-max-height:\s*9\.5rem;/);
});

test('Given 40rem 未満の通常の見出し / When 招待の欄の規則を読む / Then 招待の欄は行いっぱい（flex-basis: 100%）で、道具のボタンと並ばない', () => {
  assert.match(only(headerRules(), `${NOT_COMPACT} .ui-room-header-share`), /flex-basis:\s*100%;/);
});

test('Given 選択欄の約束の文章 / When README を読む / Then 「先頭に置く・続く操作は 2 つまで」と書いてある（文言だけ。実画面で守られていることは E2E の dockFacts が測る）', () => {
  assert.match(readFileSync(resolve(COMPONENTS, '../../README.md'), 'utf8'), /選択欄（`<select>`）は\*\*先頭に置き\*\*、1 段を使う。\*\*選択欄があれば、続く操作は 2 つまで\*\*/);
});

test('Given 40rem 未満の帯 / When 選択欄と控えの包みの規則を読む / Then 位置によらず 1 段を使い、:has で奇数の数え方を上書きしない', () => {
  const list = dockRules();
  assert.match(only(list, '.ui-actions--dock > select, .ui-actions--dock > .ui-actions-start'), /grid-column:\s*1\s*\/\s*-1;/);
  assert.ok(!list.some((r) => r.selector.includes(':has(>')), '帯の規則が :has で子の並びを上書きしている');
});

test('Given 40rem 未満の帯 / When 位置の規則を読む / Then 帯を前の中身へ重ねる負の margin・transform・top を持たない', () => {
  const body = only(dockRules(), '.ui-actions--dock');
  assert.doesNotMatch(body, /margin-block-start|margin-top|transform|(^|[;\s])top\s*:|translate/);
});

test('Given 40rem 未満の帯 / When 上の線を読む / Then 線は --dock-edge から引く', () => {
  assert.match(only(dockRules(), '.ui-actions--dock'), /border-top:\s*1px solid var\(--dock-edge\);/);
});

test('Given 40rem 未満の通常の見出し / When 並びを読む / Then 折り返す flex に並べ直し、題は全幅の 1 段（4 段に積まない）', () => {
  const list = headerRules();
  const body = only(list, NOT_COMPACT);
  assert.match(body, /display:\s*flex;/);
  assert.match(body, /flex-wrap:\s*wrap;/);
  assert.match(only(list, `${NOT_COMPACT} .ui-page-header, ${NOT_COMPACT} .ui-room-header-title`), /display:\s*contents;/);
  assert.match(only(list, `${NOT_COMPACT} .ui-room-header-title > h1`), /flex:\s*1 1 100%;/);
});

test('Given 40rem 未満の通常の見出し / When 戻るの規則を読む / Then 左の余白と枠を持たず、40rem 以上と詰めた見た目は元の余白（左右対称）のまま', () => {
  const plain = readFileSync(resolve(COMPONENTS, 'room-header.css'), 'utf8');
  const body = only(headerRules(), `${NOT_COMPACT} .ui-page-header-back`);
  assert.match(body, /padding-inline-start:\s*0;/);
  assert.match(body, /border-inline-start-width:\s*0;/);
  assert.doesNotMatch(body, /margin|order:/);
  // @media の外（幅によらない側）には、戻るの左の余白・枠・margin を変える規則を置かない（詰めた見た目の `margin-inline-start: auto` だけ）
  const outside = rules(outsideMedia(plain)).filter((r) => r.selector.includes('.ui-page-header-back'));
  assert.deepEqual(outside.map((r) => r.selector), ['.ui-room-header--compact .ui-page-header-back']);
  assert.doesNotMatch(outside[0].body, /padding|border/);
});

test('Given 40rem 未満の @media / When 見出しの規則を読む / Then order で目の順だけを変えない（Tab・読み上げの順が見た目と食い違う。WCAG 2.4.3・1.3.2）', () => {
  assert.doesNotMatch(mediaBlock(read('room-header.css'), '@media (width < 40rem)'), /\border\s*:/);
});

test('Given 招待の URL / When 字の規則を読む / Then 省略せず、どこでも折り返して全部見せ、欄の幅で止める', () => {
  const body = only(rules(read('invite.css')), '.ui-invite-url');
  // 末尾を「…」で隠さない（クリップボードが使えない端末では目で読むしかない）
  assert.doesNotMatch(body, /text-overflow|white-space:\s*nowrap|overflow:\s*hidden/);
  assert.match(body, /overflow-wrap:\s*anywhere;/);
  assert.match(body, /word-break:\s*break-all;/);
  // 長い URL が grid の項目（justify-self: start）として欄の外へ出ないよう、上限と下限を持つ
  assert.match(body, /min-inline-size:\s*0;/);
  assert.match(body, /max-inline-size:\s*100%;/);
});

test('Given ボタンの部品 / When button.css を読む / Then hidden の .ui-button は描かない（display: inline-flex が UA の [hidden] に勝つ欠陥を、帯の外でも塞ぐ）', () => {
  const body = only(rules(readFileSync(resolve(COMPONENTS, 'button.css'), 'utf8')), '.ui-button[hidden]');
  assert.match(body, /display:\s*none;/);
});

test('Given 招待の行 / When コンテナクエリを読む / Then 広い組みの境目は 54rem（URL・コード・ボタンが 1 行に収まる幅。44rem では 768px で URL が 2 行に折れた）', () => {
  assert.match(read('room-header.css'), /@container ui-room-header-share \(width < 54rem\) \{/);
  assert.doesNotMatch(read('room-header.css'), /@container ui-room-header-share \(width < 44rem\)/);
});
