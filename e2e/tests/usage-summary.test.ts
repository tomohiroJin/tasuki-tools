/**
 * 規則の使用状況（E8・#321・設計正本 §5.5）の純関数の自己テスト。
 *
 * 鍵（`ruleKey`）がソースとビルドで食い違うと、当たった規則を「当たらなかった」と読み違える（あるいはその逆）。
 * 分母（`sourceRules`）が `@keyframes` の段を数えたり、重複した鍵を黙って 1 つにしたりしないことを固定する。
 *
 * 末尾の 1 件は、実際の比較の出力（`e2e/parity/out/<キー>/usage.json`）を束ねる照合。
 * `TASUKI_PARITY_USAGE_CHECK=1` のときだけ走る（出力は無視していて CI には無い・README の「規則の使用状況（E8）」）。
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import postcss from 'postcss';
import { repoGeneration } from '../parity/git-head';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  collectUsage,
  isTimerBuildSheet,
  liveTimerSheet,
  resolveUsedKeys,
  usageGateProblems,
  listUsageSources,
  readBuiltTimerCss,
  REPO_ROOT,
  ruleKey,
  rulesInBuiltCss,
  sourceRules,
  usageProblems,
} from '../parity/usage-summary';

const first = (css: string) => {
  let found: postcss.Rule | undefined;
  postcss.parse(css).walkRules((r) => {
    found ??= r;
  });
  if (found === undefined) throw new Error('規則が無い');
  return found;
};

describe('ruleKey', () => {
  it('Given @media の中の規則 / Then at-rule とセレクタで鍵を作る', () => {
    expect(ruleKey(first('@media (width >= 40rem) { .a  >  .b { color: red } }'))).toBe('@media (width >= 40rem)\u0000.a > .b');
  });
  it('Given @layer timer の囲い / Then @layer を鍵に入れない（ソースには囲いが無い）', () => {
    expect(ruleKey(first('@layer timer { @media (hover: hover) { .a:hover { color: red } } }'))).toBe('@media (hover: hover)\u0000.a:hover');
  });
  it('Given 複数のセレクタ / Then カンマの前後の空白を畳む', () => {
    expect(ruleKey(first('.a ,\n .b { color: red }'))).toBe('.a,.b');
  });
});

describe('sourceRules', () => {
  it('Given @keyframes の段 / Then 分母に入れない', () => {
    const rules = sourceRules([{ path: 'x.css', css: '.a { color: red }\n@keyframes k { 50% { opacity: .5 } }' }]);
    expect(rules.map((r) => r.key)).toEqual(['.a']);
  });
  it('Given 2 つのファイルに同じ鍵 / Then 止める（鍵で突き合わせられない）', () => {
    expect(() => sourceRules([{ path: 'x.css', css: '.a { color: red }' }, { path: 'y.css', css: '.a { margin: 0 }' }])).toThrow(/x\.css.*y\.css|重複/);
  });
  it('Given 規則 / Then ファイルと行を持つ', () => {
    expect(sourceRules([{ path: 'x.css', css: '\n.a { color: red }' }])).toEqual([{ key: '.a', file: 'x.css', line: 2 }]);
  });
});

describe('rulesInBuiltCss と usageProblems', () => {
  it('Given ビルドの CSS / Then 鍵ごとの出現回数を返す', () => {
    const built = '@layer timer { .a { color: red } }\n.a { margin: 0 }\n@media (width >= 40rem) { @layer timer { .b { color: red } } }';
    expect(Object.fromEntries(rulesInBuiltCss(built))).toEqual({ '.a': 2, '@media (width >= 40rem)\u0000.b': 1 });
  });
  it('Given ビルドの @keyframes の段 / Then 数えない（ソースと同じく分母の外）', () => {
    expect(Object.fromEntries(rulesInBuiltCss('@keyframes k { from { opacity: 0 } }\n.a { color: red }'))).toEqual({ '.a': 1 });
  });
  it('Given 当たらなかった規則 / Then 場所つきで返す', () => {
    const source = [{ key: '.a', file: 'x.css', line: 1 }, { key: '.b', file: 'x.css', line: 2 }];
    expect(usageProblems(source, new Set(['.a']))).toEqual(['x.css:2 .b']);
  });
  it('Given 当たりが空 / Then 全件を返す（空振りを緑にしない）', () => {
    expect(usageProblems([{ key: '.a', file: 'x.css', line: 1 }], new Set())).toHaveLength(1);
  });
});

describe('isTimerBuildSheet: timer のビルドの CSS のシートだけを対象にする', () => {
  it.each([
    ['http://127.0.0.1:18080/timer/assets/index-CKs04cYd.css', true],
    ['http://127.0.0.1:18080/timer/assets/index-CKs04cYd.css?v=1', true],
    ['', false],
    ['http://127.0.0.1:18080/timer/', false],
    ['http://127.0.0.1:18080/assets/index-x.css', false],
    ['http://127.0.0.1:18080/timer/assets/sub/x.css', false],
    ['http://127.0.0.1:18080/timer/assets/index-x.js', false],
    ['not a url', false],
  ])('Given sourceURL %j / Then %s', (url, expected) => {
    expect(isTimerBuildSheet(url)).toBe(expected);
  });
});

describe('liveTimerSheet: いま生きている timer の CSS のシートはちょうど 1 本', () => {
  const css = 'http://127.0.0.1:18080/timer/assets/index-a.css';
  // 遷移の前の文書のシートの id は、CDP の `getStyleSheetText` が「No style sheet with given id found」で失敗する（実測）
  const reader = (alive: Record<string, string>) => async (id: string): Promise<string> => {
    const text = alive[id];
    if (text === undefined) throw new Error('Protocol error (CSS.getStyleSheetText): No style sheet with given id found');
    return text;
  };
  it('Given 撮影が差し込む <style>（sourceURL が空）と timer の CSS / Then timer の CSS の id と本文を返す', async () => {
    const headers = [{ styleSheetId: 's1', sourceURL: '' }, { styleSheetId: 's2', sourceURL: css }];
    await expect(liveTimerSheet(headers, reader({ s1: '', s2: '.a{}' }))).resolves.toEqual({ styleSheetId: 's2', text: '.a{}' });
  });
  it('Given 同じシートの通知が 2 回 / Then 1 本と数える', async () => {
    const headers = [{ styleSheetId: 's2', sourceURL: css }, { styleSheetId: 's2', sourceURL: css }];
    await expect(liveTimerSheet(headers, reader({ s2: '.a{}' }))).resolves.toEqual({ styleSheetId: 's2', text: '.a{}' });
  });
  it('Given 遷移の前の文書のシート（もう無い）といまのシート / Then いまのシートだけを返す（DOM.documentUpdated の順序に頼らない）', async () => {
    const headers = [{ styleSheetId: 'old', sourceURL: css }, { styleSheetId: 'now', sourceURL: css }];
    await expect(liveTimerSheet(headers, reader({ now: '.b{}' }))).resolves.toEqual({ styleSheetId: 'now', text: '.b{}' });
  });
  it('Given timer の CSS が無い / Then 止める', async () => {
    await expect(liveTimerSheet([{ styleSheetId: 's1', sourceURL: '' }], reader({ s1: '' }))).rejects.toThrow(/1 本でない/);
  });
  it('Given timer の CSS が全部もう無い / Then 止める（理由つき）', async () => {
    await expect(liveTimerSheet([{ styleSheetId: 'old', sourceURL: css }], reader({}))).rejects.toThrow(/1 本でない.*No style sheet/);
  });
  it('Given 生きている timer の CSS が 2 本 / Then 止める', async () => {
    const headers = [{ styleSheetId: 's1', sourceURL: css }, { styleSheetId: 's2', sourceURL: css }];
    await expect(liveTimerSheet(headers, reader({ s1: '', s2: '' }))).rejects.toThrow(/1 本でない/);
  });
});

describe('resolveUsedKeys: CDP の当たりのオフセットを規則の鍵へ引き当てる', () => {
  // 素の Chromium（`<style>`）で CDP の `stopRuleUsageTracking` が返したオフセットをそのまま使う（2026-10-04 実測）。
  // 入れ子の at-rule の中の宣言と、その後ろに続く宣言は、暗黙の規則（CSSNestedDeclarations）として、
  // 塊の最初の宣言の先頭（前のコメントは飛ばす）で返る
  const css = [
    '.a {',
    '  color: red;',
    '  @supports (color: color-mix(in lab, red, red)) {',
    '    /* c */ color: color-mix(in oklab, red 50%, blue);',
    '  }',
    '  margin: 0;',
    '  /* x */  padding: 1px;',
    '}',
    '.b { @media (width >= 1px) { color: blue; } }',
    '.c { color: red; .d & { color: blue } border: 0; }',
    '',
  ].join('\n');
  it('前提: 実測のオフセットが宣言の先頭を指している', () => {
    expect([82, 131, 198, 253].map((o) => css.slice(o, o + 6))).toEqual(['color:', 'margin', 'color:', 'border']);
  });
  it('Given 規則の先頭と at-rule の条件の先頭 / Then 規則だけを鍵にし、条件は読み飛ばす', () => {
    expect(resolveUsedKeys(css, [0, 31, 169, 181, 215, 232])).toEqual({ keys: ['.a', '.b', '.c', '.d &'], unmatched: [] });
  });
  it('Given 入れ子の @supports の中の宣言の塊 / Then 最も近い祖先の規則の鍵として数える', () => {
    expect(resolveUsedKeys(css, [82])).toEqual({ keys: ['.a'], unmatched: [] });
  });
  it('Given 入れ子の at-rule の後ろに続く宣言の塊・入れ子の規則の後ろの宣言の塊・@media の中の宣言 / Then 祖先の規則の鍵', () => {
    expect(resolveUsedKeys(css, [131, 253, 198])).toEqual({ keys: ['.a', '.b', '.c'], unmatched: [] });
  });
  it('Given 塊の先頭でない宣言（規則の最初の宣言・塊の 2 つ目の宣言） / Then 引き当てない（止める側へ倒す）', () => {
    const plain = css.indexOf('color: red;');
    const second = css.indexOf('padding');
    expect(resolveUsedKeys(css, [plain, second])).toEqual({ keys: [], unmatched: [plain, second] });
  });
  it('Given どこにも当たらないオフセット / Then unmatched に返す', () => {
    expect(resolveUsedKeys(css, [1, 0])).toEqual({ keys: ['.a'], unmatched: [1] });
  });
  it('Given 祖先に規則の無い at-rule の中の宣言（@font-face） / Then 引き当てない', () => {
    const face = '@font-face { font-family: x; src: url(a.woff2) }';
    expect(resolveUsedKeys(face, [face.indexOf('font-family')])).toEqual({ keys: [], unmatched: [face.indexOf('font-family')] });
  });
  it('Given @layer の中の入れ子の @supports / Then 祖先の規則の鍵は @layer を除く', () => {
    const layered = '@layer timer { @media (hover: hover) { .l:hover { color: red; @supports (x: y) { color: blue } } } }';
    expect(resolveUsedKeys(layered, [layered.indexOf('color: blue')])).toEqual({ keys: ['@media (hover: hover)\u0000.l:hover'], unmatched: [] });
  });
});

describe('usageGateProblems: ゲートの断定', () => {
  it('Given 分母が空 / Then 「分母が空」で赤（空振りを緑にしない）', () => {
    expect(usageGateProblems(sourceRules([]), new Map(), new Set())).toEqual([expect.stringMatching(/分母が空/)]);
  });
  it('Given 分母の鍵がビルドに 0 回・2 回 / Then 回数つきで返す', () => {
    const source = [{ key: '.a', file: 'x.css', line: 1 }, { key: '.b', file: 'x.css', line: 2 }];
    expect(usageGateProblems(source, new Map([['.b', 2]]), new Set(['.a', '.b']))).toEqual([
      'ビルドの CSS に 1 回ずつ現れない: x.css:1 .a → 0 回',
      'ビルドの CSS に 1 回ずつ現れない: x.css:2 .b → 2 回',
    ]);
  });
  it('Given 当たらなかった規則 / Then 場所つきで返す', () => {
    const source = [{ key: '.a', file: 'x.css', line: 1 }];
    expect(usageGateProblems(source, new Map([['.a', 1]]), new Set())).toEqual(['当たらなかった: x.css:1 .a']);
  });
  it('対照: 分母が 1 回ずつ現れ、全部当たっていれば空', () => {
    const source = [{ key: '.a', file: 'x.css', line: 1 }];
    expect(usageGateProblems(source, new Map([['.a', 1]]), new Set(['.a']))).toEqual([]);
  });
});

describe('collectUsage: 止まるべき所で止まる', () => {
  let dir = '';
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'usage-summary-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  const write = (key: string, body: unknown): void => {
    mkdirSync(path.join(dir, key), { recursive: true });
    writeFileSync(path.join(dir, key, 'usage.json'), JSON.stringify(body));
  };

  it('Given 期待するキーの usage.json が 1 つ欠けている / Then 欠けたキーの名前つきで止まる', () => {
    write('a', { generation: 'g1', used: ['.a'] });
    expect(() => collectUsage(dir, ['a', 'b'])).toThrow(/欠けている.*b/);
  });
  it('Given 世代が食い違う / Then 止まる（一部だけ流し直した）', () => {
    write('a', { generation: 'g1', used: [] });
    write('b', { generation: 'g2', used: [] });
    expect(() => collectUsage(dir, ['a', 'b'])).toThrow(/世代/);
  });
  it('Given 世代が -dirty / Then 止まる（未コミットの別々の変更を見分けられない）', () => {
    write('a', { generation: 'g1-dirty', used: [] });
    expect(() => collectUsage(dir, ['a'])).toThrow(/dirty/);
  });
  it('Given used が配列でない / Then 止まる', () => {
    write('a', { generation: 'g1', used: '.a' });
    expect(() => collectUsage(dir, ['a'])).toThrow(/used/);
  });
  it('対照: 揃っていれば全キーの当たりを束ねる', () => {
    write('a', { generation: 'g1', used: ['.a'] });
    write('b', { generation: 'g1', used: ['.b', '.a'] });
    const result = collectUsage(dir, ['a', 'b']);
    expect({ generation: result.generation, used: [...result.used].sort() }).toEqual({ generation: 'g1', used: ['.a', '.b'] });
  });
});

describe('readBuiltTimerCss: index.html が参照する CSS を 1 本だけ読む', () => {
  let root = '';
  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'usage-built-'));
    mkdirSync(path.join(root, 'apps/timer-web/dist/assets'), { recursive: true });
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });
  const dist = (rel: string, body: string): void => writeFileSync(path.join(root, 'apps/timer-web/dist', rel), body);
  const longCss = Array.from({ length: 120 }, (_, i) => `.c${i} { color: red }`).join('\n');

  it('Given 古いビルドの CSS が assets に残っている / Then index.html が参照する方を読む', () => {
    dist('assets/index-old.css', '.old{color:red}');
    dist('assets/index-new.css', longCss);
    dist('index.html', '<link rel="stylesheet" crossorigin href="/timer/assets/index-new.css">');
    expect(readBuiltTimerCss(root)).toBe(longCss);
  });
  it('Given 参照が 2 本 / Then 止まる', () => {
    dist('assets/a.css', longCss);
    dist('assets/b.css', longCss);
    dist('index.html', '<link rel="stylesheet" href="/timer/assets/a.css"><link rel="stylesheet" href="/timer/assets/b.css">');
    expect(() => readBuiltTimerCss(root)).toThrow(/1 本/);
  });
  it('Given 最小化された CSS / Then 「最小化しないビルドではない」で止まる', () => {
    dist('assets/index-min.css', '.a{color:red}.b{color:blue}');
    dist('index.html', '<link rel="stylesheet" href="/timer/assets/index-min.css">');
    expect(() => readBuiltTimerCss(root)).toThrow(/最小化しないビルドではない/);
  });
});

describe.runIf(process.env['TASUKI_PARITY_USAGE_CHECK'] === '1')('E8: 足した規則はどれも 1 回以上当たる', () => {
  it('全状態の usage.json を束ね、分母の全規則が当たっている', () => {
    const result = collectUsage();
    // ソースは作業ツリーのいまを読むので、束ねた当たりもいまの世代で流したものでなければ突き合わせられない
    expect(result.generation, 'usage.json の世代がいまの HEAD と違う（流し直す）').toBe(repoGeneration(REPO_ROOT));
    const source = sourceRules(listUsageSources(REPO_ROOT));
    const built = rulesInBuiltCss(readBuiltTimerCss(REPO_ROOT));
    expect(usageGateProblems(source, built, result.used)).toEqual([]);
  });
});
