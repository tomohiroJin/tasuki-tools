import { describe, it, expect } from "vitest";
import { CHIMES, playChime } from "../../src/platform/sound.js";

describe("チャイム registry", () => {
  it("CHIMES は 5 種で id がユニーク", () => {
    expect(CHIMES).toHaveLength(5);
    const ids = CHIMES.map((c) => c.id);
    expect(new Set(ids).size).toBe(5);
  });

  it("既定 chime-up を含む", () => {
    expect(CHIMES.some((c) => c.id === "chime-up")).toBe(true);
  });

  it("音声ファイル系 voice は未配置時 isReady=false", () => {
    const voice = CHIMES.find((c) => c.id === "voice");
    expect(voice).toBeDefined();
    // 既定ではアセット未配置のため false（配置後に true 化）。
    expect(voice?.isReady).toBe(false);
  });

  it("playChime は未知 id でも例外を投げない", () => {
    expect(() => playChime("does-not-exist")).not.toThrow();
  });

  it("playChime は既知 id でも例外を投げない（AudioContext 無し環境）", () => {
    expect(() => playChime("chime-up")).not.toThrow();
  });
});
