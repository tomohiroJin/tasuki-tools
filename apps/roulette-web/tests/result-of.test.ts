import { describe, expect, it } from 'vitest';
import type { Entry, RouletteView } from '@tasuki/roulette-core';
import { orderStageOf, resultOf, revealedCountOf, stageViewOf, type Phase } from '../src/roulette-view';

const E = (id: string): Entry => ({ id, name: id.toUpperCase() });
const POOL = ['a', 'b', 'c', 'd'].map(E);

const IDLE: RouletteView = { pickCount: 1, mode: 'once', order: null, excluded: [], guests: [], drawn: [], spin: null };

function onceSpin(over: Partial<NonNullable<RouletteView['spin']>> = {}, view: Partial<RouletteView> = {}): RouletteView {
  return {
    ...IDLE,
    ...view,
    spin: {
      seq: 7,
      wheel: POOL,
      winnerIndex: 2,
      settle: 0.5,
      picks: [
        { index: 2, settle: 0.5 },
        { index: 0, settle: 0.3 },
      ],
      spunBy: 'A',
      durationMs: 6000,
      elapsedMs: 0,
      ...over,
    },
    pickCount: 2,
  };
}

const resultFor = (view: RouletteView, phase: Phase, revealed: number) => resultOf({ view, phase, revealed, order: null });

/**
 * @requirements #676（結果のコピーは、結果の札が出ているときの値から作る）
 */
describe('resultOf（1 回で決める・押して止める）', () => {
  it('Given 回していない / Then null', () => {
    expect(resultFor(IDLE, 'idle', 0)).toBeNull();
  });

  it('Given 回っている間 / Then null（結果がコピーで先に分からない）', () => {
    expect(resultFor(onceSpin(), 'spinning', 0)).toBeNull();
    // 1 人目だけ止まっていても、局面が止まるまでは出さない
    expect(resultFor(onceSpin(), 'spinning', 1)).toBeNull();
  });

  it('Given 止まった 2 人 / Then 止まった順に全員（1 人にしない）', () => {
    expect(resultFor(onceSpin(), 'settled', 2)).toEqual({ mode: 'once', names: ['C', 'A'], seq: 7 });
  });

  it('Given 止まった 1 人（picks の無い古い形） / Then 1 人', () => {
    const view = onceSpin({ picks: undefined, winnerIndex: 1 }, { pickCount: 1 });
    expect(resultFor({ ...view, pickCount: 1 }, 'settled', 1)).toEqual({ mode: 'once', names: ['B'], seq: 7 });
  });

  it('Given 押して止める / Then 決め方は press', () => {
    const view = onceSpin({ picks: [{ index: 3, settle: 0.5 }], press: { p0: 0, rate: 1, stop: null } }, { mode: 'press' });
    expect(resultFor(view, 'settled', 1)).toEqual({ mode: 'press', names: ['D'], seq: 7 });
  });

  it('Given 止まった局面でも決まった人が 0 人 / Then null', () => {
    expect(resultFor(onceSpin(), 'settled', 0)).toBeNull();
  });

  it('Given 動きを減らす設定の受け取り直後 / Then 画面の revealedCountOf と同じ人数が出る', () => {
    const view = onceSpin();
    const revealed = revealedCountOf({ view, receivedAt: 0, nowMs: 0, reducedMotion: true });
    expect(resultFor(view, 'settled', revealed)?.names).toEqual(['C', 'A']);
  });
});

describe('resultOf（順番に回す）', () => {
  const orderBase: RouletteView = { ...IDLE, mode: 'order' };
  function inRound(doneIds: string[], wheelIds: string[], pickIndex: number): RouletteView {
    return {
      ...orderBase,
      order: { done: doneIds.map(E), finished: false },
      spin: {
        seq: doneIds.length,
        wheel: wheelIds.map(E),
        winnerIndex: pickIndex,
        settle: 0.5,
        picks: [{ index: pickIndex, settle: 0.5 }],
        turn: doneIds.length,
        spunBy: 'A',
        durationMs: 4000,
        elapsedMs: 0,
      },
    };
  }
  const resultIn = (view: RouletteView, phase: Phase) => {
    const stage = stageViewOf(view);
    const order = orderStageOf({ view: stage, pool: POOL, phase, revealed: phase === 'settled' ? 1 : 0 });
    return resultOf({ view: stage, phase, revealed: phase === 'settled' ? 1 : 0, order });
  };

  it('Given 回していない / Then null', () => {
    expect(resultIn(orderBase, 'idle')).toBeNull();
  });

  it('Given 2 番を回している間 / Then null（札が伏せてある）', () => {
    expect(resultIn(inRound(['c', 'a'], ['b', 'd'], 0), 'spinning')).toBeNull();
  });

  it('Given 2 番が止まった / Then 1 番から並べる（逆にしない）', () => {
    expect(resultIn(inRound(['c', 'a'], ['a', 'b', 'd'], 0), 'settled')).toEqual({ mode: 'order', names: ['C', 'A'], seq: 2 });
  });

  it('Given 回が終わった / Then 最後の人まで全員', () => {
    const view: RouletteView = { ...orderBase, order: { done: ['c', 'a', 'b'].map(E), finished: true }, spin: null };
    expect(resultIn(view, 'idle')).toEqual({ mode: 'order', names: ['C', 'A', 'B'], seq: 3 });
  });

  it('Given 決め方を 1 回で決めるへ変えた直後（順番の回転が残る） / Then 順番の結果は出ない', () => {
    const view: RouletteView = { ...inRound(['c'], ['a', 'b', 'd'], 0), mode: 'once' };
    const stage = stageViewOf(view);
    expect(resultOf({ view: stage, phase: 'idle', revealed: 0, order: null })).toBeNull();
  });
});
