import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("../../src/platform/sound.js", () => ({ playChime: vi.fn(), vibrateSwitch: vi.fn() }));
vi.mock("../../src/platform/notify.js", () => ({ notifyDriverChange: vi.fn(), notifyBreak: vi.fn() }));

import { playChime, vibrateSwitch } from "../../src/platform/sound.js";
import { notifyBreak } from "../../src/platform/notify.js";
import { useBreakAlert } from "../../src/ui/use-break-alert.js";
import { useSwitchAlert } from "../../src/ui/use-switch-alert.js";

const on = { enabled: true, soundId: "bell", osNotify: true, volume: 0.4, countdownEnabled: false, countdownSeconds: 15, countdownMode: "tone" as const, countdownVoiceId: "voice-male" as const };
const off = { ...on, enabled: false };

/** 運転者（添字と名前）。知らせが交代と重なったか（交代のチャイムが鳴るか）を決める */
const ALICE = { index: 0, name: "Alice" };
const BOB = { index: 1, name: "Bob" };

/** `sug` は知らせた時点の稼働の累計（知らせていなければ null） */
function setup(notify = on) {
  return renderHook(({ since, sug, driver }) => useBreakAlert(since, sug, driver, notify), {
    initialProps: { since: null as number | null, sug: null as number | null, driver: ALICE },
  });
}

/** @requirements #402 */
describe("useBreakAlert", () => {
  beforeEach(() => vi.clearAllMocks());

  it("Given 休憩でない / When 初回に描く / Then 鳴らさない", () => {
    setup();
    expect(playChime).not.toHaveBeenCalled();
  });

  it("Given 休憩でない / When 休憩に入る / Then チャイムと OS 通知", () => {
    // Given
    const { rerender } = setup();
    // When
    rerender({ since: 100, sug: null, driver: ALICE });
    // Then
    expect(playChime).toHaveBeenCalledWith("bell", 0.4);
    expect(notifyBreak).toHaveBeenCalledTimes(1);
  });

  it("Given 休憩中 / When 休憩が終わる / Then チャイムは鳴るが OS 通知は出さない", () => {
    // Given
    const { rerender } = renderHook(({ since }) => useBreakAlert(since, null, ALICE, on), { initialProps: { since: 100 as number | null } });
    // When
    rerender({ since: null });
    // Then
    expect(playChime).toHaveBeenCalledTimes(1);
    expect(notifyBreak).not.toHaveBeenCalled();
  });

  it("Given 知らせた / When 同じ状態で再描画 / Then OS 通知を重ねて出さない", () => {
    // Given
    const { rerender } = setup();
    rerender({ since: null, sug: 1_800_000, driver: BOB });
    // When
    rerender({ since: null, sug: 1_800_000, driver: BOB });
    // Then
    expect(notifyBreak).toHaveBeenCalledTimes(1);
  });

  it("Given 個人設定で通知が OFF / When 休憩に入る / Then 鳴らさない", () => {
    // Given
    const { rerender } = setup(off);
    // When
    rerender({ since: 100, sug: null, driver: ALICE });
    // Then
    expect(playChime).not.toHaveBeenCalled();
    expect(notifyBreak).not.toHaveBeenCalled();
  });

  it("Given 休憩中から描き始める（再接続直後） / When 初回に描く / Then 鳴らさない", () => {
    // Given
    const since = 100;
    // When
    renderHook(() => useBreakAlert(since, null, ALICE, on));
    // Then
    expect(playChime).not.toHaveBeenCalled();
    expect(notifyBreak).not.toHaveBeenCalled();
  });

  it("Given 知らせていない / When 交代と同じ snapshot で知らせる / Then チャイムと振動は鳴らさず（交代のチャイムと二重になる）、OS 通知だけ出す", () => {
    // Given
    const { rerender } = setup();
    // When
    rerender({ since: null, sug: 1_800_000, driver: BOB });
    // Then
    expect(playChime).not.toHaveBeenCalled();
    expect(vibrateSwitch).not.toHaveBeenCalled();
    expect(notifyBreak).toHaveBeenCalledTimes(1);
  });

  // 1 人の輪などの現状維持の交代では運転者が替わらず、交代のチャイムが鳴らない。回数も進まないので、
  // 帯の真偽だけを見ていると 2 回目以降の知らせを取りこぼした（PR #416 の再レビュー）。
  it("Given 1 人の輪で 30 分の時点で知らせた / When 60 分の時点でまた知らせる（運転者は替わらない） / Then 1 回目も 2 回目もチャイムと OS 通知", () => {
    // Given
    const { rerender } = setup();
    // When
    rerender({ since: null, sug: 1_800_000, driver: ALICE });
    // Then
    expect(playChime).toHaveBeenCalledTimes(1);
    expect(notifyBreak).toHaveBeenCalledTimes(1);
    rerender({ since: null, sug: 1_800_000, driver: ALICE });
    expect(notifyBreak).toHaveBeenCalledTimes(1);
    rerender({ since: null, sug: 3_600_000, driver: ALICE });
    expect(playChime).toHaveBeenCalledTimes(2);
    expect(vibrateSwitch).toHaveBeenCalledTimes(2);
    expect(notifyBreak).toHaveBeenCalledTimes(2);
  });

  it("Given 知らせた状態で描き始める（再接続直後） / When 初回に描く / Then 鳴らさない", () => {
    // Given
    const suggestedAtElapsedMs = 1_800_000;
    // When
    renderHook(() => useBreakAlert(null, suggestedAtElapsedMs, ALICE, on));
    // Then
    expect(playChime).not.toHaveBeenCalled();
    expect(notifyBreak).not.toHaveBeenCalled();
  });

  it("Given 知らせた / When 休憩に入って印が消える / Then 休憩に入った知らせだけ（知らせ直しにしない）", () => {
    // Given
    const { rerender } = setup();
    rerender({ since: null, sug: 1_800_000, driver: ALICE });
    vi.clearAllMocks();
    // When
    rerender({ since: 100, sug: null, driver: ALICE });
    // Then
    expect(playChime).toHaveBeenCalledTimes(1);
    expect(notifyBreak).toHaveBeenCalledTimes(1);
  });

  // 休憩明けの繰り上げ（休憩中に運転者が席を外し、明けると次の人へ替わる）では、終わりと交代が
  // 同じ snapshot に載る。交代のチャイムが鳴るので、休憩の側は鳴らさず 1 回にする（#402）。
  it("Given 休憩中 / When 休憩明けの繰り上げで運転者が替わる / Then 休憩の側はチャイムも振動も鳴らさない", () => {
    // Given
    const { rerender } = renderHook(({ since, driver }) => useBreakAlert(since, null, driver, on), {
      initialProps: { since: 100 as number | null, driver: ALICE },
    });
    // When
    rerender({ since: null, driver: BOB });
    // Then
    expect(playChime).not.toHaveBeenCalled();
    expect(vibrateSwitch).not.toHaveBeenCalled();
  });

  it("Given 休憩中 / When 休憩明けの繰り上げで運転者が替わる / Then 交代の知らせと合わせてチャイムは 1 回だけ", () => {
    // Given
    const { rerender } = renderHook(
      ({ since, driver }) => {
        useBreakAlert(since, null, driver, on);
        useSwitchAlert(driver.index, driver.name, { assertiveSwitch: false, notify: on, suppressed: false });
      },
      { initialProps: { since: 100 as number | null, driver: ALICE } },
    );
    // When
    rerender({ since: null, driver: BOB });
    // Then
    expect(playChime).toHaveBeenCalledTimes(1);
  });

  it("Given 休憩中 / When 運転者が同じまま休憩が終わる / Then 休憩の側がチャイムと振動を鳴らす", () => {
    // Given
    const { rerender } = renderHook(({ since, driver }) => useBreakAlert(since, null, driver, on), {
      initialProps: { since: 100 as number | null, driver: ALICE },
    });
    // When
    rerender({ since: null, driver: ALICE });
    // Then
    expect(playChime).toHaveBeenCalledTimes(1);
    expect(vibrateSwitch).toHaveBeenCalledTimes(1);
  });
});
