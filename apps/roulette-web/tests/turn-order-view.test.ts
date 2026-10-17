import { describe, expect, it } from 'vitest';
import type { Entry, RouletteView } from '@tasuki/roulette-core';
import {
  ORDER_ALL_DONE,
  ORDER_BUTTON,
  ORDER_LAST_BUTTON,
  ORDER_NEW_ROUND_BUTTON,
  ORDER_NOTE,
  ORDER_NOT_STARTED,
  SPINNING_BUTTON,
  TOO_FEW_TEXT,
  orderLastText,
  orderProgressText,
  spunByText,
  turnLabel,
  turnResultText,
} from '../src/copy';
import {
  modeOf,
  orderButtonOf,
  orderCaptionOf,
  orderProgressOf,
  orderStageOf,
  peopleOf,
  stageViewOf,
  type Phase,
} from '../src/roulette-view';

const E = (id: string): Entry => ({ id, name: id.toUpperCase() });
const POOL = ['a', 'b', 'c', 'd'].map(E);
const MEMBERS = POOL.map((e) => ({ ...e, present: true }));

const base: RouletteView = { pickCount: 1, mode: 'order', order: null, excluded: [], guests: [], drawn: [], spin: null };

/** 回の途中: done の人の番が決まり、最後の回転は turn 番（wheel は回した時点のまだの人） */
function inRound(doneIds: string[], wheelIds: string[], pickIndex: number): RouletteView {
  return {
    ...base,
    order: { done: doneIds.map(E), finished: false },
    spin: {
      seq: doneIds.length,
      wheel: wheelIds.map(E),
      winnerIndex: pickIndex,
      settle: 0.5,
      picks: [{ index: pickIndex, settle: 0.5 }],
      turn: doneIds.length,
      spunBy: 'あおい',
      durationMs: 4000,
      elapsedMs: 0,
    },
  };
}

const stage = (view: RouletteView, phase: Phase) => orderStageOf({ view, pool: POOL, phase, revealed: phase === 'settled' ? 1 : 0 });

/**
 * @requirements #401 順番に回す T1（決め方の読み方）
 */
describe('決め方と、舞台が読む回転', () => {
  it('古いサーバー（mode が無い）は 1 回で決めるとして読む', () => {
    // Given / When / Then
    expect(modeOf({ ...base, mode: undefined })).toBe('once');
    expect(modeOf(base)).toBe('order');
  });

  it('1 回で決めるときは、順番の回転（turn がある）を伏せる。1 回の回転はそのまま（同じ参照）', () => {
    // Given
    const order = { ...inRound(['b'], ['a', 'b', 'c', 'd'], 1), mode: 'once' as const, order: null };
    const once = { ...order, spin: { ...order.spin!, turn: undefined } };
    // When / Then
    expect(stageViewOf(order).spin).toBeNull();
    expect(stageViewOf(once)).toBe(once);
  });

  it('順番に回すときは、回が無ければ回転を伏せ（1 回の回転も）、回があれば順番の回転を読む', () => {
    // Given
    const round = inRound(['b'], ['a', 'b', 'c', 'd'], 1);
    // When / Then
    expect(stageViewOf({ ...round, order: null }).spin).toBeNull();
    expect(stageViewOf({ ...round, spin: { ...round.spin!, turn: undefined } }).spin).toBeNull();
    expect(stageViewOf(round)).toBe(round);
  });
});

/**
 * @requirements #401 順番に回す §5.1（舞台）
 */
describe('順番に回すときの舞台', () => {
  it('回す前: 円盤はいまの入る人で、中心はあと何人。一言は説明で、主ボタンは「次の人を決める」', () => {
    // Given
    const o = stage(base, 'idle');
    // Then
    expect(o.seats.entries.map((e) => e.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(o.seats.winners).toEqual([]);
    expect(o.hubCount).toBe(4);
    expect(o.card.revealed).toBe(false);
    expect(orderCaptionOf({ view: base, phase: 'idle', poolCount: 4, order: o })).toBe(ORDER_NOTE);
    expect(orderButtonOf({ order: o, poolCount: 4, operable: true, serverSpinning: false })).toEqual({ label: ORDER_BUTTON, disabled: false });
    expect(orderProgressOf(o)).toBe(ORDER_NOT_STARTED);
  });

  it('回す前に入る人が 1 人なら、2 人から回せると言い、押せない', () => {
    // Given
    const o = orderStageOf({ view: base, pool: [E('a')], phase: 'idle', revealed: 0 });
    // When / Then
    expect(orderCaptionOf({ view: base, phase: 'idle', poolCount: 1, order: o })).toBe(TOO_FEW_TEXT);
    expect(orderButtonOf({ order: o, poolCount: 1, operable: true, serverSpinning: false }).disabled).toBe(true);
  });

  it('回っている間: 円盤は回した時点の席で、選ばれる人はまだ数えず・名前も言わない', () => {
    // Given: 1 番が b、2 番の回転（c を選ぶ）が回っている
    const view = inRound(['b', 'c'], ['a', 'c', 'd'], 1);
    // When
    const o = stage(view, 'spinning');
    // Then
    expect(o.seats.entries.map((e) => e.id)).toEqual(['a', 'c', 'd']);
    expect(o.seats.winners).toEqual([]);
    expect(o.hubCount).toBe(3);
    expect(o.card).toEqual({ label: turnLabel(2), name: null, revealed: false });
    expect(o.turns).toEqual(new Map([['b', 1]]));
    expect(orderCaptionOf({ view, phase: 'spinning', poolCount: 4, order: o })).toBe(spunByText('あおい'));
    expect(orderButtonOf({ order: o, poolCount: 4, operable: true, serverSpinning: true })).toEqual({ label: SPINNING_BUTTON, disabled: true });
    expect(orderProgressOf(o)).toBe(orderProgressText(1, 3));
  });

  it('止まった後: 選ばれた席が真鍮になり、札は「{n} 番」とその人。あと何人から抜ける', () => {
    // Given
    const view = inRound(['b', 'c'], ['a', 'c', 'd'], 1);
    // When
    const o = stage(view, 'settled');
    // Then
    expect(o.seats.winners).toEqual([1]);
    expect(o.hubCount).toBe(2);
    expect(o.card).toEqual({ label: turnLabel(2), name: 'C', revealed: true });
    expect(o.turns).toEqual(new Map([['b', 1], ['c', 2]]));
    expect(orderCaptionOf({ view, phase: 'settled', poolCount: 4, order: o })).toBe(turnResultText(2, 'C'));
    expect(orderButtonOf({ order: o, poolCount: 4, operable: true, serverSpinning: false })).toEqual({ label: ORDER_BUTTON, disabled: false });
    expect(orderProgressOf(o)).toBe(orderProgressText(2, 2));
  });

  it('まだの人が 1 人になったら、主ボタンは「最後の 1 人」', () => {
    // Given
    const o = stage(inRound(['b', 'c', 'a'], ['a', 'd'], 0), 'settled');
    // When / Then
    expect(o.left).toBe(1);
    expect(orderButtonOf({ order: o, poolCount: 4, operable: true, serverSpinning: false }).label).toBe(ORDER_LAST_BUTTON);
  });

  it('回が終わったら: 円盤は空で中心は 0、札は最後の人、一言は「最後は」、主ボタンは「次の回を始める」', () => {
    // Given
    const round = inRound(['b', 'c', 'a'], ['a', 'd'], 0);
    const view = { ...round, order: { done: ['b', 'c', 'a', 'd'].map(E), finished: true } };
    // When
    const o = stage(view, 'settled');
    // Then
    expect(o.seats).toEqual({ entries: [], winners: [] });
    expect(o.hubCount).toBe(0);
    expect(o.card).toEqual({ label: turnLabel(4), name: 'D', revealed: true });
    expect(orderCaptionOf({ view, phase: 'settled', poolCount: 4, order: o })).toBe(orderLastText('D'));
    expect(orderButtonOf({ order: o, poolCount: 4, operable: true, serverSpinning: false })).toEqual({ label: ORDER_NEW_ROUND_BUTTON, disabled: false });
    expect(orderButtonOf({ order: o, poolCount: 1, operable: true, serverSpinning: false }).disabled).toBe(true);
    expect(orderProgressOf(o)).toBe(ORDER_ALL_DONE);
  });

  it('切断中は押せない', () => {
    // Given
    const o = stage(base, 'idle');
    // When / Then
    expect(orderButtonOf({ order: o, poolCount: 4, operable: false, serverSpinning: false }).disabled).toBe(true);
  });

  it('回の途中で入った人はまだの人として円盤に入る（回す前の円盤）', () => {
    // Given: 回の途中だが回転が無い（名簿の掃除で残った）
    const view: RouletteView = { ...base, order: { done: [E('b')], finished: false } };
    // When
    const o = stage(view, 'idle');
    // Then
    expect(o.seats.entries.map((e) => e.id)).toEqual(['a', 'c', 'd']);
    expect(o.hubCount).toBe(3);
  });
});

/**
 * @requirements #401 順番に回す §5.3（脇の一覧の印）
 */
describe('順番に回すときの脇の一覧', () => {
  it('番が決まった人に「{n} 番」の印を付け、一周の「選ばれた」は付けない', () => {
    // Given: 一周の記録に a が居る
    const view = { ...base, drawn: ['a'] };
    // When
    const people = peopleOf({ members: MEMBERS, view, selfId: null, phase: 'idle', pool: POOL, turns: new Map([['c', 1]]) });
    // Then
    expect(people.rows.map((r) => [r.id, r.mark, r.turn])).toEqual([
      ['a', null, null],
      ['b', null, null],
      ['c', 'turn', 1],
      ['d', null, null],
    ]);
  });

  it('離席中の印は番より先', () => {
    // Given
    const members = MEMBERS.map((m) => (m.id === 'c' ? { ...m, present: false } : m));
    // When
    const people = peopleOf({ members, view: base, selfId: null, phase: 'idle', pool: POOL, turns: new Map([['c', 1]]) });
    // Then
    expect(people.rows[2]?.mark).toBe('away');
  });
});
