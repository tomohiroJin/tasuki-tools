import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("../../src/platform/sound.js", () => ({ playChime: vi.fn(), vibrateSwitch: vi.fn() }));
vi.mock("../../src/platform/notify.js", () => ({ notifyDriverChange: vi.fn(), notifyBreak: vi.fn() }));

import { playChime } from "../../src/platform/sound.js";
import { notifyBreak } from "../../src/platform/notify.js";
import { useBreakAlert } from "../../src/ui/use-break-alert.js";

const on = { enabled: true, soundId: "bell", osNotify: true, volume: 0.4, countdownEnabled: false, countdownSeconds: 15, countdownMode: "tone" as const, countdownVoiceId: "voice-male" as const };
const off = { ...on, enabled: false };

function setup(notify = on) {
  return renderHook(({ since, sug }) => useBreakAlert(since, sug, notify), {
    initialProps: { since: null as number | null, sug: false },
  });
}

describe("useBreakAlert（#402 §5.6）", () => {
  beforeEach(() => vi.clearAllMocks());

  it("Given 休憩でない / When 初回に描く / Then 鳴らさない", () => {
    setup();
    expect(playChime).not.toHaveBeenCalled();
  });

  it("Given 休憩でない / When 休憩に入る / Then チャイムと OS 通知", () => {
    const { rerender } = setup();
    rerender({ since: 100, sug: false });
    expect(playChime).toHaveBeenCalledWith("bell", 0.4);
    expect(notifyBreak).toHaveBeenCalledTimes(1);
  });

  it("Given 休憩中 / When 休憩が終わる / Then チャイムは鳴るが OS 通知は出さない", () => {
    const { rerender } = renderHook(({ since }) => useBreakAlert(since, false, on), { initialProps: { since: 100 as number | null } });
    rerender({ since: null });
    expect(playChime).toHaveBeenCalledTimes(1);
    expect(notifyBreak).not.toHaveBeenCalled();
  });

  it("Given 帯が出ていない / When 知らせるだけの帯が出る / Then チャイムと OS 通知", () => {
    const { rerender } = setup();
    rerender({ since: null, sug: true });
    expect(playChime).toHaveBeenCalledTimes(1);
    expect(notifyBreak).toHaveBeenCalledTimes(1);
  });

  it("Given 帯が出ている / When 同じ状態で再描画 / Then 重ねて鳴らさない", () => {
    const { rerender } = setup();
    rerender({ since: null, sug: true });
    rerender({ since: null, sug: true });
    expect(playChime).toHaveBeenCalledTimes(1);
  });

  it("Given 個人設定で通知が OFF / When 休憩に入る / Then 鳴らさない", () => {
    const { rerender } = setup(off);
    rerender({ since: 100, sug: false });
    expect(playChime).not.toHaveBeenCalled();
    expect(notifyBreak).not.toHaveBeenCalled();
  });
});
