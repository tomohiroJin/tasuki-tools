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
  timerSheetId,
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

describe('timerSheetId: 対象のシートはちょうど 1 本', () => {
  const css = 'http://127.0.0.1:18080/timer/assets/index-a.css';
  it('Given 撮影が差し込む <style>（sourceURL が空）と timer の CSS / Then timer の CSS の id だけを返す', () => {
    expect(timerSheetId([{ styleSheetId: 's1', sourceURL: '' }, { styleSheetId: 's2', sourceURL: css }])).toBe('s2');
  });
  it('Given 同じシートの通知が 2 回 / Then 1 本と数える', () => {
    expect(timerSheetId([{ styleSheetId: 's2', sourceURL: css }, { styleSheetId: 's2', sourceURL: css }])).toBe('s2');
  });
  it('Given timer の CSS が無い / Then 止める', () => {
    expect(() => timerSheetId([{ styleSheetId: 's1', sourceURL: '' }])).toThrow(/1 本でない/);
  });
  it('Given timer の CSS が 2 本 / Then 止める', () => {
    expect(() => timerSheetId([{ styleSheetId: 's1', sourceURL: css }, { styleSheetId: 's2', sourceURL: css }])).toThrow(/1 本でない/);
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
