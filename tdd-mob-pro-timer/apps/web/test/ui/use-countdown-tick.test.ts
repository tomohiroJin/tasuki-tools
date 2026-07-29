import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("../../src/platform/sound.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/platform/sound.js")>();
  return { ...actual, playCountdownTick: vi.fn(), playCountdownVoice: vi.fn() };
});

import { playCountdownTick, playCountdownVoice } from "../../src/platform/sound.js";
import { useCountdownTick } from "../../src/ui/use-countdown-tick.js";
import type { CountdownTickOptions } from "../../src/ui/use-countdown-tick.js";

const opts = { enabled: true, thresholdSeconds: 15, volume: 0.6, mode: "tone" as const, voiceId: "voice-male" as const };

/**
 * 交代前カウントダウン予告音
 * @requirements Issue #2
 */
describe("useCountdownTick", () => {
  beforeEach(() => vi.clearAllMocks());

  it("しきい値以下に入った瞬間に1回鳴る", () => {
    // Given
    const { rerender } = renderHook(
      ({ s }) => useCountdownTick(s, true, opts),
      { initialProps: { s: 16 } },
    );
    expect(playCountdownTick).not.toHaveBeenCalled();
    // When
    rerender({ s: 15 });
    // Then
    expect(playCountdownTick).toHaveBeenCalledTimes(1);
    expect(playCountdownTick).toHaveBeenCalledWith(0.6, 1);
  });

  it("同じ整数秒内の再レンダーでは多重発火しない", () => {
    // Given
    const { rerender } = renderHook(
      ({ s }) => useCountdownTick(s, true, opts),
      { initialProps: { s: 15 } },
    );
    expect(playCountdownTick).toHaveBeenCalledTimes(1);
    // When
    rerender({ s: 14.8 });
    // Then
    expect(playCountdownTick).toHaveBeenCalledTimes(1);
  });

  it("秒が進んで別の整数値になったら再度発火する", () => {
    // Given
    const { rerender } = renderHook(
      ({ s }) => useCountdownTick(s, true, opts),
      { initialProps: { s: 15 } },
    );
    // When
    rerender({ s: 14 });
    // Then
    expect(playCountdownTick).toHaveBeenCalledTimes(2);
  });

  it("しきい値より外側なら発火しない", () => {
    renderHook(() => useCountdownTick(20, true, opts));
    expect(playCountdownTick).not.toHaveBeenCalled();
  });

  it("停止中(running=false)は発火しない（一時停止・休憩の両方をカバー）", () => {
    renderHook(() => useCountdownTick(10, false, opts));
    expect(playCountdownTick).not.toHaveBeenCalled();
  });

  it("個人設定 OFF なら発火しない", () => {
    renderHook(() => useCountdownTick(10, true, { ...opts, enabled: false }));
    expect(playCountdownTick).not.toHaveBeenCalled();
  });

  it("残り0秒（交代の瞬間）では発火しない", () => {
    renderHook(() => useCountdownTick(0, true, opts));
    expect(playCountdownTick).not.toHaveBeenCalled();
  });

  /**
   * @requirements Issue #3
   */
  describe("残り秒数に応じた段階", () => {
    it("threshold=15・残り5秒は段階3(高)で発火する", () => {
      renderHook(() => useCountdownTick(5, true, opts));
      expect(playCountdownTick).toHaveBeenCalledWith(0.6, 3);
    });

    it("threshold=15・残り10秒は段階2(中)で発火する", () => {
      renderHook(() => useCountdownTick(10, true, opts));
      expect(playCountdownTick).toHaveBeenCalledWith(0.6, 2);
    });

    it("threshold=15・残り11秒は段階1(低)で発火する", () => {
      renderHook(() => useCountdownTick(11, true, opts));
      expect(playCountdownTick).toHaveBeenCalledWith(0.6, 1);
    });
  });
});

/**
 * @requirements Issue #5
 */
describe("useCountdownTick の mode 分岐", () => {
  beforeEach(() => vi.clearAllMocks());

  it("mode: voice のとき数字・voiceId・volume 付きで音声読み上げが再生される", () => {
    // Given
    const voiceOpts: CountdownTickOptions = { ...opts, mode: "voice", voiceId: "voice-female" };
    // When
    renderHook(() => useCountdownTick(10, true, voiceOpts));
    // Then
    expect(playCountdownVoice).toHaveBeenCalledWith(10, "voice-female", 0.6);
    expect(playCountdownTick).not.toHaveBeenCalled();
  });

  it("mode: tone（既定）のときは従来どおりトーン音のみ再生される", () => {
    // Given（opts をそのまま使う）
    // When
    renderHook(() => useCountdownTick(10, true, opts));
    // Then
    expect(playCountdownTick).toHaveBeenCalledWith(0.6, 2);
    expect(playCountdownVoice).not.toHaveBeenCalled();
  });

  it("mode: voice でも整数秒が変わるたびに1回だけ発火する", () => {
    // Given
    const { rerender } = renderHook(
      ({ s }) => useCountdownTick(s, true, { ...opts, mode: "voice" as const }),
      { initialProps: { s: 15 } },
    );
    expect(playCountdownVoice).toHaveBeenCalledTimes(1);
    // When
    rerender({ s: 14.9 });
    // Then
    expect(playCountdownVoice).toHaveBeenCalledTimes(1);
    // When
    rerender({ s: 14 });
    // Then
    expect(playCountdownVoice).toHaveBeenCalledTimes(2);
  });
});
