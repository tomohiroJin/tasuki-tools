/**
 * 休憩の表示の純粋関数（#402）。React にも時計にも依存しない。
 */
import { describe, it, expect } from "vitest";
import {
  breakElapsedMs,
  isBreakEnabled,
  isOnBreakRoom,
  isSuggestBandVisible,
  roundsEstimateMinutes,
} from "../../src/ui/break-view.js";
import { aRoomView } from "../support/room-view.js";

describe("break-view", () => {
  it("Given 休憩の設定が無い / When 有効か見る / Then 偽", () => {
    expect(isBreakEnabled({ intervalMinutes: 5 })).toBe(false);
  });
  it("Given 経過時間の設定 / When 有効か見る / Then 真", () => {
    expect(isBreakEnabled({ intervalMinutes: 5, break: { trigger: "elapsed", every: 60, mode: "auto" } })).toBe(true);
  });
  it("Given 条件が none / When 有効か見る / Then 偽", () => {
    expect(isBreakEnabled({ intervalMinutes: 5, break: { trigger: "none", every: 0, mode: "auto" } })).toBe(false);
  });
  it("Given session.break が無い snapshot（古いサーバー） / When 休憩中か見る / Then 偽", () => {
    expect(isOnBreakRoom(aRoomView({}))).toBe(false);
  });
  it("Given since が入っている / When 休憩中か見る / Then 真", () => {
    expect(isOnBreakRoom(aRoomView({ session: { break: { since: 1, suggestedAtSwitches: null } } }))).toBe(true);
  });
  it("Given 休憩の開始 1000・端末の補正 +200 / When 端末の今が 61_000 / Then 経過 60_200", () => {
    expect(breakElapsedMs(1000, 61_000, 200)).toBe(60_200);
  });
  it("Given 開始より前を指す時計 / When 経過を見る / Then 負にならず 0", () => {
    expect(breakElapsedMs(5000, 1000, 0)).toBe(0);
  });
  it.each([
    [{ since: null, suggestedAtSwitches: 3 }, 3, true],
    [{ since: null, suggestedAtSwitches: 3 }, 4, false], // 次の交代で消える
    [{ since: 1, suggestedAtSwitches: 3 }, 3, false], // 休憩中は出さない
    [{ since: null, suggestedAtSwitches: null }, 3, false],
  ])("Given break=%j・交代 %i 回 / When 帯を出すか / Then %s", (brk, switches, expected) => {
    expect(isSuggestBandVisible(aRoomView({ session: { break: brk, totalSwitches: switches } }))).toBe(expected);
  });
  it("Given session.break が無い / When 帯を出すか / Then 偽", () => {
    expect(isSuggestBandVisible(aRoomView({}))).toBe(false);
  });
  it("Given 3 分交代・2 人・1 周 / When 目安を出す / Then 約 6 分", () => {
    expect(roundsEstimateMinutes(3, 2, 1)).toBe(6);
  });
  it("Given 5 分交代・3 人・2 周 / When 目安を出す / Then 30 分（積。和なら 10 になる）", () => {
    expect(roundsEstimateMinutes(5, 3, 2)).toBe(30);
  });
});
