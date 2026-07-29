import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSwitchAlert } from "../../src/ui/use-switch-alert.js";
import * as sound from "../../src/platform/sound.js";
import * as notify from "../../src/platform/notify.js";

const OFF = { enabled: false, soundId: "chime-up", osNotify: true, volume: 0.6, countdownEnabled: false, countdownSeconds: 15, countdownMode: "tone" as const, countdownVoiceId: "voice-male" as const };
const ON = { enabled: true, soundId: "bell", osNotify: true, volume: 0.4, countdownEnabled: false, countdownSeconds: 15, countdownMode: "tone" as const, countdownVoiceId: "voice-male" as const };

describe("useSwitchAlert（個人設定ゲート）", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("notify.enabled=false なら交代しても音を鳴らさない", () => {
    // Given
    const play = vi.spyOn(sound, "playChime").mockImplementation(() => {});
    const { rerender } = renderHook(
      ({ idx, name }) => useSwitchAlert(idx, name, { assertiveSwitch: false, notify: OFF }),
      { initialProps: { idx: 0, name: "Alice" } },
    );
    // When
    rerender({ idx: 1, name: "Bob" });
    // Then
    expect(play).not.toHaveBeenCalled();
  });

  it("notify.enabled=true なら交代時に選択中の音を音量付きで鳴らす", () => {
    // Given
    const play = vi.spyOn(sound, "playChime").mockImplementation(() => {});
    const { rerender } = renderHook(
      ({ idx, name }) => useSwitchAlert(idx, name, { assertiveSwitch: false, notify: ON }),
      { initialProps: { idx: 0, name: "Alice" } },
    );
    // When
    rerender({ idx: 1, name: "Bob" });
    // Then
    expect(play).toHaveBeenCalledWith("bell", 0.4);
  });

  it("assertiveSwitch=true なら overlay 名をセットする（音とは独立）", () => {
    // Given
    vi.spyOn(sound, "playChime").mockImplementation(() => {});
    vi.spyOn(notify, "notifyDriverChange").mockImplementation(() => {});
    const { result, rerender } = renderHook(
      ({ idx, name }) => useSwitchAlert(idx, name, { assertiveSwitch: true, notify: OFF }),
      { initialProps: { idx: 0, name: "Alice" } },
    );
    // When
    rerender({ idx: 1, name: "Carol" });
    // Then
    expect(result.current.switchAlertName).toBe("Carol");
  });
});
