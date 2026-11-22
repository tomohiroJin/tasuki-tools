import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTrackClock } from '../src/hooks/use-track-clock';
import { useUndoSeconds } from '../src/hooks/use-undo-seconds';
import { MIN, runningTrack, seg, stoppedTrack, trackView } from './support/track-states';

/** 偽の `performance.now()`。rAF は呼ばれた分を溜め、`frame()` で 1 巡させる。 */
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

/** Build を位置 0 から計測中（閉じた区切りは無いので、位相は経過の 0 だけ） */
const RUNNING = trackView({ nowMs: 1000, segments: [seg('g-1', 'work', 'Build', 0, null)] });

/**
 * @requirements #476 設計 §4.1・§7 非機能（描き直しは表示する秒が変わるときだけ）
 */
describe('手元の時計', () => {
  it('Given 計測中の写し / When 5000ms 進む / Then 「いま」の位置が 5000 進む', () => {
    const { result } = renderHook(() => useTrackClock(RUNNING, 10_000, false));
    expect(result.current.nowMs).toBe(1000);
    nowMs += 5000;
    act(() => frame());
    expect(result.current.nowMs).toBe(6000);
  });

  it('Given 受け取った時刻が過去 / When 描く / Then 受け取ってからの経過ぶん進め、整数の位置を返す', () => {
    nowMs = 10_000.75;
    const { result } = renderHook(() => useTrackClock(RUNNING, 7000, false));
    expect(result.current.nowMs).toBe(4000);
  });

  it('Given 計測中の写し / When 同じ秒の中で rAF が回る / Then 描き直さず、秒の境目を越えた rAF で描き直す', () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useTrackClock(RUNNING, 10_000, false);
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
    expect(result.current.nowMs).toBe(2000);
  });

  it('Given 閉じた区切りの長さが秒の端数（300ms）を持つ / When 合計の秒だけが変わる瞬間を越える / Then 描き直す', () => {
    // 同じ名前の閉じた分が 1300ms。経過 700ms で合計が 2 秒になる
    const view = trackView({ nowMs: 2000, segments: [seg('g-1', 'work', 'Build', 0, 1300), seg('g-2', 'work', 'Build', 2000, null)] });
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useTrackClock(view, 10_000, false);
    });
    const before = renders;
    nowMs += 699;
    act(() => frame());
    expect(renders).toBe(before);
    nowMs += 1;
    act(() => frame());
    expect(renders).toBe(before + 1);
  });

  it('Given 止まっている写し / When 呼ぶ / Then 描き直しの予約を持たない（rAF も間隔も）', () => {
    renderHook(() => useTrackClock(stoppedTrack(), 10_000, false));
    renderHook(() => useTrackClock(stoppedTrack(), 10_000, true));
    expect(rafCallbacks.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('Given 止まっている写し / When 時間が経ってから押した瞬間の位置を求める / Then 描いた値は古いままでも、その時点の位置が返る', () => {
    const { result } = renderHook(() => useTrackClock(stoppedTrack(60 * MIN), 10_000, false));
    nowMs += 90_000;
    expect(result.current.nowMs).toBe(60 * MIN);
    expect(result.current.getNow()).toBe(60 * MIN + 90_000);
  });

  it('Given 動きを減らす設定 / When 時間が進む / Then rAF は使わず 1 秒ごとに描き直す', () => {
    const { result } = renderHook(() => useTrackClock(RUNNING, 10_000, true));
    expect(rafCallbacks.size).toBe(0);
    nowMs += 1000;
    act(() => vi.advanceTimersByTime(999));
    expect(result.current.nowMs).toBe(1000);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.nowMs).toBe(2000);
  });

  it('Given 動きを減らさない設定 / When 時間が進む / Then 1 秒の間隔の描き直しは使わない', () => {
    renderHook(() => useTrackClock(RUNNING, 10_000, false));
    expect(vi.getTimerCount()).toBe(0);
    expect(rafCallbacks.size).toBe(1);
  });

  it('Given 計測中 / When 止まった写しに替わる / Then 予約を取り消す', () => {
    const { rerender } = renderHook(({ view }) => useTrackClock(view, 10_000, false), { initialProps: { view: runningTrack() } });
    expect(rafCallbacks.size).toBe(1);
    rerender({ view: stoppedTrack() });
    expect(rafCallbacks.size).toBe(0);
  });

  it('Given 描き直している / When 外す / Then rAF も間隔も止まる', () => {
    const raf = renderHook(() => useTrackClock(RUNNING, 10_000, false));
    raf.unmount();
    expect(rafCallbacks.size).toBe(0);
    const slow = renderHook(() => useTrackClock(RUNNING, 10_000, true));
    slow.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

/**
 * @requirements #476 FR-21（取り消しは 10 秒間。残りは受け取ってからの経過を引いて数え、0 で下ろす）
 */
describe('取り消しの残り秒', () => {
  const undo = (remainingMs: number) => ({ rev: 4, kind: 'stop' as const, remainingMs });

  /** 偽のタイマーと偽の `performance.now()` を一緒に進める。 */
  const advance = (ms: number): void => {
    nowMs += ms;
    act(() => vi.advanceTimersByTime(ms));
  };

  it('Given 取り消しが無い / When 呼ぶ / Then null で、予約も持たない', () => {
    const { result } = renderHook(() => useUndoSeconds(null, 10_000));
    expect(result.current).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('Given 残り 10 秒 / When 1 秒ずつ進む / Then 残りが 1 ずつ減り、0 で下りて予約も消える', () => {
    const slot = undo(10_000);
    const { result } = renderHook(() => useUndoSeconds(slot, 10_000));
    expect(result.current).toBe(10);
    advance(1001);
    expect(result.current).toBe(9);
    advance(8000);
    expect(result.current).toBe(1);
    advance(1000);
    expect(result.current).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('Given 受け取ってから時間が経っている / When 描く / Then 経過を引いた残りを出す', () => {
    const slot = undo(7200);
    const { result } = renderHook(() => useUndoSeconds(slot, 6000));
    // 受け取ってから 4000ms。残りは 3200ms → 4 秒
    expect(result.current).toBe(4);
  });

  it('Given 数えている / When 新しい写しで残りが届く / Then 新しい組（残りと受け取った時刻）で数え直す', () => {
    const { result, rerender } = renderHook(({ slot, at }) => useUndoSeconds(slot, at), { initialProps: { slot: undo(10_000), at: 10_000 } });
    advance(3000);
    rerender({ slot: undo(10_000), at: nowMs });
    expect(result.current).toBe(10);
  });

  it('Given 数えている / When 外す / Then 予約を消す', () => {
    const slot = undo(10_000);
    const { unmount } = renderHook(() => useUndoSeconds(slot, 10_000));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
