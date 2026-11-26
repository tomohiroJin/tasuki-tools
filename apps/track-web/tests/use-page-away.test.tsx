import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePageAway } from '../src/platform/use-page-away';

/** `document.visibilityState` を差し替えて `visibilitychange` を起こす。 */
function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

let perf = 0;

beforeEach(() => {
  perf = 7000;
  vi.spyOn(performance, 'now').mockImplementation(() => perf);
});

afterEach(() => {
  Reflect.deleteProperty(document, 'visibilityState');
  Reflect.deleteProperty(window, 'documentPictureInPicture');
  vi.restoreAllMocks();
});

/**
 * @requirements #476 FR-27・設計 §4 C1・C1b・C2
 */
describe('usePageAway（非表示だった間を端末だけで覚える）', () => {
  const capture = (position: number, runningId: string | null = 'g-3') => () => ({ position, runningId });

  it('Given 表示中 / When 何も起きない / Then 何も覚えていない', () => {
    const { result } = renderHook(() => usePageAway(capture(5000)));
    expect(result.current.returned).toBeNull();
  });

  it('Given 非表示になった / When 表に戻る / Then 非表示になった位置と区切りの id と戻った時刻を覚える（長さは測らない）', () => {
    let position = 5000;
    const { result } = renderHook(() => usePageAway(() => ({ position, runningId: 'g-3' })));
    act(() => setVisibility('hidden'));
    position = 99_999;
    perf = 9000;
    act(() => setVisibility('visible'));
    expect(result.current.returned).toEqual({ fromMs: 5000, runningId: 'g-3', returnedAt: 9000 });
  });

  it('Given 計測していなかった / When 戻る / Then 区切りの id は null で覚える', () => {
    const { result } = renderHook(() => usePageAway(capture(5000, null)));
    act(() => setVisibility('hidden'));
    act(() => setVisibility('visible'));
    expect(result.current.returned).toMatchObject({ runningId: null });
  });

  it('Given 覚えている / When clear / Then 忘れる', () => {
    const { result } = renderHook(() => usePageAway(capture(5000)));
    act(() => setVisibility('hidden'));
    act(() => setVisibility('visible'));
    act(() => result.current.clear());
    expect(result.current.returned).toBeNull();
  });

  it('Given 判定の前の記録がある / When 短く隠れてすぐ戻る / Then 最初の記録を保つ', () => {
    let position = 5000;
    const { result } = renderHook(() => usePageAway(() => ({ position, runningId: 'g-3' })));
    act(() => setVisibility('hidden'));
    act(() => setVisibility('visible'));
    position = 8000;
    act(() => setVisibility('hidden'));
    act(() => setVisibility('visible'));
    expect(result.current.returned).toMatchObject({ fromMs: 5000 });
  });

  it('Given 重ねて非表示が届く / When 戻る / Then 最初の位置を保つ', () => {
    let position = 5000;
    const { result } = renderHook(() => usePageAway(() => ({ position, runningId: 'g-3' })));
    act(() => setVisibility('hidden'));
    position = 6000;
    act(() => setVisibility('hidden'));
    act(() => setVisibility('visible'));
    expect(result.current.returned).toMatchObject({ fromMs: 5000 });
  });

  it('Given 非表示にならずに visible だけ届く / When 判定する / Then 何も覚えない', () => {
    const { result } = renderHook(() => usePageAway(capture(5000)));
    act(() => setVisibility('visible'));
    expect(result.current.returned).toBeNull();
  });

  it('Given 非表示になる時にミニ表示の窓が開いていた / When 戻る / Then 覚えない', () => {
    Object.defineProperty(window, 'documentPictureInPicture', { configurable: true, value: { window: {} } });
    const { result } = renderHook(() => usePageAway(capture(5000)));
    act(() => setVisibility('hidden'));
    Object.defineProperty(window, 'documentPictureInPicture', { configurable: true, value: { window: null } });
    act(() => setVisibility('visible'));
    expect(result.current.returned).toBeNull();
  });

  it('Given 戻る時にミニ表示の窓が開いている / When 戻る / Then 覚えない', () => {
    const { result } = renderHook(() => usePageAway(capture(5000)));
    act(() => setVisibility('hidden'));
    Object.defineProperty(window, 'documentPictureInPicture', { configurable: true, value: { window: {} } });
    act(() => setVisibility('visible'));
    expect(result.current.returned).toBeNull();
  });

  it('Given ミニ表示に未対応・窓が閉じている / When 戻る / Then 覚える', () => {
    Object.defineProperty(window, 'documentPictureInPicture', { configurable: true, value: {} });
    const { result } = renderHook(() => usePageAway(capture(5000)));
    act(() => setVisibility('hidden'));
    act(() => setVisibility('visible'));
    expect(result.current.returned).not.toBeNull();
  });

  it('Given フック / When 外す / Then 付けた聞き手を同じもので外す', () => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    const { unmount } = renderHook(() => usePageAway(capture(0)));
    const added = add.mock.calls.filter(([type]) => type === 'visibilitychange').map(([, handler]) => handler);
    expect(added).toHaveLength(1);
    unmount();
    expect(remove.mock.calls.filter(([type]) => type === 'visibilitychange').map(([, handler]) => handler)).toEqual(added);
  });

  it('Given 覚える値 / When 戻り値の形を見る / Then 覚えた値と clear だけ（サーバーへ送る口を持たない）', () => {
    const { result } = renderHook(() => usePageAway(capture(5000)));
    expect(Object.keys(result.current).sort()).toEqual(['clear', 'returned']);
  });
});
