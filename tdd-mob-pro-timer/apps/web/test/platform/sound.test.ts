import { describe, it, expect } from "vitest";
import { CHIMES, playChime, installAudioUnlock, DEFAULT_VOLUME, scheduleTones } from "../../src/platform/sound.js";

describe("scheduleTones（#1 resume を待ってからスケジュール）", () => {
  it("suspended のとき resume を await してから createOscillator/currentTime を読む", async () => {
    const calls: string[] = [];
    class FakeOsc {
      type = "sine"; frequency = { value: 0 };
      connect() {} start() { calls.push("start"); } stop() {}
    }
    class FakeGain {
      gain = { setValueAtTime() {}, exponentialRampToValueAtTime() {} };
      connect() {}
    }
    const ctx = {
      state: "suspended" as AudioContextState,
      _t: 0 as number,
      get currentTime() { calls.push("currentTime"); return (this as { _t: number })._t; },
      destination: {},
      async resume() { calls.push("resume"); (this as { state: string }).state = "running"; },
      createOscillator() { calls.push("createOscillator"); return new FakeOsc(); },
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
  it("CHIMES は department/melody/sustained/chime-up/chime-down/bell を含み soft/ping/knock を含まない", () => {
    const ids = CHIMES.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(["department", "melody", "sustained", "chime-up", "chime-down", "bell"]));
    expect(ids).not.toContain("soft");
    expect(ids).not.toContain("ping");
    expect(ids).not.toContain("knock");
    expect(CHIMES.every((c) => c.isReady)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
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
