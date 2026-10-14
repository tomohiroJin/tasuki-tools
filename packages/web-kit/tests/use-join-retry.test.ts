/**
 * 参加のやり直しのフック（#369 Task 4）。
 *
 * 混雑で参加を拒まれた（`JOIN_RATE_LIMITED`）ときに、待ってから送り直す。待つ時間と回数の上限は
 * `@tasuki/sync-client` の `joinRetryDelayMs` が決め、このフックはタイマーと回数と知らせを持つ。
 * お題・ルーレットの同期フックが写しで持っていたものを 1 つにした（各フックのテストが配線を見る）。
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { joinRetryDelayMs } from '@tasuki/sync-client';
import { useJoinRetry } from '../src/sync/use-join-retry.js';

const TEXTS = { waiting: '待っています', exhausted: '諦めました' } as const;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function setup() {
  const resend = vi.fn();
  const hook = renderHook(() => useJoinRetry(TEXTS));
  return { resend, hook };
}

describe('useJoinRetry', () => {
  it('Given 初め / When 何もしない / Then 知らせは無い', () => {
    expect(setup().hook.result.current.notice).toBeNull();
  });

  it('Given 拒まれた / When 待ち時間が過ぎる / Then 待つ間は送らず待っていると伝え、過ぎたら 1 度だけ送り直す', () => {
    // Given: 待ち時間の揺らぎ（jitter）を真ん中に固定する
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const { resend, hook } = setup();
    // When
    act(() => hook.result.current.rateLimited(resend));
    // Then
    expect(hook.result.current.notice).toBe(TEXTS.waiting);
    act(() => vi.advanceTimersByTime(joinRetryDelayMs(1, () => 0.5)! - 1));
    expect(resend).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(resend).toHaveBeenCalledTimes(1);
  });

  it('Given 拒まれ続けた / When 試行を使い切る / Then 諦めたと伝え、それ以上は送らない', () => {
    // Given
    const { resend, hook } = setup();
    for (let attempt = 1; joinRetryDelayMs(attempt) !== null; attempt += 1) {
      act(() => hook.result.current.rateLimited(resend));
      act(() => vi.advanceTimersByTime(60_000));
    }
    const sent = resend.mock.calls.length;
    // When
    act(() => hook.result.current.rateLimited(resend));
    act(() => vi.advanceTimersByTime(60_000));
    // Then
    expect(hook.result.current.notice).toBe(TEXTS.exhausted);
    expect(resend.mock.calls.length).toBe(sent);
  });

  it('Given 待っている / When 取り消す / Then 送り直さない（知らせはそのまま）', () => {
    // Given
    const { resend, hook } = setup();
    act(() => hook.result.current.rateLimited(resend));
    // When
    act(() => hook.result.current.cancel());
    act(() => vi.advanceTimersByTime(60_000));
    // Then
    expect(resend).not.toHaveBeenCalled();
    expect(hook.result.current.notice).toBe(TEXTS.waiting);
  });

  it('Given 待っている間にもう一度拒まれた / When 待ち時間が過ぎる / Then 前の予約は捨て、送り直しは 1 度だけ', () => {
    // Given
    const { resend, hook } = setup();
    act(() => hook.result.current.rateLimited(resend));
    // When
    act(() => hook.result.current.rateLimited(resend));
    act(() => vi.advanceTimersByTime(60_000));
    // Then
    expect(resend).toHaveBeenCalledTimes(1);
  });

  it('Given 試行を使い切った / When 戻す / Then 知らせを下ろし、次に拒まれたら 1 回目として待つ', () => {
    // Given
    const { resend, hook } = setup();
    for (let attempt = 1; joinRetryDelayMs(attempt) !== null; attempt += 1) {
      act(() => hook.result.current.rateLimited(resend));
      act(() => vi.advanceTimersByTime(60_000));
    }
    act(() => hook.result.current.rateLimited(resend));
    // When
    act(() => hook.result.current.reset());
    // Then
    expect(hook.result.current.notice).toBeNull();
    act(() => hook.result.current.rateLimited(resend));
    expect(hook.result.current.notice).toBe(TEXTS.waiting);
  });

  it('Given 再描画 / When 関数を読み直す / Then 同じ関数のまま（effect の依存に入れても張り直さない）', () => {
    // Given
    const { resend, hook } = setup();
    const first = hook.result.current;
    // When: 知らせが変わって再描画される
    act(() => first.rateLimited(resend));
    // Then
    expect(hook.result.current.rateLimited).toBe(first.rateLimited);
    expect(hook.result.current.cancel).toBe(first.cancel);
    expect(hook.result.current.reset).toBe(first.reset);
  });

  it('Given 文言を渡さない（玄関はサーバーの文を見せる） / When 拒まれる・使い切る / Then 知らせは無いまま、送り直しは同じ', () => {
    // Given
    const resend = vi.fn();
    const hook = renderHook(() => useJoinRetry(null));
    // When
    act(() => hook.result.current.rateLimited(resend));
    act(() => vi.advanceTimersByTime(60_000));
    // Then
    expect(hook.result.current.notice).toBeNull();
    expect(resend).toHaveBeenCalledTimes(1);
    for (let attempt = 2; joinRetryDelayMs(attempt) !== null; attempt += 1) {
      act(() => hook.result.current.rateLimited(resend));
      act(() => vi.advanceTimersByTime(60_000));
    }
    act(() => hook.result.current.rateLimited(resend));
    expect(hook.result.current.notice).toBeNull();
  });

  it('Given 拒まれた / When 待ちを予約する・使い切る / Then 予約したかを返す（知らせを持たない呼び出し側が出し分ける）', () => {
    // Given
    const resend = vi.fn();
    const hook = renderHook(() => useJoinRetry(null));
    const results: boolean[] = [];
    // When
    for (let attempt = 1; joinRetryDelayMs(attempt) !== null; attempt += 1) {
      act(() => {
        results.push(hook.result.current.rateLimited(resend));
      });
    }
    act(() => {
      results.push(hook.result.current.rateLimited(resend));
    });
    // Then
    expect(results.slice(0, -1).every((r) => r)).toBe(true);
    expect(results.at(-1)).toBe(false);
  });
});
