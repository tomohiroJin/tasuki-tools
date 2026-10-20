/**
 * 時打ちの音（#429 spec §4.7）。解錠されていない（`running` でない）AudioContext には予約しない
 * （予約すると resume を待ってから鳴り、次に画面を触った瞬間に遅れて時打ちが鳴る）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let state: AudioContextState = 'suspended';
const createOscillator = vi.fn();

class FakeAudioContext {
  get state(): AudioContextState {
    return state;
  }
  currentTime = 0;
  destination = {};
  resume = vi.fn(() => Promise.resolve());
  createOscillator = () => {
    createOscillator();
    return { type: 'sine', frequency: { value: 0 }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
  };
  createGain = () => ({ gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() });
}

beforeEach(() => {
  vi.resetModules();
  createOscillator.mockClear();
  vi.stubGlobal('AudioContext', FakeAudioContext);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * @requirements #429 spec §4.7
 */
describe('時打ちの音', () => {
  it('Given 解錠されていない / When playStrike / Then 予約しない', async () => {
    state = 'suspended';
    const { playStrike } = await import('../src/platform/sound');
    playStrike();
    await Promise.resolve();
    expect(createOscillator).not.toHaveBeenCalled();
  });

  it('Given 解錠済み（running） / When playStrike / Then 2 打を予約する', async () => {
    state = 'running';
    const { playStrike } = await import('../src/platform/sound');
    playStrike();
    await Promise.resolve();
    expect(createOscillator).toHaveBeenCalledTimes(2);
  });
});

/**
 * 解錠の状態を画面へ知らせる（最終レビュー I-2）。覚えた「音あり」で開き直した端末は解錠されていないので、
 * 画面は解錠の状態を読んで「音を有効に」と「音あり」を出し分ける。
 *
 * @requirements #429 spec §4.7
 */
describe('解錠の状態', () => {
  it('Given suspended / When 解錠する / Then 解錠済みになり、購読者に知らせる', async () => {
    state = 'suspended';
    const { isAudioUnlocked, subscribeAudioState, unlockAudio } = await import('../src/platform/sound');
    const listener = vi.fn();
    subscribeAudioState(listener);
    expect(isAudioUnlocked()).toBe(false);
    unlockAudio();
    state = 'running';
    await Promise.resolve();
    await Promise.resolve();
    expect(isAudioUnlocked()).toBe(true);
    expect(listener).toHaveBeenCalled();
  });
});
