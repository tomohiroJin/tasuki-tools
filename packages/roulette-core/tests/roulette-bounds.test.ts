import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { PRESS_AUTO_STOP_MS } from "../src/limits.js";
import {
  INITIAL_ROULETTE_STATE,
  setMode,
  startSpin,
  stopPress,
  toView,
  type Member,
  type RouletteMode,
  type RouletteState,
  type SpinInput,
} from "../src/index.js";
import { foldCase } from "./support/name-conflict.js";

/**
 * 境界の値（#522）。上限・下限ちょうどの値と、開始時刻が 0 でない回転を、性質と例で守る。
 *
 * 期待値は実装の比較式を写さず、仕様の値（輪は 24 席まで・止まる位置は 0.2 以上 0.8 以下・
 * 押して止めるは 30 秒で自動に止まる）を直接書く。種と回数は固定する（ISSUE #522 の共通の節と、
 * timer-core の `properties.test.ts` の書き方に合わせる）。性質テストは境界ちょうどの値と、そのすぐ外の値を
 * `fc.constantFrom` で必ず混ぜて生成する（一様な乱数だけでは境界を踏まないため）。
 *
 * @requirements #94 E6（入る人の数）・#401 押して止める P3〜P5（時刻の窓）
 */

const MODES: readonly RouletteMode[] = ["once", "order", "press"];

function many(n: number): Member[] {
  return Array.from({ length: n }, (_, i) => ({ id: `p-${i}`, name: `人${i}`, present: true }));
}

function input(patch: Partial<SpinInput> = {}): SpinInput {
  return { members: many(4), spunBy: "あおい", now: 1000, randomInt: () => 0, randomSettle: () => 0.5, conflicts: foldCase, ...patch };
}

function inMode(mode: RouletteMode): RouletteState {
  return setMode(INITIAL_ROULETTE_STATE, mode, 0)._unsafeUnwrap();
}

describe("輪の人数の上限（24 席）", () => {
  it.each(MODES)("%s: 24 人ちょうどは回せて、25 人は ROULETTE_TOO_MANY", (mode) => {
    // Given / When / Then
    expect(startSpin(inMode(mode), input({ members: many(24) })).isOk()).toBe(true);
    expect(startSpin(inMode(mode), input({ members: many(25) }))._unsafeUnwrapErr()).toEqual({ code: "ROULETTE_TOO_MANY" });
  });

  it("性質: 決め方と人数の直積で、24 人までは回せて、それを超えると拒む（境界の人数を必ず混ぜる。種と回数を固定）", () => {
    const people = fc.oneof(fc.constantFrom(2, 23, 24, 25, 26), fc.integer({ min: 2, max: 40 }));
    fc.assert(
      fc.property(fc.constantFrom(...MODES), people, (mode, n) => {
        const r = startSpin(inMode(mode), input({ members: many(n) }));
        if (n <= 24) return r.isOk();
        return r.isErr() && r.error.code === "ROULETTE_TOO_MANY";
      }),
      { seed: 522, numRuns: 200 },
    );
  });
});

describe("止まる位置（settle）の範囲", () => {
  it.each(MODES)("%s: 0.2 と 0.8 ちょうどは通り、そのすぐ外は INVALID_SETTLE", (mode) => {
    // Given / When / Then
    for (const settle of [0.2, 0.8]) {
      expect(startSpin(inMode(mode), input({ randomSettle: () => settle })).isOk()).toBe(true);
    }
    for (const settle of [0.1999, 0.8001, 0, 1, Number.NaN]) {
      expect(startSpin(inMode(mode), input({ randomSettle: () => settle }))._unsafeUnwrapErr()).toEqual({ code: "INVALID_SETTLE" });
    }
  });

  it("性質: 0.2〜0.8 の値は通り、それより外（境界のすぐ外を含む）は拒む（種と回数を固定）", () => {
    const inside = fc.oneof(fc.constantFrom(0.2, 0.8), fc.double({ min: 0.2, max: 0.8, noNaN: true }));
    const outside = fc.oneof(
      fc.constantFrom(0.1999, 0.8001, 0, 1, Number.NaN),
      fc.double({ min: -10, max: 0.2, maxExcluded: true, noNaN: true }),
      fc.double({ min: 0.8, max: 10, minExcluded: true, noNaN: true }),
    );
    fc.assert(
      fc.property(fc.constantFrom(...MODES), inside, outside, (mode, ok, ng) => {
        const accepted = startSpin(inMode(mode), input({ randomSettle: () => ok })).isOk();
        const rejected = startSpin(inMode(mode), input({ randomSettle: () => ng }));
        return accepted && rejected.isErr() && rejected.error.code === "INVALID_SETTLE";
      }),
      { seed: 522, numRuns: 200 },
    );
  });

  it("性質: 押した位置の席の中の位置は 0 以上 1 未満を採り、それ以外（0 の手前・1 ちょうど）は拒む（種と回数を固定）", () => {
    const s = startSpin(inMode("press"), input())._unsafeUnwrap();
    const inside = fc.oneof(fc.constantFrom(0, 0.9999999999999999), fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true }));
    const outside = fc.oneof(
      fc.constantFrom(1, 1.0000000000000002, -0.0001, Number.NaN),
      fc.double({ min: -10, max: 0, maxExcluded: true, noNaN: true }),
      fc.double({ min: 1, max: 10, noNaN: true }),
    );
    fc.assert(
      fc.property(inside, outside, (ok, ng) => {
        const taken = stopPress(s, { seq: 1, index: 0, settle: ok, by: "x", now: 1100 });
        const refused = stopPress(s, { seq: 1, index: 0, settle: ng, by: "x", now: 1100 });
        return taken.isOk() && taken.value !== s && refused.isErr() && refused.error.code === "ROULETTE_STOP_INVALID";
      }),
      { seed: 522, numRuns: 200 },
    );
  });

  it("押して止める: 席の中の位置は 0 ちょうどを採り、1 ちょうどは拒む", () => {
    // Given
    const s = startSpin(inMode("press"), input())._unsafeUnwrap();
    // When / Then
    const zero = stopPress(s, { seq: 1, index: 0, settle: 0, by: "x", now: 1100 })._unsafeUnwrap();
    expect(zero.lastSpin?.press?.stop).toEqual({ index: 0, settle: 0, by: "x", atMs: 100 });
    expect(stopPress(s, { seq: 1, index: 0, settle: 1, by: "x", now: 1100 })._unsafeUnwrapErr()).toEqual({ code: "ROULETTE_STOP_INVALID" });
  });
});

describe("回し始めの時刻が 0 でないときの経過（now - startedAt）", () => {
  const START = 100_000;

  function pressSpinningAt(startedAt: number): RouletteState {
    return startSpin(inMode("press"), input({ now: startedAt }))._unsafeUnwrap();
  }

  it("押して止める: 回し始めから 30 秒の手前までは回転中で、ちょうどで止まる", () => {
    // Given
    const s = pressSpinningAt(START);
    // When / Then
    expect(startSpin(s, input({ now: START + PRESS_AUTO_STOP_MS - 1 }))._unsafeUnwrapErr()).toEqual({ code: "ROULETTE_SPINNING" });
    expect(startSpin(s, input({ now: START + PRESS_AUTO_STOP_MS })).isOk()).toBe(true);
  });

  it("押して止める: 回し始めから 1 秒後の押下を採り、経過 atMs は 1000", () => {
    // Given
    const s = pressSpinningAt(START);
    // When
    const stopped = stopPress(s, { seq: 1, index: 2, settle: 0.5, by: "健太", now: START + 1000 })._unsafeUnwrap();
    // Then
    expect(stopped.lastSpin?.press?.stop).toEqual({ index: 2, settle: 0.5, by: "健太", atMs: 1000 });
  });

  it("押して止める: 回し始めから 30 秒を過ぎた押下は何も変えない", () => {
    // Given
    const s = pressSpinningAt(START);
    // When / Then
    expect(stopPress(s, { seq: 1, index: 2, settle: 0.5, by: "x", now: START + PRESS_AUTO_STOP_MS })._unsafeUnwrap()).toBe(s);
  });

  it("押して止める: wire の形は 30 秒の手前まで止まりが無く、ちょうどで自動に止まる", () => {
    // Given
    const s = pressSpinningAt(START);
    // When / Then
    expect(toView(s, START + 1000).spin?.press?.stop).toBeNull();
    expect(toView(s, START + PRESS_AUTO_STOP_MS - 1).spin?.press?.stop).toBeNull();
    expect(toView(s, START + PRESS_AUTO_STOP_MS).spin?.press?.stop).toMatchObject({ by: null, atMs: PRESS_AUTO_STOP_MS });
  });

  it("性質: 開始時刻がどの値でも、30 秒の手前は回転中で押下が採られ、ちょうど以降は止まる（境界の時刻を必ず混ぜる。種と回数を固定）", () => {
    const started = fc.oneof(fc.constantFrom(0, 1), fc.integer({ min: 0, max: 1_000_000_000 }));
    const early = fc.oneof(fc.constantFrom(0, PRESS_AUTO_STOP_MS - 1), fc.integer({ min: 0, max: PRESS_AUTO_STOP_MS - 1 }));
    const late = fc.oneof(fc.constantFrom(PRESS_AUTO_STOP_MS, PRESS_AUTO_STOP_MS + 1), fc.integer({ min: PRESS_AUTO_STOP_MS, max: PRESS_AUTO_STOP_MS * 4 }));
    fc.assert(
      fc.property(started, early, late, (startedAt, e, l) => {
        const s = pressSpinningAt(startedAt);
        const taken = stopPress(s, { seq: 1, index: 0, settle: 0.5, by: "x", now: startedAt + e })._unsafeUnwrap();
        const ignored = stopPress(s, { seq: 1, index: 0, settle: 0.5, by: "x", now: startedAt + l })._unsafeUnwrap();
        const spinningEarly = startSpin(s, input({ now: startedAt + e })).isErr();
        const freeLate = startSpin(s, input({ now: startedAt + l })).isOk();
        const viewEarly = toView(s, startedAt + e).spin?.press?.stop === null;
        const viewLate = toView(s, startedAt + l).spin?.press?.stop?.atMs === PRESS_AUTO_STOP_MS;
        return taken.lastSpin?.press?.stop?.atMs === e && ignored === s && spinningEarly && freeLate && viewEarly && viewLate;
      }),
      { seed: 522, numRuns: 200 },
    );
  });
});
