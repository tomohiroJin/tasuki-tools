/**
 * 比較の仕組み（#321・設計正本 §5）の純関数の自己テスト。
 *
 * **無害として扱う差は §5.4 の 2 類だけ。** ここで広げると、利用者が承認していない差が黙って通る。
 * 「除く」テストと同じ数だけ「除かない」テストを置く（オラクルは実装より広く書く）。
 */
import { describe, expect, it } from 'vitest';
import {
  diffEntries,
  diffKeyframes,
  isTailwindCustomProp,
  normalizeBoxShadow,
  themeVarNamesFromCss,
  type CompareOptions,
  type StyleEntry,
} from '../parity/compare-lib';

const NO_IGNORE: CompareOptions = { tailwindThemeVars: new Set(['--spacing']), ignore: [] };

function entry(path: string, props: Record<string, string>, pseudo = ''): StyleEntry {
  return { path, pseudo, props };
}

describe('isTailwindCustomProp: §5.4 の類 1', () => {
  it('Given --tw- で始まる名前 / When 判定する / Then Tailwind のもの', () => {
    expect(isTailwindCustomProp('--tw-shadow', new Set())).toBe(true);
  });
  it('Given theme 層の名簿にある名前 / When 判定する / Then Tailwind のもの', () => {
    expect(isTailwindCustomProp('--spacing', new Set(['--spacing']))).toBe(true);
  });
  it('Given timer 自身のトークンの別名 / When 判定する / Then Tailwind のものではない（比べる）', () => {
    expect(isTailwindCustomProp('--ink', new Set(['--spacing']))).toBe(false);
    expect(isTailwindCustomProp('--signal-tint', new Set(['--spacing']))).toBe(false);
  });
  it('Given 名前に tw を含むだけの変数 / When 判定する / Then Tailwind のものではない', () => {
    expect(isTailwindCustomProp('--twin', new Set())).toBe(false);
  });
});

describe('normalizeBoxShadow: §5.4 の類 2（長さがすべて 0 で色の α が 0 の層だけを落とす）', () => {
  it('Given 透明な 0 層と実の影 / When 正規化する / Then 実の影だけが残る', () => {
    expect(
      normalizeBoxShadow('rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0.5) 0px 10px 30px 0px'),
    ).toBe('rgba(0, 0, 0, 0.5) 0px 10px 30px 0px');
  });
  it('Given 透明な 0 層だけ / When 正規化する / Then none', () => {
    expect(normalizeBoxShadow('rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px')).toBe('none');
  });
  it('Given 色は透明だが長さが 0 でない層 / When 正規化する / Then 落とさない', () => {
    expect(normalizeBoxShadow('rgba(0, 0, 0, 0) 0px 1px 0px 0px')).toBe('rgba(0, 0, 0, 0) 0px 1px 0px 0px');
  });
  it('Given 長さは 0 だが色が不透明な層 / When 正規化する / Then 落とさない', () => {
    expect(normalizeBoxShadow('rgb(0, 0, 0) 0px 0px 0px 0px')).toBe('rgb(0, 0, 0) 0px 0px 0px 0px');
  });
  it('Given inset の透明な 0 層 / When 正規化する / Then 落とす', () => {
    expect(normalizeBoxShadow('rgba(0, 0, 0, 0) 0px 0px 0px 0px inset, rgb(1, 2, 3) 0px 0px 0px 1px')).toBe(
      'rgb(1, 2, 3) 0px 0px 0px 1px',
    );
  });
  it('Given rgba 以外の色表記（oklab など） / When 正規化する / Then 不透明とみなして落とさない（安全側）', () => {
    const v = 'oklab(0.5 0 0 / 0) 0px 0px 0px 0px';
    expect(normalizeBoxShadow(v)).toBe(v);
  });
});

describe('diffEntries: 基準とブランチの計算済みスタイルを突き合わせる', () => {
  it('Given 同じ値 / When 比べる / Then 差は 0 件', () => {
    const a = [entry('html>body', { color: 'rgb(0, 0, 0)' })];
    expect(diffEntries(a, a, NO_IGNORE)).toEqual([]);
  });
  it('Given 値が違う / When 比べる / Then 差として出る', () => {
    const d = diffEntries(
      [entry('html>body', { color: 'rgb(0, 0, 0)' })],
      [entry('html>body', { color: 'rgb(1, 0, 0)' })],
      NO_IGNORE,
    );
    expect(d).toEqual([{ path: 'html>body', pseudo: '', prop: 'color', base: 'rgb(0, 0, 0)', branch: 'rgb(1, 0, 0)' }]);
  });
  it('Given 道筋が片側にしか無い / When 比べる / Then 差として出る（無言で飛ばさない）', () => {
    const d = diffEntries([entry('html>body', {}), entry('html>body>p', { color: 'x' })], [entry('html>body', {})], NO_IGNORE);
    expect(d).toEqual([{ path: 'html>body>p', pseudo: '', prop: '*', base: '(あり)', branch: null }]);
  });
  it('Given 擬似要素が片側にしか無い / When 比べる / Then 差として出る', () => {
    const d = diffEntries([entry('html>body', {})], [entry('html>body', {}), entry('html>body', { content: '"x"' }, '::before')], NO_IGNORE);
    expect(d.map((x) => [x.pseudo, x.prop])).toEqual([['::before', '*']]);
  });
  it('Given プロパティが片側にしか無い / When 比べる / Then 差として出る', () => {
    const d = diffEntries([entry('html>body', { '--ink': 'a' })], [entry('html>body', {})], NO_IGNORE);
    expect(d).toEqual([{ path: 'html>body', pseudo: '', prop: '--ink', base: 'a', branch: null }]);
  });
  it('Given Tailwind のカスタムプロパティだけが違う / When 比べる / Then 差にしない（類 1）', () => {
    const d = diffEntries(
      [entry('html>body', { '--tw-shadow': '0 0 #0000', '--spacing': '0.25rem' })],
      [entry('html>body', {})],
      NO_IGNORE,
    );
    expect(d).toEqual([]);
  });
  it('Given 前置詞つきのプロパティが違う / When 比べる / Then 差として出る（除かない）', () => {
    const d = diffEntries(
      [entry('html>body', { '-webkit-text-size-adjust': '100%' })],
      [entry('html>body', { '-webkit-text-size-adjust': 'auto' })],
      NO_IGNORE,
    );
    expect(d).toHaveLength(1);
  });
  it('Given box-shadow が透明な 0 層の有無だけ違う / When 比べる / Then 差にしない（類 2）', () => {
    const d = diffEntries(
      [entry('p', { 'box-shadow': 'rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgb(0, 0, 0) 0px 1px 2px 0px' })],
      [entry('p', { 'box-shadow': 'rgb(0, 0, 0) 0px 1px 2px 0px' })],
      NO_IGNORE,
    );
    expect(d).toEqual([]);
  });
  it('Given box-shadow の透明な 0 層を除いても実の影が違う / When 比べる / Then 差として出る（類 2 は実の影を飲み込まない）', () => {
    const d = diffEntries(
      [entry('p', { 'box-shadow': 'rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgb(0, 0, 0) 0px 1px 2px 0px' })],
      [entry('p', { 'box-shadow': 'rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgb(0, 0, 0) 0px 1px 3px 0px' })],
      NO_IGNORE,
    );
    expect(d.map((x) => x.prop)).toEqual(['box-shadow']);
  });
  it('Given 除く規則に当たる差 / When 比べる / Then 差にしない。当たらない差は残る', () => {
    const options: CompareOptions = {
      tailwindThemeVars: new Set(),
      ignore: [{ path: /^html>body>p$/, prop: /^width$/, reason: 'ルームコードの字幅' }],
    };
    const d = diffEntries(
      [entry('html>body>p', { width: '10px', color: 'a' })],
      [entry('html>body>p', { width: '11px', color: 'b' })],
      options,
    );
    expect(d.map((x) => x.prop)).toEqual(['color']);
  });
});

describe('diffKeyframes: 使われているキーフレームの中身を突き合わせる', () => {
  it('Given 中身が違う / When 比べる / Then 名前が出る', () => {
    expect(diffKeyframes({ pulse: '@keyframes pulse { 50% { opacity: 0.5; } }' }, { pulse: '@keyframes pulse { 50% { opacity: 0.4; } }' })).toEqual(['pulse']);
  });
  it('Given 片側にしか無い / When 比べる / Then 名前が出る', () => {
    expect(diffKeyframes({ pulse: 'x' }, {})).toEqual(['pulse']);
  });
  it('Given 同じ / When 比べる / Then 空', () => {
    expect(diffKeyframes({ pulse: 'x' }, { pulse: 'x' })).toEqual([]);
  });
});

describe('themeVarNamesFromCss: Tailwind の theme 層が定義する変数の名簿', () => {
  it('Given @layer theme の中の :root / When 読む / Then その --* を返し、層の外の変数は含めない', () => {
    const css = '@layer theme{:root,:host{--spacing:.25rem;--text-sm:.875rem}}:root{--ink:#000}';
    expect([...themeVarNamesFromCss(css)].sort()).toEqual(['--spacing', '--text-sm']);
  });
});
