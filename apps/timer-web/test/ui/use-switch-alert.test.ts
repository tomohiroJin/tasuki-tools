import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("../../src/platform/sound.js", () => ({ playChime: vi.fn(), vibrateSwitch: vi.fn() }));
vi.mock("../../src/platform/notify.js", () => ({ notifyDriverChange: vi.fn() }));

import { playChime } from "../../src/platform/sound.js";
import { useSwitchAlert } from "../../src/ui/use-switch-alert.js";

const notify = { enabled: true, soundId: "department", osNotify: false, volume: 0.6, countdownEnabled: false, countdownSeconds: 15, countdownMode: "tone" as const, countdownVoiceId: "voice-male" as const };
const opts = { assertiveSwitch: false, notify, suppressed: false };

describe("useSwitchAlert 交代検知", () => {
  beforeEach(() => vi.clearAllMocks());

  it("番号も名前も変わった本当の交代だけ鳴る", () => {
    // Given
    const { rerender } = renderHook(({ i, n }) => useSwitchAlert(i, n, opts), {
      initialProps: { i: 0, n: "Alice" },
    });
    expect(playChime).not.toHaveBeenCalled();
    // When
    rerender({ i: 1, n: "Bob" });
    // Then
    expect(playChime).toHaveBeenCalledTimes(1);
  });

  it("番号だけ変わり名前が同じ（並べ替え）なら鳴らない", () => {
    // Given
    const { rerender } = renderHook(({ i, n }) => useSwitchAlert(i, n, opts), {
      initialProps: { i: 2, n: "Alice" },
    });
    // When
    rerender({ i: 0, n: "Alice" });
    // Then
    expect(playChime).not.toHaveBeenCalled();
  });

  it("名前だけ変わり番号が同じ（改名）なら鳴らない", () => {
    // Given
    const { rerender } = renderHook(({ i, n }) => useSwitchAlert(i, n, opts), {
      initialProps: { i: 1, n: "Alice" },
    });
    // When
    rerender({ i: 1, n: "Alice2" });
    // Then
    expect(playChime).not.toHaveBeenCalled();
  });
});

/** @requirements #402 */
describe("useSwitchAlert 休憩に入る交代", () => {
  beforeEach(() => vi.clearAllMocks());

  it("Given suppressed / When 本当の交代 / Then 鳴らさず、全画面の知らせも出さない", () => {
    const o = { assertiveSwitch: true, notify, suppressed: true };
    const { result, rerender } = renderHook(({ i, n }) => useSwitchAlert(i, n, o), {
      initialProps: { i: 0, n: "Alice" },
    });
    rerender({ i: 1, n: "Bob" });
    expect(playChime).not.toHaveBeenCalled();
    expect(result.current.switchAlertName).toBeNull();
  });
});
