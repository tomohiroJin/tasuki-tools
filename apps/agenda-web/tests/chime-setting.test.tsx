/**
 * 時間切れの音の選択（#669 D5）。端末ごとに localStorage へ覚え、読めない値・未知の値は既定（時打ち）に戻す。
 *
 * @requirements #669 D5
 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CHIME_SETTING_KEY, useSoundSetting } from '../src/hooks/use-sound-setting';

const preloadChime = vi.hoisted(() => vi.fn());

vi.mock('../src/platform/sound', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/platform/sound')>()),
  preloadChime,
}));

beforeEach(() => {
  localStorage.clear();
  preloadChime.mockClear();
  vi.restoreAllMocks();
});

describe('時間切れの音の選択', () => {
  it('Given 何も覚えていない / When 読む / Then 既定の時打ち', () => {
    const { result } = renderHook(() => useSoundSetting());
    expect(result.current.chimeId).toBe('strike');
  });

  it('Given 音を選ぶ / When setChimeId / Then 覚えて先読みする・開き直しても同じ', () => {
    const { result } = renderHook(() => useSoundSetting());
    act(() => result.current.setChimeId('bell'));
    expect(result.current.chimeId).toBe('bell');
    expect(localStorage.getItem(CHIME_SETTING_KEY)).toBe('bell');
    expect(preloadChime).toHaveBeenCalledWith('bell');
    const again = renderHook(() => useSoundSetting());
    expect(again.result.current.chimeId).toBe('bell');
  });

  it('Given 未知の値を覚えている / When 読む / Then 既定の時打ち', () => {
    localStorage.setItem(CHIME_SETTING_KEY, 'gong');
    const { result } = renderHook(() => useSoundSetting());
    expect(result.current.chimeId).toBe('strike');
  });

  it('Given localStorage が読めない・書けない / When 読んで選ぶ / Then 既定で始まり、画面の選択は効く', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const { result } = renderHook(() => useSoundSetting());
    expect(result.current.chimeId).toBe('strike');
    act(() => result.current.setChimeId('melody'));
    expect(result.current.chimeId).toBe('melody');
  });

  it('Given 音を選ぶ / When 切り替えの状態を見る / Then 音あり・音なしは変わらない', () => {
    const { result } = renderHook(() => useSoundSetting());
    act(() => result.current.setChimeId('bell'));
    expect(result.current.soundState).toBe('off');
  });
});
