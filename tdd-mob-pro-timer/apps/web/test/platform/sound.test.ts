import { describe, it, expect } from "vitest";
import {
  CHIMES, playChime, installAudioUnlock, DEFAULT_VOLUME, scheduleTones,
  playCountdownTick, computeCountdownStage, COUNTDOWN_STAGE_FREQS,
  playCountdownVoice,
} from "../../src/platform/sound.js";
import { FakeAudio, FakeGain, FakeOsc } from "../support/fakes.js";

describe("scheduleTones（#1 resume を待ってからスケジュール）", () => {
  it("suspended のとき resume を await してから createOscillator/currentTime を読む", async () => {
    const calls: string[] = [];
    const ctx = {
      state: "suspended" as AudioContextState,
      _t: 0 as number,
      get currentTime() { calls.push("currentTime"); return (this as { _t: number })._t; },
      destination: {},
      async resume() { calls.push("resume"); (this as { state: string }).state = "running"; },
      createOscillator() { calls.push("createOscillator"); return new FakeOsc(() => calls.push("start")); },
      createGain() { return new FakeGain(); },
    } as unknown as AudioContext;

    await scheduleTones(ctx, [660, 990], 0.6);

    // resume が currentTime/createOscillator より前に呼ばれている。
    expect(calls[0]).toBe("resume");
    expect(calls.indexOf("resume")).toBeLessThan(calls.indexOf("currentTime"));
    expect(calls.indexOf("resume")).toBeLessThan(calls.indexOf("createOscillator"));
  });

  it("resume が reject しても例外を投げない", async () => {
    const ctx = {
      state: "suspended" as AudioContextState,
      currentTime: 0,
      destination: {},
      resume: () => Promise.reject(new Error("blocked")),
      createOscillator() { return { type: "", frequency: { value: 0 }, connect() {}, start() {}, stop() {} }; },
      createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; },
    } as unknown as AudioContext;
    await expect(scheduleTones(ctx, [660], 0.6)).resolves.toBeUndefined();
  });
});

describe("チャイム registry", () => {
  it("CHIMES は voice-male/voice-female/voice-nise/voice-mai を含む計10種", () => {
    const ids = CHIMES.map((c) => c.id);
    expect(ids).toHaveLength(10);
    expect(ids).toEqual(expect.arrayContaining([
      "department", "melody", "sustained", "voice-male", "voice-female",
      "voice-nise", "voice-mai", "chime-up", "chime-down", "bell",
    ]));
    expect(new Set(ids).size).toBe(10);
    expect(CHIMES.every((c) => c.isReady)).toBe(true);
  });

  it("既定 department が registry にあり playChime の未知idフォールバックも department", () => {
    expect(CHIMES.some((c) => c.id === "department")).toBe(true);
    // 削除済み soundId は例外なくフォールバック再生される（department）。
    expect(() => playChime("soft", 0.5)).not.toThrow();
  });

  it("playChime は未知 id でも例外を投げない", () => {
    expect(() => playChime("does-not-exist", 0.5)).not.toThrow();
  });

  it("playChime は volume 省略でも例外を投げない", () => {
    expect(() => playChime("chime-up")).not.toThrow();
  });

  it("DEFAULT_VOLUME は 0.6", () => {
    expect(DEFAULT_VOLUME).toBe(0.6);
  });

  it("installAudioUnlock は例外を投げず冪等に呼べる", () => {
    expect(() => { installAudioUnlock(); installAudioUnlock(); }).not.toThrow();
  });
});

describe("playCountdownTick（カウントダウン予告音・Issue #2）", () => {
  it("例外を投げず呼び出せる", () => {
    expect(() => playCountdownTick(0.6)).not.toThrow();
  });

  it("音量 0 でも例外を投げない", () => {
    expect(() => playCountdownTick(0)).not.toThrow();
  });

  it("stage 1/2/3 いずれでも例外を投げない", () => {
    expect(() => playCountdownTick(0.6, 1)).not.toThrow();
    expect(() => playCountdownTick(0.6, 2)).not.toThrow();
    expect(() => playCountdownTick(0.6, 3)).not.toThrow();
  });
});

describe("COUNTDOWN_STAGE_FREQS（3段階周波数・Issue #3）", () => {
  it("低→中→高の3値(660/880/1108)を持つ", () => {
    expect(COUNTDOWN_STAGE_FREQS).toEqual([660, 880, 1108]);
  });
});

describe("computeCountdownStage（区間判定・Issue #3）", () => {
  it("threshold=15: 残り1〜5秒は段階3(高)", () => {
    expect(computeCountdownStage(1, 15)).toBe(3);
    expect(computeCountdownStage(5, 15)).toBe(3);
  });

  it("threshold=15: 残り6〜10秒は段階2(中)", () => {
    expect(computeCountdownStage(6, 15)).toBe(2);
    expect(computeCountdownStage(10, 15)).toBe(2);
  });

  it("threshold=15: 残り11〜15秒は段階1(低)", () => {
    expect(computeCountdownStage(11, 15)).toBe(1);
    expect(computeCountdownStage(15, 15)).toBe(1);
  });

  it("threshold=6(均等に3分割できる最小級): 2秒ずつの3区間", () => {
    expect(computeCountdownStage(1, 6)).toBe(3);
    expect(computeCountdownStage(2, 6)).toBe(3);
    expect(computeCountdownStage(3, 6)).toBe(2);
    expect(computeCountdownStage(4, 6)).toBe(2);
    expect(computeCountdownStage(5, 6)).toBe(1);
    expect(computeCountdownStage(6, 6)).toBe(1);
  });

  it("threshold=5(最小値・不均等区間): 段階3が1秒分だけになる", () => {
    expect(computeCountdownStage(1, 5)).toBe(3);
    expect(computeCountdownStage(2, 5)).toBe(2);
    expect(computeCountdownStage(3, 5)).toBe(2);
    expect(computeCountdownStage(4, 5)).toBe(1);
    expect(computeCountdownStage(5, 5)).toBe(1);
  });
});

describe("playCountdownVoice（音声によるカウントダウン読み上げ・Issue #5）", () => {
  it("正しいURL（sounds/countdown/count-{speaker}-{n}.mp3）で Audio を生成し play する", () => {
    const created: string[] = [];
    const playCalls: string[] = [];
    FakeAudio.reset();
    FakeAudio.onCreate = (src) => created.push(src);
    FakeAudio.onPlay = (src) => playCalls.push(src);
    const original = globalThis.Audio;
    (globalThis as unknown as { Audio: typeof Audio }).Audio = FakeAudio as unknown as typeof Audio;

    playCountdownVoice(10, "voice-male", 0.6);

    expect(created).toHaveLength(1);
    expect(created[0]).toContain("sounds/countdown/count-male-10.mp3");

    (globalThis as unknown as { Audio: typeof Audio }).Audio = original;
    FakeAudio.reset();
  });

  it("voice-female を渡すと count-female-{n}.mp3 を再生する", () => {
    const created: string[] = [];
    FakeAudio.reset();
    FakeAudio.onCreate = (src) => created.push(src);
    const original = globalThis.Audio;
    (globalThis as unknown as { Audio: typeof Audio }).Audio = FakeAudio as unknown as typeof Audio;

    playCountdownVoice(3, "voice-female", 0.6);

    expect(created[0]).toContain("sounds/countdown/count-female-3.mp3");

    (globalThis as unknown as { Audio: typeof Audio }).Audio = original;
    FakeAudio.reset();
  });

  it("Audio の error イベントで playCountdownTick にフォールバックする", () => {
    FakeAudio.reset();
    let instance: FakeAudio | undefined;
    FakeAudio.onCreate = (_src, created) => { instance = created; };
    const original = globalThis.Audio;
    (globalThis as unknown as { Audio: typeof Audio }).Audio = FakeAudio as unknown as typeof Audio;

    expect(() => {
      playCountdownVoice(5, "voice-male", 0.6);
      instance?.fireError();
    }).not.toThrow();

    (globalThis as unknown as { Audio: typeof Audio }).Audio = original;
    FakeAudio.reset();
  });

  it("play() が reject してもフォールバックして例外を投げない", async () => {
    FakeAudio.reset();
    FakeAudio.playResult = "reject";
    const original = globalThis.Audio;
    (globalThis as unknown as { Audio: typeof Audio }).Audio = FakeAudio as unknown as typeof Audio;

    expect(() => playCountdownVoice(1, "voice-male", 0.6)).not.toThrow();

    (globalThis as unknown as { Audio: typeof Audio }).Audio = original;
    FakeAudio.reset();
  });

  it("Audio が未定義の環境でも例外を投げない（playCountdownTick 相当にフォールバック）", () => {
    const original = globalThis.Audio;
    (globalThis as unknown as { Audio: undefined }).Audio = undefined;

    expect(() => playCountdownVoice(7, "voice-male", 0.6)).not.toThrow();

    (globalThis as unknown as { Audio: typeof Audio }).Audio = original;
  });

  it("error イベントと play() reject が両方発火しても playCountdownTick（トーン再生）は1回しか実行されない（dedupe）", async () => {
    // playCountdownTick は同一モジュール内の直接参照で呼ばれるため vi.spyOn では呼び出し回数を
    // 捕捉できない（ESM のライブバインディング仕様）。そのため、playCountdownTick が最終的に
    // 呼び出す AudioContext.createOscillator の回数を外部から観測することで dedupe を検証する。
    // このテストは AudioContext のシングルトン(sharedCtx)を初めて生成させるため、以降このファイル内で
    // 新たに実 AudioContext 経由のテストを追加する場合は本テストより前に置くこと。
    let oscillatorCount = 0;
    class FakeAudioContext {
      state: AudioContextState = "running";
      currentTime = 0;
      destination = {};
      createOscillator() { return new FakeOsc(() => oscillatorCount++); }
      createGain() { return new FakeGain(); }
    }
    const originalCtor = globalThis.AudioContext;
    (globalThis as unknown as { AudioContext: typeof AudioContext }).AudioContext =
      FakeAudioContext as unknown as typeof AudioContext;

    FakeAudio.reset();
    FakeAudio.playResult = "reject";
    let instance: FakeAudio | undefined;
    FakeAudio.onCreate = (_src, created) => { instance = created; };
    const originalAudio = globalThis.Audio;
    (globalThis as unknown as { Audio: typeof Audio }).Audio = FakeAudio as unknown as typeof Audio;

    playCountdownVoice(5, "voice-male", 0.6);
    instance?.fireError();
    // play().catch() も解決するのを待つ
    await Promise.resolve();
    await Promise.resolve();

    expect(oscillatorCount).toBe(1);

    (globalThis as unknown as { Audio: typeof Audio }).Audio = originalAudio;
    (globalThis as unknown as { AudioContext: typeof AudioContext }).AudioContext = originalCtor;
    FakeAudio.reset();
  });
});
