/**
 * Session の画面の判断（#370。`Session.tsx` から出した純粋関数）。
 * ナビは直前に実際に運転した人（#374）。
 */
import { describe, expect, it } from "vitest";
import {
  URGENT_THRESHOLD_SECONDS,
  displayRemainingSeconds,
  driverNames,
  isDriverSwitch,
  isUrgent,
  orbitSizes,
  progressPercent,
} from "../../src/ui/session-view.js";

describe("displayRemainingSeconds", () => {
  it.each([
    [300, 299.4, 299.4],
    [300, 300.6, 300],
    [300, 0, 0],
  ])("間隔 %i 秒・残り %f 秒 → %f 秒（間隔を上限に抑える）", (interval, left, expected) => {
    expect(displayRemainingSeconds(interval, left)).toBe(expected);
  });
});

describe("driverNames", () => {
  const names = ["あや", "いずみ", "うた"];
  const noSkips = [null, null, null] as const;
  const at = (currentIndex: number, nextIndex: number | null, navigatorEnabled: boolean, previousDriverIndex: number | null = null) =>
    driverNames({ names, skipReasons: noSkips, currentIndex, nextIndex, previousDriverIndex, navigatorEnabled });

  it.each([
    // currentIndex, nextIndex, navigatorEnabled, previousDriverIndex → 今・次・ナビ
    [1, 2, true, 0, { current: "いずみ", next: "うた", navigator: "あや" }],
    [0, 1, true, 2, { current: "あや", next: "いずみ", navigator: "うた" }],
    [1, null, true, 0, { current: "いずみ", next: "—", navigator: "あや" }],
    [1, 2, false, 0, { current: "いずみ", next: "うた", navigator: null }],
    [5, 9, true, null, { current: "—", next: "—", navigator: null }],
  ] as const)("今 %i・次 %s・ナビ有効 %s・直前 %s", (currentIndex, nextIndex, navigatorEnabled, previousDriverIndex, expected) => {
    expect(at(currentIndex, nextIndex, navigatorEnabled, previousDriverIndex)).toEqual(expected);
  });

  // #374: ナビは輪の上の 1 つ前の席ではなく、直前に実際に運転した人（サーバーが持つ）。
  // 分からない・務められないときは出さない（輪が 1 人のときと同じ作法）。
  it.each([
    // 名前の並び: あや(0)・いずみ(1)・うた(2)。いまは うた(2) が運転中。
    // previousDriverIndex, skipReasons → ナビ
    ["1 つ前の席（いずみ）が見送り中で飛ばされた → 実際に運転した あや", 0, [null, "stood-down", null], "あや"],
    ["1 つ前の席（いずみ）が不在で飛ばされた → あや", 0, [null, "away", null], "あや"],
    ["飛ばされた いずみ が戻っても、運転していないので出さない → あや", 0, [null, null, null], "あや"],
    ["強制指名で輪の向こうから来た（直前は いずみ）", 1, [null, null, null], "いずみ"],
    ["直前のドライバーが分からない（交代前・項目が無い）", null, [null, null, null], null],
    ["直前のドライバーが運転の後に見送りへ切り替えた → 務められないので出さない", 1, [null, "stood-down", null], null],
    ["直前のドライバーが切断した → 出さない", 1, [null, "disconnected", null], null],
    // 不在（away）は timer のタブに居ないだけ。タブを切り替えるたびに全員の画面でナビが点滅しないよう隠さない
    ["直前のドライバーが不在（timer のタブに居ないだけ）→ 出す", 1, [null, "away", null], "いずみ"],
    ["直前のドライバーの添字が輪の外（造作）→ 出さない", 7, [null, null, null], null],
  ] as const)("%s", (_label, previousDriverIndex, skipReasons, expected) => {
    expect(
      driverNames({ names, skipReasons, currentIndex: 2, nextIndex: 0, previousDriverIndex, navigatorEnabled: true }).navigator,
    ).toBe(expected);
  });

  it("輪が空なら、今も次も — でナビは無い", () => {
    expect(
      driverNames({ names: [], skipReasons: [], currentIndex: 0, nextIndex: null, previousDriverIndex: null, navigatorEnabled: true }),
    ).toEqual({
      current: "—",
      next: "—",
      navigator: null,
    });
  });
});

describe("isUrgent", () => {
  it.each([
    [true, URGENT_THRESHOLD_SECONDS, true],
    [true, URGENT_THRESHOLD_SECONDS + 0.5, false],
    [true, 0, true],
    [false, 3, false],
  ])("動いている %s・残り %f 秒 → %s", (running, remaining, expected) => {
    expect(isUrgent(running, remaining)).toBe(expected);
  });
});

describe("progressPercent", () => {
  it.each([
    [60, 60, 0],
    [60, 15, 75],
    [60, 0, 100],
    [0, 0, 100],
  ])("間隔 %i 秒・残り %i 秒 → %i%（間隔 0 は 1 秒として扱う）", (interval, remaining, expected) => {
    expect(progressPercent(interval, remaining)).toBe(expected);
  });
});

describe("orbitSizes", () => {
  it.each([
    [true, 1280, { orbit: 460, ring: 300 }],
    [true, 360, { orbit: 460, ring: 300 }],
    [false, 360, { orbit: 278, ring: 183 }],
    [false, 300, { orbit: 248, ring: 163 }],
    [false, 600, { orbit: 340, ring: 224 }],
  ] as const)("広い %s・幅 %i → %o", (wide, width, expected) => {
    expect(orbitSizes(wide, width)).toEqual(expected);
  });
});

describe("isDriverSwitch（交代の知らせと休憩の知らせが共有する交代の判定）", () => {
  it.each([
    ["添字も名前も変わった", true, { index: 0, name: "A" }, { index: 1, name: "B" }],
    ["並べ替え（添字だけ変わった）", false, { index: 0, name: "A" }, { index: 1, name: "A" }],
    ["改名（名前だけ変わった）", false, { index: 0, name: "A" }, { index: 0, name: "A2" }],
    ["現状維持", false, { index: 0, name: "A" }, { index: 0, name: "A" }],
  ] as const)("Given %s / When 判定する / Then %s", (_label, expected, prev, next) => {
    // Given
    const before = { ...prev };
    // When
    const switched = isDriverSwitch(before, next);
    // Then
    expect(switched).toBe(expected);
  });
});
