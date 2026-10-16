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
  roundsEstimateText,
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
  // 帯は「休憩中でない」かつ「知らせた時点の回数と累計が、どちらも今と同じ」間だけ出る（PR #416 の再レビュー）
  it.each([
    ["いまの切れ目で知らせた", true, { since: null, suggestedAtSwitches: 3, suggestedAtElapsedMs: 900 }, 3, 900],
    ["次の交代で回数が進んだ", false, { since: null, suggestedAtSwitches: 3, suggestedAtElapsedMs: 900 }, 4, 1200],
    // 片方の条件だけが崩れた行。回数・累計のどちらの比較を消しても、どちらかの行が赤になる
    ["累計は一致・回数だけが違う", false, { since: null, suggestedAtSwitches: 3, suggestedAtElapsedMs: 900 }, 4, 900],
    ["回数は一致・累計だけが違う", false, { since: null, suggestedAtSwitches: 3, suggestedAtElapsedMs: 900 }, 3, 1200],
    ["現状維持の交代で累計だけが進んだ", false, { since: null, suggestedAtSwitches: 3, suggestedAtElapsedMs: 900 }, 3, 1200],
    ["休憩中", false, { since: 1, suggestedAtSwitches: 3, suggestedAtElapsedMs: 900 }, 3, 900],
    ["知らせていない", false, { since: null, suggestedAtSwitches: null, suggestedAtElapsedMs: null }, 3, 900],
    ["旧サーバー（累計が無い）", false, { since: null, suggestedAtSwitches: 3 }, 3, 900],
  ] as const)("Given %s / When 帯を出すか / Then %s", (_label, expected, brk, switches, elapsedMs) => {
    const room = aRoomView({ session: { break: brk, totalSwitches: switches } });
    expect(isSuggestBandVisible({ ...room, clock: { ...room.clock, accumulatedElapsedMs: elapsedMs } })).toBe(expected);
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
  it.each([0, 1])(
    "Given 適格な席が %i / When 周回の目安の文を出す / Then 分の目安でなく「1 人では周回の条件は使えません」",
    (seats) => {
      // 1 人では輪が回らないので、周回の目安（席 × 間隔）は「約 0 分」や「約 3 分」の嘘になる（総合レビュー I2）
      expect(roundsEstimateText(3, seats, 1)).toBe("1 人では周回の条件は使えません");
    },
  );
  it("Given 適格な席が 2 / When 周回の目安の文を出す / Then 約 6 分ごと", () => {
    expect(roundsEstimateText(3, 2, 1)).toBe("約 6 分ごと");
  });
});
