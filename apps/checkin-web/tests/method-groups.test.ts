import { describe, expect, it } from 'vitest';
import { SIDES, methodsOf } from '@tasuki/checkin-core';
import { RANDOM_GROUP_TITLE } from '../src/copy';
import { METHOD_GROUPS } from '../src/method-groups';

/**
 * @requirements #635（増やしたやり方を今のやり方と同じ並びの中に見せる・目的ごとの小見出しで分ける）
 */
describe('やり方の選択の小見出し', () => {
  it.each(SIDES)('%s: 小見出しの並びは、その側のやり方を過不足なく 1 回ずつ含む（足し忘れたやり方は選択画面に出ない）', (side) => {
    const listed = METHOD_GROUPS[side].flatMap((g) => g.methods);
    expect(new Set(listed).size, '重複が無い').toBe(listed.length);
    expect([...listed].sort()).toEqual([...methodsOf(side)].sort());
  });

  it('小見出しの id と題は重ならず、空の小見出しは無い', () => {
    const groups = SIDES.flatMap((s) => METHOD_GROUPS[s]);
    expect(new Set(groups.map((g) => g.id)).size).toBe(groups.length);
    for (const side of SIDES) {
      const titles = METHOD_GROUPS[side].map((g) => g.title);
      expect(new Set([...titles, RANDOM_GROUP_TITLE]).size, side).toBe(titles.length + 1);
    }
    for (const g of groups) expect(g.methods.length, g.id).toBeGreaterThan(0);
  });
});
