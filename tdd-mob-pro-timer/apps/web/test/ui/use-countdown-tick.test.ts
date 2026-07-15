import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("../../src/platform/sound.js", () => ({ playCountdownTick: vi.fn() }));

import { playCountdownTick } from "../../src/platform/sound.js";
import { useCountdownTick } from "../../src/ui/use-countdown-tick.js";

const opts = { enabled: true, thresholdSeconds: 15, volume: 0.6 };

describe("useCountdownTick（交代前カウントダウン予告音・Issue #2）", () => {
  beforeEach(() => vi.clearAllMocks());

  it("しきい値以下に入った瞬間に1回鳴る", () => {
    const { rerender } = renderHook(
      ({ s }) => useCountdownTick(s, true, opts),
      { initialProps: { s: 16 } },
    );
    expect(playCountdownTick).not.toHaveBeenCalled();
    rerender({ s: 15 });
    expect(playCountdownTick).toHaveBeenCalledTimes(1);
    expect(playCountdownTick).toHaveBeenCalledWith(0.6);
  });

  it("同じ整数秒内の再レンダーでは多重発火しない", () => {
    const { rerender } = renderHook(
      ({ s }) => useCountdownTick(s, true, opts),
      { initialProps: { s: 15 } },
    );
    expect(playCountdownTick).toHaveBeenCalledTimes(1);
    rerender({ s: 14.8 });
    expect(playCountdownTick).toHaveBeenCalledTimes(1);
  });

  it("秒が進んで別の整数値になったら再度発火する", () => {
    const { rerender } = renderHook(
      ({ s }) => useCountdownTick(s, true, opts),
      { initialProps: { s: 15 } },
    );
    rerender({ s: 14 });
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
});
