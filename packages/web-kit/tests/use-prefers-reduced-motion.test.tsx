/**
 * 動きを減らす設定か（#472・#463-C3。agenda・checkin・roulette の写しを 1 つにした）。
 * 設定は実行中にも変わるので、変化を購読し、外れるときに購読を解く。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { usePrefersReducedMotion } from '../src/room/index.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubMedia(initial: boolean) {
  let listener: (() => void) | null = null;
  const media = {
    matches: initial,
    addEventListener: vi.fn((_: string, fn: () => void) => {
      listener = fn;
    }),
    removeEventListener: vi.fn(),
  };
  const matchMedia = vi.fn(() => media);
  vi.stubGlobal('matchMedia', matchMedia);
  return { media, matchMedia, fire: (matches: boolean) => { media.matches = matches; listener?.(); } };
}

describe('usePrefersReducedMotion', () => {
  it('Given 減らす設定 / When 描く / Then true で、問い合わせは prefers-reduced-motion: reduce', () => {
    const { matchMedia } = stubMedia(true);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
  });

  it('Given 減らさない設定 / When 実行中に変わる / Then 追従し、外れるとき購読を解く', () => {
    const { media, fire } = stubMedia(false);
    const { result, unmount } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
    act(() => fire(true));
    expect(result.current).toBe(true);
    unmount();
    expect(media.removeEventListener).toHaveBeenCalledTimes(1);
  });

  it('Given matchMedia が無い環境 / When 描く / Then false で落ちない', () => {
    vi.stubGlobal('matchMedia', undefined);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
  });
});
