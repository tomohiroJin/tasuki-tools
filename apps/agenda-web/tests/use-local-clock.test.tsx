import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgendaView } from '@tasuki/agenda-core';
import { useLocalClock } from '../src/hooks/use-local-clock';
import { runningAgenda } from './support/scripted-web-socket';

/** 偽の `performance.now()`。rAF は 16ms ごとに呼ぶ偽の実装で、時計とは別に進める。 */
let nowMs = 0;
let rafCallbacks = new Map<number, FrameRequestCallback>();
let rafId = 0;

beforeEach(() => {
  nowMs = 10_000;
  rafCallbacks = new Map();
  rafId = 0;
  vi.useFakeTimers();
  vi.spyOn(performance, 'now').mockImplementation(() => nowMs);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    rafId += 1;
    rafCallbacks.set(rafId, cb);
    return rafId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => rafCallbacks.delete(id));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** 保留中の rAF を 1 巡させる。 */
function frame(): void {
  const pending = [...rafCallbacks.entries()];
  rafCallbacks.clear();
  for (const [, cb] of pending) cb(nowMs);
}

const view = (over: Partial<AgendaView>): AgendaView => ({ ...(runningAgenda(1000, 3000) as AgendaView), ...over });

/**
 * @requirements #429 spec §6.4
 */
describe('手元の時計', () => {
  it('Given 状態が無い / When 呼ぶ / Then null を返し、描き直しの予約もしない', () => {
    const { result } = renderHook(() => useLocalClock(null, 0, false));
    expect(result.current).toBeNull();
    expect(rafCallbacks.size).toBe(0);
  });

  it('Given 進行中の状態 / When 5000ms 進む / Then ステップの計時と実時間の経過が 5000 増える', () => {
    const { result } = renderHook(() => useLocalClock(view({}), 10_000, false));
    expect(result.current?.stepTimerMs).toBe(1000);
    nowMs += 5000;
    act(() => frame());
    expect(result.current?.stepTimerMs).toBe(6000);
    expect(result.current?.runElapsedMs).toBe(8000);
  });

  it('Given 一時停止中の状態 / When 5000ms 進む / Then ステップの計時は増えず、実時間の経過だけ増える', () => {
    const paused = view({ phase: 'paused' });
    const { result } = renderHook(() => useLocalClock(paused, 10_000, false));
    nowMs += 5000;
    act(() => frame());
    expect(result.current?.stepTimerMs).toBe(1000);
    expect(result.current?.runElapsedMs).toBe(8000);
  });

  it('Given 進行中の状態 / When 同じ秒の中で rAF が回る / Then 描き直さず、秒の境目を越えた rAF で描き直す', () => {
    // 盤の数字は秒で変わる。毎フレーム（60fps）画面全体を描き直さない
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useLocalClock(view({}), 10_000, false);
    });
    const before = renders;
    nowMs += 500;
    act(() => frame());
    nowMs += 499;
    act(() => frame());
    expect(renders).toBe(before);
    expect(rafCallbacks.size).toBe(1);
    nowMs += 1;
    act(() => frame());
    expect(renders).toBe(before + 1);
    expect(result.current?.stepTimerMs).toBe(2000);
  });

  it('Given 一時停止中の状態 / When 実時間の経過が秒の境目を越える / Then 描き直す（区切りの計時は止まっていても所要と経過は進む）', () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useLocalClock(view({ phase: 'paused' }), 10_000, false);
    });
    const before = renders;
    nowMs += 1000;
    act(() => frame());
    expect(renders).toBe(before + 1);
    expect(result.current?.runElapsedMs).toBe(4000);
  });

  it('Given 受け取った時刻が過去 / When 描く / Then 受け取ってからの経過ぶん進める', () => {
    const { result } = renderHook(() => useLocalClock(view({}), 7000, false));
    expect(result.current?.stepTimerMs).toBe(4000);
  });

  it('Given 動きを減らす設定 / When 時間が進む / Then rAF は使わず 1 秒ごとに描き直す', () => {
    const { result } = renderHook(() => useLocalClock(view({}), 10_000, true));
    expect(rafCallbacks.size).toBe(0);
    nowMs += 1000;
    act(() => vi.advanceTimersByTime(999));
    expect(result.current?.stepTimerMs).toBe(1000);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current?.stepTimerMs).toBe(2000);
  });

  it('Given rAF で描いている / When 動きを減らす設定に変わる / Then rAF を止めて 1 秒の間隔に切り替える', () => {
    const { rerender } = renderHook(({ reduced }) => useLocalClock(view({}), 10_000, reduced), {
      initialProps: { reduced: false },
    });
    expect(rafCallbacks.size).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
    rerender({ reduced: true });
    expect(rafCallbacks.size).toBe(0);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('Given 動きを減らさない設定 / When 時間が進む / Then 1 秒の間隔の描き直しは使わない', () => {
    renderHook(() => useLocalClock(view({}), 10_000, false));
    expect(vi.getTimerCount()).toBe(0);
    expect(rafCallbacks.size).toBe(1);
  });

  it('Given 描き直している / When 外す / Then rAF も間隔も止まる', () => {
    const raf = renderHook(() => useLocalClock(view({}), 10_000, false));
    raf.unmount();
    expect(rafCallbacks.size).toBe(0);
    const slow = renderHook(() => useLocalClock(view({}), 10_000, true));
    slow.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('Given 終了した状態 / When 時間が進む / Then 値は変わらない', () => {
    const finished = view({ phase: 'finished' });
    const { result } = renderHook(() => useLocalClock(finished, 10_000, false));
    nowMs += 5000;
    act(() => frame());
    expect(result.current).toEqual(finished);
  });
});
