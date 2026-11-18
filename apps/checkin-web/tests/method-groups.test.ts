import { describe, expect, it } from 'vitest';
import { GROUP_IDS, SIDES, groupsOf } from '@tasuki/checkin-core';
import { RANDOM_GROUP_TITLE } from '../src/copy';
import { GROUP_TITLES } from '../src/method-groups';

/**
 * 小見出しの題（#635）。小見出しの並びと、各側のやり方を過不足なく含むことは checkin-core の `tests/methods.test.ts` が見る。
 * @requirements #635（目的ごとの小見出しで分ける）
 */
describe('小見出しの題', () => {
  it('全ての小見出しが題を持ち、余計な鍵が無い', () => {
    expect(Object.keys(GROUP_TITLES).sort()).toEqual([...GROUP_IDS].sort());
    for (const g of GROUP_IDS) expect(GROUP_TITLES[g].trim(), g).not.toBe('');
  });

  it.each(SIDES)('%s: 同じ側の題は重ならず、「おまかせ」とも重ならない（小見出しのランダムの読み上げ名で区別できる）', (side) => {
    const titles = groupsOf(side).map((g) => GROUP_TITLES[g]);
    expect(new Set([...titles, RANDOM_GROUP_TITLE]).size).toBe(titles.length + 1);
  });
});
