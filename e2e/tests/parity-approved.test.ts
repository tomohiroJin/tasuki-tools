/**
 * 利用者が個別に承認した差の除外（`e2e/parity/approved.ts`・#321）の自己テスト。
 *
 * **除外は狭く。** html 要素の 2 つの名前だけを除き、名前違い・要素違い・使う側の box-shadow は残ることを
 * 「除く」テストと同じ重さで確かめる（除外が広がると見た目の差を隠す偽の緑になる）。
 */
import { describe, expect, it } from 'vitest';
import { APPROVED } from '../parity/approved';
import { diffEntries, type CompareOptions, type StyleEntry } from '../parity/compare-lib';
import { NOISE } from '../parity/noise';

// timer.parity.ts と同じ組み合わせで比べる
const OPTIONS: CompareOptions = { tailwindThemeVars: new Set(), ignore: [...NOISE, ...APPROVED] };

function entry(path: string, props: Record<string, string>, pseudo = ''): StyleEntry {
  return { path, pseudo, props };
}

/** 基準に無くブランチにあるプロパティの差を作って比べる。 */
function diffOfAdded(path: string, prop: string, value: string) {
  return diffEntries([entry(path, {})], [entry(path, { [prop]: value })], OPTIONS);
}

describe('APPROVED: 利用者が 2026-10-04 に承認したトークンの差', () => {
  it('Given html に --shadow-panel が増える / When 比べる / Then 差にしない', () => {
    expect(diffOfAdded('html', '--shadow-panel', '0 1px 2px #000')).toEqual([]);
  });
  it('Given html に --shadow-dialog が増える / When 比べる / Then 差にしない', () => {
    expect(diffOfAdded('html', '--shadow-dialog', '0 8px 24px #000')).toEqual([]);
  });
  it('Given html の --shadow-panel の値が変わる / When 比べる / Then 差にしない（名前で除く）', () => {
    const d = diffEntries(
      [entry('html', { '--shadow-panel': 'a' })],
      [entry('html', { '--shadow-panel': 'b' })],
      OPTIONS,
    );
    expect(d).toEqual([]);
  });
  it('Given html に名前の違う --shadow-card が増える / When 比べる / Then 差として出る（対照）', () => {
    expect(diffOfAdded('html', '--shadow-card', 'x').map((x) => x.prop)).toEqual(['--shadow-card']);
  });
  it('Given 名前が前方一致するだけの --shadow-panel-x / When 比べる / Then 差として出る（対照）', () => {
    expect(diffOfAdded('html', '--shadow-panel-x', 'x').map((x) => x.prop)).toEqual(['--shadow-panel-x']);
  });
  it.each(['html>body:nth-of-type(1)', 'html>body:nth-of-type(1)>div:nth-of-type(1)'])(
    'Given html 以外の要素 %s に --shadow-panel が増える / When 比べる / Then 差として出る（対照）',
    (path) => {
      expect(diffOfAdded(path, '--shadow-panel', 'x').map((x) => [x.path, x.prop])).toEqual([[path, '--shadow-panel']]);
    },
  );
  it('Given html の box-shadow が変わる / When 比べる / Then 差として出る（使う側は比べ続ける・対照）', () => {
    const d = diffEntries(
      [entry('html', { 'box-shadow': 'none' })],
      [entry('html', { 'box-shadow': 'rgb(0, 0, 0) 0px 1px 2px 0px' })],
      OPTIONS,
    );
    expect(d.map((x) => x.prop)).toEqual(['box-shadow']);
  });
  it('Given html の要素ごと片側にしか無い / When 比べる / Then 差として出る（要素の有無は除かない・対照）', () => {
    const d = diffEntries([], [entry('html', { '--shadow-panel': 'x' })], OPTIONS);
    expect(d.map((x) => [x.path, x.prop])).toEqual([['html', '*']]);
  });
  it('Given 承認した規則 / When 中身を見る / Then 1 件ずつ理由と承認日を持つ', () => {
    for (const rule of APPROVED) {
      expect(rule.reason).toMatch(/2026-10-04/);
    }
    expect(APPROVED).toHaveLength(1);
  });
});
