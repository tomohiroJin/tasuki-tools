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
/** 作られたオシレーター・バッファの再生元（周波数の並びと、鳴らしたバッファを見る） */
let oscillators: { type: string; frequency: { value: number } }[] = [];
let sources: { buffer: unknown; stop: ReturnType<typeof vi.fn> }[] = [];

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
    const osc = { type: 'sine', frequency: { value: 0 }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
    oscillators.push(osc);
    return osc;
  };
  createGain = () => ({ gain: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() });
  createBufferSource = () => {
    const source = { buffer: null as unknown, connect: vi.fn(), start: bufferStart, stop: vi.fn() };
    sources.push(source);
    return source;
  };
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
  oscillators = [];
  sources = [];
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
 * 音の取り違え（別の音が鳴る・別のファイルを読む）を捕まえる（#669 のレビュー）。
 * 個数だけでは、時打ちも 2 打なのでトーンと区別できない。周波数の並びとファイルの URL・鳴らしたバッファで見る。
 *
 * @requirements #669 D1（音の一覧）・D8
 */
describe('音の取り違え', () => {
  it.each([
    ['strike', [1318.5, 880]],
    ['chime-up', [660, 990]],
    ['chime-down', [990, 660]],
  ] as const)('Given 解錠済み / When playChime(%s) / Then その音の周波数の並びで鳴らす', async (id, freqs) => {
    state = 'running';
    const { playChime, unlockAudio } = await import('../src/platform/sound');
    unlockAudio();
    playChime(id);
    await flush();
    expect(oscillators.map((o) => o.frequency.value)).toEqual(freqs);
    expect(bufferStart).not.toHaveBeenCalled();
  });

  it.each([
    ['department', 'department.mp3'],
    ['melody', 'melody.mp3'],
    ['sustained', 'sustained.mp3'],
    ['bell', 'bell.mp3'],
    ['voice-male', 'timeout-male.mp3'],
    ['voice-female', 'timeout-female.mp3'],
    ['voice-nise', 'timeout-nise.mp3'],
    ['voice-mai', 'timeout-mai.mp3'],
  ] as const)('Given %s / When preloadChime して鳴らす / Then %s を読み、その音のバッファを鳴らす', async (id, file) => {
    state = 'running';
    // URL を中身にして、デコードの結果から「どのファイルのバッファか」を辿れるようにする
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new TextEncoder().encode(url).buffer) }),
    );
    decodeAudioData.mockImplementation((bytes: ArrayBuffer) => Promise.resolve({ url: new TextDecoder().decode(bytes) }));
    const { playChime, preloadChime, unlockAudio } = await import('../src/platform/sound');
    unlockAudio();
    preloadChime(id);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(new RegExp(`sounds/${file.replace('.', '\\.')}$`));
    playChime(id);
    await flush();
    expect(bufferStart).toHaveBeenCalledTimes(1);
    expect(String((sources[0]?.buffer as { url: string }).url)).toMatch(new RegExp(`sounds/${file.replace('.', '\\.')}$`));
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

  it('Given 試聴の途中（ファイルの音） / When 続けて previewChime / Then 前の音を止めてから鳴らす', async () => {
    state = 'running';
    const { previewChime } = await import('../src/platform/sound');
    previewChime('bell');
    await flush();
    expect(sources).toHaveLength(1);
    expect(sources[0]?.stop).not.toHaveBeenCalled();
    previewChime('bell');
    await flush();
    expect(sources[0]?.stop).toHaveBeenCalledTimes(1);
    expect(sources).toHaveLength(2);
    expect(sources[1]?.stop).not.toHaveBeenCalled();
  });

  it('Given 試聴の途中（トーン） / When 続けて previewChime / Then 前のオシレーターを止める', async () => {
    state = 'running';
    const { previewChime } = await import('../src/platform/sound');
    previewChime('chime-up');
    await flush();
    const firstStops = oscillators.map((o) => (o as unknown as { stop: { mock: { calls: unknown[] } } }).stop.mock.calls.length);
    previewChime('chime-up');
    await flush();
    const after = oscillators.slice(0, 2).map((o) => (o as unknown as { stop: { mock: { calls: unknown[] } } }).stop.mock.calls.length);
    expect(after).toEqual(firstStops.slice(0, 2).map((n) => n + 1));
  });

  it('Given 前の音の stop が例外を投げる / When 続けて previewChime / Then 無視して次を鳴らす', async () => {
    state = 'running';
    const { previewChime } = await import('../src/platform/sound');
    previewChime('bell');
    await flush();
    sources[0]?.stop.mockImplementation(() => {
      throw new Error('InvalidStateError');
    });
    previewChime('bell');
    await flush();
    expect(bufferStart).toHaveBeenCalledTimes(2);
  });

  it('Given 試聴の途中 / When 時間切れの音（playChime） / Then 試聴の音は止めない', async () => {
    state = 'running';
    const { playChime, previewChime } = await import('../src/platform/sound');
    previewChime('bell');
    await flush();
    playChime('bell');
    await flush();
    expect(bufferStart).toHaveBeenCalledTimes(2);
    expect(sources[0]?.stop).not.toHaveBeenCalled();
    expect(sources[1]?.stop).not.toHaveBeenCalled();
  });

  it('Given ファイルを読んでいる途中の試聴 / When 別の音を試聴してから読み終わる / Then 古い試聴は鳴らさず、後の音だけ鳴る', async () => {
    // Given: bell の取得を保留したまま試聴する
    state = 'running';
    let release: () => void = () => {};
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) });
        }),
    );
    const { previewChime } = await import('../src/platform/sound');
    previewChime('bell');
    await flush();
    // When: 読み終わる前に時打ちを試聴し、そのあと bell が読み終わる
    previewChime('strike');
    await flush();
    release();
    await flush();
    // Then: 時打ちの 2 打だけが鳴り、古い bell は後から重ならない
    expect(createOscillator).toHaveBeenCalledTimes(2);
    expect(bufferStart).not.toHaveBeenCalled();
  });

  it('Given 時間切れの音が鳴っている / When 試聴する / Then 時間切れの音は止めない', async () => {
    state = 'running';
    const { playChime, preloadChime, previewChime } = await import('../src/platform/sound');
    preloadChime('bell');
    await flush();
    playChime('bell');
    await flush();
    previewChime('melody');
    await flush();
    expect(sources[0]?.stop).not.toHaveBeenCalled();
  });
});

/**
 * 一時的な失敗は覚えない（#669 の /code-review）。成功だけを覚え、失敗は次の preload・試聴で取り直す。
 *
 * @requirements #669 D8
 */
describe('失敗は覚えない', () => {
  it('Given 1 回目の fetch が例外 / When もう一度 preloadChime / Then 取り直してそのバッファが鳴る', async () => {
    state = 'running';
    fetchMock.mockRejectedValueOnce(new Error('network'));
    const { playChime, preloadChime, unlockAudio } = await import('../src/platform/sound');
    unlockAudio();
    preloadChime('bell');
    await flush();
    preloadChime('bell');
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    playChime('bell');
    await flush();
    expect(bufferStart).toHaveBeenCalledTimes(1);
    expect(createOscillator).not.toHaveBeenCalled();
  });

  it('Given 1 回目の fetch が ok でない / When 試聴する / Then 取り直して鳴らす', async () => {
    state = 'running';
    fetchMock.mockResolvedValueOnce({ ok: false, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) });
    const { previewChime } = await import('../src/platform/sound');
    previewChime('bell');
    await flush();
    expect(createOscillator).toHaveBeenCalledTimes(2);
    previewChime('bell');
    await flush();
    expect(bufferStart).toHaveBeenCalledTimes(1);
  });

  it('Given 1 回目のデコードが失敗 / When もう一度 preloadChime / Then デコードし直してそのバッファが鳴る', async () => {
    state = 'running';
    decodeAudioData.mockRejectedValueOnce(new Error('bad'));
    const { playChime, preloadChime, unlockAudio } = await import('../src/platform/sound');
    unlockAudio();
    preloadChime('bell');
    await flush();
    preloadChime('bell');
    await flush();
    playChime('bell');
    await flush();
    expect(bufferStart).toHaveBeenCalledTimes(1);
  });
});

/**
 * 古い Safari の `webkitAudioContext.decodeAudioData` は callback 形しか受けない（#669 の /code-review）。
 *
 * @requirements #669 D8
 */
describe('decodeAudioData の callback 形', () => {
  it('Given callback だけで返す decodeAudioData（戻り値なし） / When preloadChime して鳴らす / Then そのバッファが鳴る', async () => {
    state = 'running';
    decodeAudioData.mockImplementation((_bytes: ArrayBuffer, ok: (b: unknown) => void) => {
      ok({ legacy: true });
    });
    const { playChime, preloadChime, unlockAudio } = await import('../src/platform/sound');
    unlockAudio();
    preloadChime('bell');
    await flush();
    playChime('bell');
    await flush();
    expect(bufferStart).toHaveBeenCalledTimes(1);
    expect((sources[0]?.buffer as { legacy: boolean }).legacy).toBe(true);
  });

  it('Given callback の失敗 / When playChime / Then 時打ちで代える', async () => {
    state = 'running';
    decodeAudioData.mockImplementation((_bytes: ArrayBuffer, _ok: unknown, fail: (e: unknown) => void) => {
      fail(new Error('bad'));
    });
    const { playChime, preloadChime, unlockAudio } = await import('../src/platform/sound');
    unlockAudio();
    preloadChime('bell');
    await flush();
    playChime('bell');
    await flush();
    expect(bufferStart).not.toHaveBeenCalled();
    expect(createOscillator).toHaveBeenCalledTimes(2);
  });
});
