/**
 * 下端の帯の約束と、共通の見出しの狭い幅の組み方を字で読む（#554・親 #479）。
 *
 * jsdom は @media を解かないので、部品の試験では見えない。実際の見え方（不透明か・2 段か・字の左端が揃うか・URL が 1 行か）は
 * E2E（`e2e/specs/header-and-dock.spec.ts`）が見る。ここは E2E が変異検査のランナーに載らないため、変異検査の中で走る側として字で読む。
 * 切り出しを誤って空を読むと恒真になるので、規則がちょうど 1 つ見つかることを先に見る。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mediaBlock, only, outsideMedia, rules } from './support/css-text.mjs';

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
  const full = only(list, `.ui-actions--dock > :nth-child(odd of ${COUNTED}):nth-last-child(1 of ${COUNTED})`);
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

test('Given 条件つきの塊 / When outsideMedia を通す / Then @media・@container・@supports・@starting-style・@layer の中の規則は条件によらない側に出さない', () => {
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
  assert.deepEqual(rules(outsideMedia(css)).map((r) => r.selector), ['.a', '.z']);
});

test('Given 帯の逃がし余白 / When reset.css・トークンを読む / Then 要素層は旧い 6rem、帯のある画面だけ 2 段の帯の最大の高さ（--dock-max-height）＋ ホームバー', () => {
  const reset = readFileSync(resolve(COMPONENTS, '../elements/reset.css'), 'utf8');
  const narrow = rules(mediaBlock(reset, '@media (width < 40rem)'));
  assert.match(only(narrow, 'html'), /scroll-padding-block-end:\s*6rem;/);
  assert.match(only(narrow, 'html:has(.ui-actions--dock)'), /scroll-padding-block-end:\s*calc\(var\(--dock-max-height\) \+ env\(safe-area-inset-bottom\)\);/);
  const tokens = readFileSync(resolve(COMPONENTS, '../tokens/palette.css'), 'utf8');
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

test('Given 幅によらない規則 / When 戻るの規則を読む / Then 下線の字の横の余白（--space-2 と枠 1px）を打ち消して題に左端を揃え、詰めた見た目の auto より前にある', () => {
  const plain = readFileSync(resolve(COMPONENTS, 'room-header.css'), 'utf8');
  const list = rules(outsideMedia(plain));
  const body = only(list, '.ui-room-header .ui-page-header-back');
  assert.match(body, /margin-inline-start:\s*calc\(-1 \* \(var\(--space-2\) \+ 1px\)\);/);
  assert.doesNotMatch(body, /order:/);
  const at = list.findIndex((r) => r.selector === '.ui-room-header .ui-page-header-back');
  const compact = list.findIndex((r) => r.selector === '.ui-room-header--compact .ui-page-header-back');
  assert.ok(compact > at, '詰めた見た目の戻る（margin-inline-start: auto）が打ち消しより先にあり、打ち消しが勝ってしまう');
  assert.ok(!rules(mediaBlock(plain, '@media (width < 40rem)')).some((r) => r.selector.includes('.ui-page-header-back')), '40rem 未満の中に戻るの規則が残っている（幅によらず効かせる）');
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
  // 長い URL が grid の項目（justify-self: start）として欄の外へ出ないよう、上限と下限を持つ
  assert.match(body, /min-inline-size:\s*0;/);
  assert.match(body, /max-inline-size:\s*100%;/);
});

/** `dir` の下の製品コード（.ts・.tsx・.js・.jsx・.mjs・.css）を集める。node_modules・dist・tests は入れない。 */
function sourcesUnder(dir) {
  const found = [];
  for (const name of readdirSync(dir)) {
    if (['node_modules', 'dist', 'tests', 'test'].includes(name)) continue;
    const full = resolve(dir, name);
    if (statSync(full).isDirectory()) found.push(...sourcesUnder(full));
    else if (/\.(tsx?|jsx?|mjs|css)$/.test(name)) found.push(full);
  }
  return found;
}

// 監査（依存の向き）が自分自身の取り込みと誤るので、入口の名前は連結で作る
const ENTRY = ['@tasuki', 'ui', 'test-support'].join('/');

test('Given 試験用の入口 test-support / When 製品コード（apps/*/src・packages/*/src）を走査する / Then 1 件も読んでいない', () => {
  const root = resolve(COMPONENTS, '../../../..');
  const roots = [];
  for (const group of ['apps', 'packages']) {
    for (const name of readdirSync(resolve(root, group))) {
      try {
        if (statSync(resolve(root, group, name, 'src')).isDirectory()) roots.push(resolve(root, group, name, 'src'));
      } catch {
        // src の無いパッケージは対象外
      }
    }
  }
  assert.ok(roots.length >= 10, `走査する src が少なすぎる（${roots.length} 件）。走査が空振りしている`);
  const files = roots.flatMap((r) => sourcesUnder(r));
  assert.ok(files.length > 100, `走査したファイルが少なすぎる（${files.length} 件）`);
  const offenders = files.filter((f) => readFileSync(f, 'utf8').includes(ENTRY));
  assert.deepEqual(offenders, [], '製品コードが試験用の入口（test-support）を読んでいる');
});
