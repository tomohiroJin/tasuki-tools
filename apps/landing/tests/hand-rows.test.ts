/**
 * 道具の札の段の割り方（#684）。
 *
 * 札が 7 枚になって、3 列の並びが 3 + 3 + 1 に崩れた。段ごとの枚数の差を 1 枚以内に収め、
 * 枚数ごとの決め打ちを置かない（札を足す・減らすたびに CSS を直さない）。
 *
 * @requirements #684
 */
import { describe, expect, it } from 'vitest';
import { balancedRows, handPlacements } from '../src/hand-rows.js';

describe('札を段に割る', () => {
  it.each([
    [7, 4, [4, 3]],
    [7, 3, [3, 2, 2]],
    [7, 2, [2, 2, 2, 1]],
    [8, 4, [4, 4]],
    [6, 4, [3, 3]],
    [6, 3, [3, 3]],
    [5, 4, [3, 2]],
    [9, 4, [3, 3, 3]],
    [10, 4, [4, 3, 3]],
    [4, 4, [4]],
    [1, 4, [1]],
    [0, 4, []],
  ])('Given %i 枚・1 段に最大 %i 枚 / When 割る / Then %j', (count, max, expected) => {
    expect(balancedRows(count, max)).toEqual(expected);
  });

  it('Given 1〜40 枚・最大 2〜4 枚 / When 割る / Then 合計は枚数と同じで、段の差は 1 枚以内、最大を超えず、多い段が先に来る', () => {
    for (let count = 1; count <= 40; count += 1) {
      for (const max of [2, 3, 4]) {
        const rows = balancedRows(count, max);
        const where = `${String(count)} 枚・最大 ${String(max)}`;
        expect(rows.reduce((a, b) => a + b, 0), where).toBe(count);
        expect(Math.max(...rows) - Math.min(...rows), where).toBeLessThanOrEqual(1);
        expect(Math.max(...rows), where).toBeLessThanOrEqual(max);
        expect(rows.length, `${where}: 段の数は要る分だけ`).toBe(Math.ceil(count / max));
        expect([...rows].sort((a, b) => b - a), where).toEqual(rows);
      }
    }
  });
});

describe('札ごとの置き場所', () => {
  it('Given 7 枚 / When 置き場所を出す / Then 4 列では 4 + 3 で、短い段は半枚ぶん内へ寄り、段の両端が印になる', () => {
    const p = handPlacements(7);
    // 格子は「最大の枚数 × 2」本の列で、札 1 枚が 2 本ぶんを取る。段の頭の札だけが始まりの列を持つ
    expect(p.map((x) => x.start4)).toEqual([1, null, null, null, 2, null, null]);
    expect(p.map((x) => x.edge4)).toEqual(['start', null, null, 'end', 'start', null, 'end']);
  });

  it('Given 7 枚 / When 置き場所を出す / Then 3 列では 3 + 2 + 2、2 列では 2 + 2 + 2 + 1 で、短い段は中央へ寄る', () => {
    const p = handPlacements(7);
    expect(p.map((x) => x.start3)).toEqual([1, null, null, 2, null, 2, null]);
    expect(p.map((x) => x.start2)).toEqual([1, null, 1, null, 1, null, 2]);
  });

  it('Given 1 段に 1 枚だけの段 / When 置き場所を出す / Then その札は傾けない（両端の印を付けない）', () => {
    // 5 枚・4 列は 3 + 2。1 枚だけの段は 1 枚のとき
    expect(handPlacements(1).map((x) => x.edge4)).toEqual([null]);
    expect(handPlacements(5).map((x) => x.edge4)).toEqual(['start', null, 'end', 'start', 'end']);
  });

  it('Given 8 枚（札を 1 枚足した）・6 枚（1 枚減らした） / When 置き場所を出す / Then 同じ規則で 4 + 4・3 + 3 になる', () => {
    expect(handPlacements(8).map((x) => x.start4)).toEqual([1, null, null, null, 1, null, null, null]);
    expect(handPlacements(6).map((x) => x.start4)).toEqual([2, null, null, 2, null, null]);
    expect(handPlacements(6).map((x) => x.start3)).toEqual([1, null, null, 1, null, null]);
  });
});
