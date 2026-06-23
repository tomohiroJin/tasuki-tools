import { describe, it, expect } from "vitest";
import { CHIMES, playChime, installAudioUnlock, DEFAULT_VOLUME } from "../../src/platform/sound.js";

describe("チャイム registry", () => {
  it("CHIMES は合成3＋ファイル3の計6種で id がユニーク", () => {
    const ids = CHIMES.map((c) => c.id);
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
    expect(ids).toEqual(expect.arrayContaining(["chime-up", "chime-down", "soft", "ping", "bell", "knock"]));
  });

  it("CHIMES は全て isReady=true", () => {
    expect(CHIMES.every((c) => c.isReady)).toBe(true);
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
