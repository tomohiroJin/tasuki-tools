/**
 * 時間切れの音（#429 spec §4.7・#669）。解錠されていない（`running` でない）AudioContext には予約しない
 * （予約すると resume を待ってから鳴り、次に画面を触った瞬間に遅れて時打ちが鳴る）。
 * ファイルの音は共有の AudioContext で鳴らし、読めていない・読めなかったときは時打ちで代える（D8）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let state: AudioContextState = 'suspended';
const createOscillator = vi.fn();
const bufferStart = vi.fn();
const decodeAudioData = vi.fn();
const fetchMock = vi.fn();
let contextCount = 0;

class FakeAudioContext {
  constructor() {
    contextCount += 1;
  }
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
  createGain = () => ({ gain: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() });
  createBufferSource = () => ({ buffer: null as unknown, connect: vi.fn(), start: bufferStart });
  decodeAudioData = decodeAudioData;
}

/** 非同期の連鎖（fetch → arrayBuffer → decode → 鳴らす）を流し切る */
const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

beforeEach(() => {
  vi.resetModules();
  createOscillator.mockClear();
  bufferStart.mockClear();
  decodeAudioData.mockReset();
  decodeAudioData.mockResolvedValue({ fake: 'buffer' });
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) });
  contextCount = 0;
  state = 'suspended';
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * @requirements #429 spec §4.7
 */
describe('時打ちの音', () => {
  it('Given 解錠されていない / When playChime(strike) / Then 予約しない', async () => {
    state = 'suspended';
    const { playChime } = await import('../src/platform/sound');
    playChime('strike');
    await Promise.resolve();
    expect(createOscillator).not.toHaveBeenCalled();
  });

  it('Given 解錠済み（running） / When playChime(strike) / Then 2 打を予約する', async () => {
    state = 'running';
    const { playChime } = await import('../src/platform/sound');
    playChime('strike');
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

/**
 * @requirements #669 D1（音の一覧）
 */
describe('音の一覧', () => {
  it('Given CHIMES / When 並びを見る / Then 時打ちが先頭の 11 種で、既定は時打ち', async () => {
    const { CHIMES, DEFAULT_CHIME_ID } = await import('../src/platform/sound');
    expect(CHIMES.map((c) => c.id)).toEqual([
      'strike',
      'department',
      'melody',
      'sustained',
      'bell',
      'chime-up',
      'chime-down',
      'voice-male',
      'voice-female',
      'voice-nise',
      'voice-mai',
    ]);
    expect(CHIMES[0]?.label).toBe('時打ち');
    expect(DEFAULT_CHIME_ID).toBe('strike');
  });

  it('Given 値 / When isChimeId / Then 一覧の id だけ true', async () => {
    const { isChimeId } = await import('../src/platform/sound');
    expect(isChimeId('bell')).toBe(true);
    expect(isChimeId('nope')).toBe(false);
    expect(isChimeId(null)).toBe(false);
    expect(isChimeId(3)).toBe(false);
  });
});

/**
 * @requirements #669 D8（ファイルの音も共有の AudioContext で鳴らす）
 */
describe('ファイルの音', () => {
  it('Given 解錠前 / When playChime(bell) / Then 何も鳴らさない', async () => {
    state = 'suspended';
    const { playChime, preloadChime, unlockAudio } = await import('../src/platform/sound');
    unlockAudio();
    preloadChime('bell');
    await flush();
    playChime('bell');
    await flush();
    expect(bufferStart).not.toHaveBeenCalled();
    expect(createOscillator).not.toHaveBeenCalled();
  });

  it('Given デコード済み / When playChime(bell) / Then バッファを鳴らす（時打ちは鳴らさない）', async () => {
    state = 'running';
    const { playChime, preloadChime, unlockAudio } = await import('../src/platform/sound');
    unlockAudio();
    preloadChime('bell');
    await flush();
    playChime('bell');
    await flush();
    expect(bufferStart).toHaveBeenCalledTimes(1);
    expect(createOscillator).not.toHaveBeenCalled();
  });

  it('Given 未読 / When playChime(bell) / Then 時打ちで代える', async () => {
    state = 'running';
    const { playChime, unlockAudio } = await import('../src/platform/sound');
    unlockAudio();
    playChime('bell');
    await flush();
    expect(bufferStart).not.toHaveBeenCalled();
    expect(createOscillator).toHaveBeenCalledTimes(2);
  });

  it('Given 読み込みが失敗した / When playChime(bell) / Then 時打ちで代える', async () => {
    state = 'running';
    fetchMock.mockRejectedValue(new Error('network'));
    const { playChime, preloadChime, unlockAudio } = await import('../src/platform/sound');
    unlockAudio();
    preloadChime('bell');
    await flush();
    playChime('bell');
    await flush();
    expect(bufferStart).not.toHaveBeenCalled();
    expect(createOscillator).toHaveBeenCalledTimes(2);
  });

  it('Given デコードが失敗した / When playChime(bell) / Then 時打ちで代える', async () => {
    state = 'running';
    decodeAudioData.mockRejectedValue(new Error('bad'));
    const { playChime, preloadChime, unlockAudio } = await import('../src/platform/sound');
    unlockAudio();
    preloadChime('bell');
    await flush();
    playChime('bell');
    await flush();
    expect(bufferStart).not.toHaveBeenCalled();
    expect(createOscillator).toHaveBeenCalledTimes(2);
  });

  it('Given 同じ id / When 何度も preloadChime / Then fetch は 1 度だけ・URL は sounds/ の下', async () => {
    state = 'running';
    const { preloadChime, unlockAudio } = await import('../src/platform/sound');
    unlockAudio();
    preloadChime('voice-male');
    preloadChime('voice-male');
    await flush();
    preloadChime('voice-male');
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(/sounds\/timeout-male\.mp3$/);
    expect(decodeAudioData).toHaveBeenCalledTimes(1);
  });

  it('Given 操作の前（AudioContext が未作成） / When preloadChime / Then AudioContext を作らず、解錠の後にデコードする', async () => {
    state = 'running';
    const { playChime, preloadChime, unlockAudio } = await import('../src/platform/sound');
    preloadChime('melody');
    await flush();
    expect(contextCount).toBe(0);
    expect(decodeAudioData).not.toHaveBeenCalled();
    unlockAudio();
    await flush();
    expect(decodeAudioData).toHaveBeenCalledTimes(1);
    playChime('melody');
    await flush();
    expect(bufferStart).toHaveBeenCalledTimes(1);
  });

  it('Given 音のない選択（時打ち・トーン） / When preloadChime / Then 読み込まない', async () => {
    const { preloadChime, unlockAudio } = await import('../src/platform/sound');
    unlockAudio();
    preloadChime('strike');
    preloadChime('chime-up');
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Given AudioContext が無い / When preloadChime / Then 何もしない', async () => {
    vi.stubGlobal('AudioContext', undefined);
    const { preloadChime } = await import('../src/platform/sound');
    preloadChime('bell');
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/**
 * @requirements #669 D9（試しに鳴らすは押した操作の中で解錠してから鳴らす）
 */
describe('試しに鳴らす', () => {
  it('Given 解錠前 / When previewChime(strike) / Then 解錠して鳴らす', async () => {
    state = 'suspended';
    const { previewChime } = await import('../src/platform/sound');
    previewChime('strike');
    expect(contextCount).toBe(1);
    await flush();
    expect(createOscillator).toHaveBeenCalledTimes(2);
  });

  it('Given 読めていないファイルの音 / When previewChime(bell) / Then 読んでから鳴らす', async () => {
    state = 'running';
    const { previewChime } = await import('../src/platform/sound');
    previewChime('bell');
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bufferStart).toHaveBeenCalledTimes(1);
  });

  it('Given 読めないファイルの音 / When previewChime(bell) / Then 時打ちで代える', async () => {
    state = 'running';
    fetchMock.mockRejectedValue(new Error('network'));
    const { previewChime } = await import('../src/platform/sound');
    previewChime('bell');
    await flush();
    expect(createOscillator).toHaveBeenCalledTimes(2);
  });

  it('Given トーンの音 / When previewChime(chime-up) / Then 2 音を予約する', async () => {
    state = 'running';
    const { previewChime } = await import('../src/platform/sound');
    previewChime('chime-up');
    await flush();
    expect(createOscillator).toHaveBeenCalledTimes(2);
  });
});
