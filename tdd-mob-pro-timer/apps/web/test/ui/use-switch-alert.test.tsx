import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSwitchAlert } from "../../src/ui/use-switch-alert.js";
import * as sound from "../../src/platform/sound.js";
import * as notify from "../../src/platform/notify.js";

const OFF = { enabled: false, soundId: "chime-up", osNotify: true, volume: 0.6 };
const ON = { enabled: true, soundId: "bell", osNotify: true, volume: 0.4 };

describe("useSwitchAlert（個人設定ゲート）", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("notify.enabled=false なら交代しても音を鳴らさない", () => {
    const play = vi.spyOn(sound, "playChime").mockImplementation(() => {});
    const { rerender } = renderHook(
      ({ idx }) => useSwitchAlert(idx, "Bob", { assertiveSwitch: false, notify: OFF }),
      { initialProps: { idx: 0 } },
    );
    rerender({ idx: 1 });
    expect(play).not.toHaveBeenCalled();
  });

  it("notify.enabled=true なら交代時に選択中の音を音量付きで鳴らす", () => {
    const play = vi.spyOn(sound, "playChime").mockImplementation(() => {});
    const { rerender } = renderHook(
      ({ idx }) => useSwitchAlert(idx, "Bob", { assertiveSwitch: false, notify: ON }),
      { initialProps: { idx: 0 } },
    );
    rerender({ idx: 1 });
    expect(play).toHaveBeenCalledWith("bell", 0.4);
  });

  it("assertiveSwitch=true なら overlay 名をセットする（音とは独立）", () => {
    vi.spyOn(sound, "playChime").mockImplementation(() => {});
    vi.spyOn(notify, "notifyDriverChange").mockImplementation(() => {});
    const { result, rerender } = renderHook(
      ({ idx }) => useSwitchAlert(idx, "Carol", { assertiveSwitch: true, notify: OFF }),
      { initialProps: { idx: 0 } },
    );
    rerender({ idx: 1 });
    expect(result.current.switchAlertName).toBe("Carol");
  });
});
