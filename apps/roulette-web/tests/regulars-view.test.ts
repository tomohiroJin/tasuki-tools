import { describe, expect, it } from 'vitest';
import type { Member, RouletteView } from '@tasuki/roulette-core';
import { batchNoticeText, planBatch } from '../src/regulars-view';

const IDLE: RouletteView = { excluded: [], guests: [], drawn: [], spin: null };
const MEMBERS: Member[] = [
  { id: 'p1', name: 'あや', present: true },
  { id: 'p2', name: 'れん', present: false },
];
const guestsOf = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `g${i + 1}`, name: `ゲスト${i + 1}` }));
const namesOf = (n: number, from = 1) => Array.from({ length: n }, (_, i) => `新${from + i}`);

/**
 * @requirements #458 E3・E3b（知らせを画面が中核の関数から組む）
 */
describe('planBatch', () => {
  it('Given 空の輪 / When 3 人を入れる / Then 3 人とも入り、入る人は在室の自分と合わせて 4 人', () => {
    expect(planBatch({ view: IDLE, members: MEMBERS, names: ['A1', 'A2', 'A3'] })).toEqual({ added: 3, skipped: 0, overflow: 0, poolAfter: 4 });
  });

  it('Given 自分の名前を含む / When 入れる / Then 自分はとばす', () => {
    expect(planBatch({ view: IDLE, members: MEMBERS, names: ['あや', 'A1'] })).toEqual({ added: 1, skipped: 1, overflow: 0, poolAfter: 2 });
  });

  it('Given 離席中の人と同じ名前 / When 入れる / Then 在室でなくてもとばす（離席中は入る人に数えない）', () => {
    expect(planBatch({ view: IDLE, members: MEMBERS, names: ['れん', 'A1'] })).toEqual({ added: 1, skipped: 1, overflow: 0, poolAfter: 2 });
  });

  it('Given ゲストが 20 人 / When 8 人を入れる / Then 4 人入って 4 人は入らない（在室の自分と合わせて 25 人）', () => {
    const plan = planBatch({ view: { ...IDLE, guests: guestsOf(20) }, members: MEMBERS, names: namesOf(8) });
    expect(plan).toEqual({ added: 4, skipped: 0, overflow: 4, poolAfter: 25 });
  });

  it('Given ゲストが 24 人 / When 1 人入れる / Then 入らず、入る人は変わらない', () => {
    expect(planBatch({ view: { ...IDLE, guests: guestsOf(24) }, members: MEMBERS, names: ['A1'] })).toEqual({ added: 0, skipped: 0, overflow: 1, poolAfter: 25 });
  });

  it('Given 中核と同じ g-1 形式の ID で g-1 を外している / When 1 人入れる / Then 新しい人は外れた扱いにならない', () => {
    const view = { ...IDLE, guests: [{ id: 'g-1', name: 'ゲスト1' }, { id: 'g-2', name: 'ゲスト2' }], excluded: ['g-1'] };
    expect(planBatch({ view, members: [{ id: 'p1', name: 'あや', present: true }], names: ['A1'] })).toEqual({ added: 1, skipped: 0, overflow: 0, poolAfter: 3 });
  });

  it('Given 外してあるゲスト / When 入れる / Then 入る人に数えない', () => {
    const view = { ...IDLE, guests: guestsOf(2), excluded: ['g1'] };
    expect(planBatch({ view, members: MEMBERS, names: ['A1'] })).toEqual({ added: 1, skipped: 0, overflow: 0, poolAfter: 3 });
  });
});

describe('batchNoticeText', () => {
  it.each([
    ['全部入った', { added: 8, skipped: 0, overflow: 0, poolAfter: 9 }, '8 人を入れました'],
    ['一部をとばした', { added: 6, skipped: 2, overflow: 0, poolAfter: 7 }, '6 人を入れました。2 人はもう入っているので、とばしました'],
    ['上限で止まった', { added: 6, skipped: 0, overflow: 3, poolAfter: 7 }, '6 人を入れました。名前は 24 人まで追加できます。3 人は入りませんでした'],
    ['両方', { added: 6, skipped: 2, overflow: 3, poolAfter: 7 }, '6 人を入れました。2 人はもう入っているので、とばしました。名前は 24 人まで追加できます。3 人は入りませんでした'],
    ['全員もういる', { added: 0, skipped: 5, overflow: 0, poolAfter: 6 }, '全員もう入っています'],
    ['上限で 0 人', { added: 0, skipped: 0, overflow: 4, poolAfter: 20 }, '名前は 24 人まで追加できます。入れられませんでした'],
    ['とばしたうえで上限で 0 人', { added: 0, skipped: 2, overflow: 4, poolAfter: 20 }, '名前は 24 人まで追加できます。入れられませんでした'],
    ['入る人が 25 人になる', { added: 8, skipped: 0, overflow: 0, poolAfter: 25 }, '8 人を入れました。入る人がいま 25 人です。回せるのは 24 人までなので、チェックを外してください'],
    ['24 人ちょうどなら促さない', { added: 8, skipped: 0, overflow: 0, poolAfter: 24 }, '8 人を入れました'],
    ['全員いるが 25 人', { added: 0, skipped: 5, overflow: 0, poolAfter: 26 }, '全員もう入っています。入る人がいま 26 人です。回せるのは 24 人までなので、チェックを外してください'],
  ])('Given %s / When 知らせを組む / Then 文が決まる', (_name, plan, expected) => {
    expect(batchNoticeText(plan)).toBe(expected);
  });
});
