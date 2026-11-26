import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AWAY_PROMPT_MIN_MS } from '../src/limits';
import { usePageAway } from '../src/platform/use-page-away';

/** `document.visibilityState` を差し替えて `visibilitychange` を起こす。 */
function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

let wall = 0;

beforeEach(() => {
  wall = 1_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => wall);
});

afterEach(() => {
  Reflect.deleteProperty(document, 'visibilityState');
  vi.restoreAllMocks();
});

/**
 * @requirements #476 FR-27・設計 §4 C1・C2
 */
describe('usePageAway（非表示だった間を端末だけで覚える）', () => {
  it('Given 表示中 / When 何も起きない / Then 何も覚えていない', () => {
    const { result } = renderHook(() => usePageAway(() => 5000));
    expect(result.current.returned).toBeNull();
  });

  it('Given 非表示になった / When 10 分たって表に戻る / Then 非表示になった位置と離れた時間を覚える', () => {
    let position = 5000;
    const { result } = renderHook(() => usePageAway(() => position));
    act(() => setVisibility('hidden'));
    position = 99_999;
    wall += AWAY_PROMPT_MIN_MS;
    act(() => setVisibility('visible'));
    expect(result.current.returned).toEqual({ fromMs: 5000, awayMs: AWAY_PROMPT_MIN_MS });
  });

  it('Given 非表示になった / When 10 分に 1ms 足りず戻る / Then 覚えない', () => {
    const { result } = renderHook(() => usePageAway(() => 5000));
    act(() => setVisibility('hidden'));
    wall += AWAY_PROMPT_MIN_MS - 1;
    act(() => setVisibility('visible'));
    expect(result.current.returned).toBeNull();
  });

  it('Given 表に戻って覚えている / When clear / Then 忘れる', () => {
    const { result } = renderHook(() => usePageAway(() => 5000));
    act(() => setVisibility('hidden'));
    wall += AWAY_PROMPT_MIN_MS;
    act(() => setVisibility('visible'));
    act(() => result.current.clear());
    expect(result.current.returned).toBeNull();
  });

  it('Given 問いかけが残っている / When 短く隠れてすぐ戻る / Then 残っている問いかけを消さない', () => {
    const { result } = renderHook(() => usePageAway(() => 5000));
    act(() => setVisibility('hidden'));
    wall += AWAY_PROMPT_MIN_MS;
    act(() => setVisibility('visible'));
    act(() => setVisibility('hidden'));
    wall += 1000;
    act(() => setVisibility('visible'));
    expect(result.current.returned).toEqual({ fromMs: 5000, awayMs: AWAY_PROMPT_MIN_MS });
  });

  it('Given 非表示にならずに visible だけ届く / When 判定する / Then 何も覚えない', () => {
    const { result } = renderHook(() => usePageAway(() => 5000));
    act(() => setVisibility('visible'));
    expect(result.current.returned).toBeNull();
  });

  it('Given フック / When 外す / Then 付けた聞き手を同じもので外す', () => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    const { unmount } = renderHook(() => usePageAway(() => 0));
    const added = add.mock.calls.filter(([type]) => type === 'visibilitychange').map(([, handler]) => handler);
    expect(added).toHaveLength(1);
    unmount();
    expect(remove.mock.calls.filter(([type]) => type === 'visibilitychange').map(([, handler]) => handler)).toEqual(added);
  });

  it('Given 状態にもサーバーへの送信にも載せない / When 覚える / Then 覚えた値は端末の値だけ（戻り値の形）', () => {
    const { result } = renderHook(() => usePageAway(() => 5000));
    expect(Object.keys(result.current).sort()).toEqual(['clear', 'returned']);
  });
});
