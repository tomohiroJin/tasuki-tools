/**
 * Session の画面の判断（#370。`Session.tsx` から出した純粋関数）。
 * 式は移す前のまま（ナビの計算は #374 で直す）。
 */
import { describe, expect, it } from "vitest";
import {
  URGENT_THRESHOLD_SECONDS,
  displayRemainingSeconds,
  driverNames,
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
  const at = (currentIndex: number, nextIndex: number | null, navigatorEnabled: boolean, rotationLength = 3) =>
    driverNames({ names, rotationLength, currentIndex, nextIndex, navigatorEnabled });

  it.each([
    // currentIndex, nextIndex, navigatorEnabled → 今・次・ナビ
    [1, 2, true, { current: "いずみ", next: "うた", navigator: "あや" }],
    [0, 1, true, { current: "あや", next: "いずみ", navigator: "うた" }],
    [1, null, true, { current: "いずみ", next: "—", navigator: "あや" }],
    [1, 2, false, { current: "いずみ", next: "うた", navigator: null }],
    [5, 9, true, { current: "—", next: "—", navigator: "いずみ" }],
  ] as const)("今 %i・次 %s・ナビ %s", (currentIndex, nextIndex, navigatorEnabled, expected) => {
    expect(at(currentIndex, nextIndex, navigatorEnabled)).toEqual(expected);
  });

  it("輪が 1 人ならナビは無い", () => {
    expect(driverNames({ names: ["あや"], rotationLength: 1, currentIndex: 0, nextIndex: 0, navigatorEnabled: true }).navigator).toBeNull();
  });

  it("輪が空なら、今も次も — でナビは無い", () => {
    expect(driverNames({ names: [], rotationLength: 0, currentIndex: 0, nextIndex: null, navigatorEnabled: true })).toEqual({
      current: "—",
      next: "—",
      navigator: null,
    });
  });

  it("ナビの添字は輪の長さで回す（名前の数ではない・移す前の式のまま）", () => {
    // 輪 4・名前 3（造作）: 先頭が運転中なら 1 つ前は 4 番目で、名前が無い
    expect(driverNames({ names, rotationLength: 4, currentIndex: 0, nextIndex: 1, navigatorEnabled: true }).navigator).toBeNull();
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
