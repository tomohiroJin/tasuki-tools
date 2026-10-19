import { describe, expect, it } from "vitest";
import { MAX_PICK, SETTLE_MAX, SETTLE_MIN, spinDurationMs } from "../src/limits.js";
import {
  INITIAL_ROULETTE_STATE,
  setPickCount,
  startSpin,
  toView,
  type Member,
  type RouletteState,
  type SpinInput,
} from "../src/index.js";
import { foldCase } from "./support/name-conflict.js";

function many(n: number): Member[] {
  return Array.from({ length: n }, (_, i) => ({ id: `p-${i}`, name: `人${i}`, present: true }));
}

function spinInput(patch: Partial<SpinInput> = {}): SpinInput {
  return { members: many(4), spunBy: "あおい", now: 1000, randomInt: () => 0, randomSettle: () => 0.5, conflicts: foldCase, ...patch };
}

function withPickCount(count: number): RouletteState {
  return setPickCount(INITIAL_ROULETTE_STATE, count)._unsafeUnwrap();
}

/**
 * @requirements #401 E1・E2（選ぶ人数）
 */
describe("setPickCount（選ぶ人数）", () => {
  it("既定は 1 で、既定の状態は凍結されている", () => {
    // Given / When / Then
    expect(INITIAL_ROULETTE_STATE.pickCount).toBe(1);
    expect(Object.isFrozen(INITIAL_ROULETTE_STATE)).toBe(true);
  });

  it("1 と上限の 4 は通る", () => {
    // Given / When / Then
    expect(withPickCount(1).pickCount).toBe(1);
    expect(withPickCount(MAX_PICK).pickCount).toBe(4);
  });

  it("0・5・小数は INVALID_PICK_COUNT で、状態は変わらない", () => {
    // Given / When / Then
    for (const count of [0, 5, 1.5, Number.NaN]) {
      expect(setPickCount(INITIAL_ROULETTE_STATE, count)._unsafeUnwrapErr()).toEqual({ code: "INVALID_PICK_COUNT" });
    }
  });

  it("同じ値なら同じ参照を返す（変わらない操作は配らない）", () => {
    // Given
    const s = withPickCount(2);
    // When / Then
    expect(setPickCount(s, 2)._unsafeUnwrap()).toBe(s);
  });
});

/**
 * @requirements #401 E3・E5・E6（k 人を回す）
 */
describe("startSpin（k 人を回す）", () => {
  it("picks は選ぶ人数の件数で、winnerIndex と settle は 1 人目の写し", () => {
    // Given: 4 人・k = 3・settle は呼ぶたびに変わる
    const settles = [0.3, 0.5, 0.7];
    let call = 0;
    // When
    const s = startSpin(withPickCount(3), spinInput({ randomSettle: () => settles[call++] ?? 0.5 }))._unsafeUnwrap();
    // Then
    const spin = s.lastSpin;
    expect(spin?.picks).toEqual([
      { index: 0, settle: 0.3 },
      { index: 1, settle: 0.5 },
      { index: 2, settle: 0.7 },
    ]);
    expect(spin?.winnerIndex).toBe(0);
    expect(spin?.settle).toBe(0.3);
  });

  it("k = 1 の picks は当たり 1 件", () => {
    // Given / When
    const s = startSpin(INITIAL_ROULETTE_STATE, spinInput())._unsafeUnwrap();
    // Then
    expect(s.lastSpin?.picks).toEqual([{ index: 0, settle: 0.5 }]);
  });

  it("入る人が選ぶ人数 + 1 に満たなければ ROULETTE_TOO_FEW_FOR_PICK。ちょうどなら回せる", () => {
    // Given: k = 3
    const s = withPickCount(3);
    // When / Then
    expect(startSpin(s, spinInput({ members: many(3) }))._unsafeUnwrapErr()).toEqual({ code: "ROULETTE_TOO_FEW_FOR_PICK" });
    expect(startSpin(s, spinInput({ members: many(4) })).isOk()).toBe(true);
  });

  it("k = 1 の下限は #94 と同じ ROULETTE_TOO_FEW", () => {
    // Given / When / Then
    expect(startSpin(INITIAL_ROULETTE_STATE, spinInput({ members: many(1) }))._unsafeUnwrapErr()).toEqual({
      code: "ROULETTE_TOO_FEW",
    });
  });

  it("k 人の回転の間は回せず、全体の長さが過ぎたら回せる", () => {
    // Given: k = 3 で 1000ms に回した
    const s = startSpin(withPickCount(3), spinInput())._unsafeUnwrap();
    const end = 1000 + spinDurationMs(3);
    // When / Then: 4000ms（1 人ぶん）を過ぎても、まだ回っている
    expect(startSpin(s, spinInput({ now: 1000 + 5000 }))._unsafeUnwrapErr()).toEqual({ code: "ROULETTE_SPINNING" });
    expect(startSpin(s, spinInput({ now: end - 1 }))._unsafeUnwrapErr()).toEqual({ code: "ROULETTE_SPINNING" });
    expect(startSpin(s, spinInput({ now: end })).isOk()).toBe(true);
  });

  it("回っている間に選ぶ人数を変えても、その回転は変わらない", () => {
    // Given: k = 2 で回した
    const s = startSpin(withPickCount(2), spinInput())._unsafeUnwrap();
    // When
    const changed = setPickCount(s, 4)._unsafeUnwrap();
    // Then: 回転はそのまま。長さも 2 人ぶん
    expect(changed.lastSpin).toBe(s.lastSpin);
    expect(toView(changed, 1000).spin?.durationMs).toBe(spinDurationMs(2));
  });

  it("settle を範囲の外で返す乱数源は、何人目でも INVALID_SETTLE", () => {
    // Given: 2 回目だけ範囲の外
    const values = [0.5, SETTLE_MAX + 0.1];
    let call = 0;
    // When
    const r = startSpin(withPickCount(2), spinInput({ randomSettle: () => values[call++] ?? 0.5 }));
    // Then
    expect(r._unsafeUnwrapErr()).toEqual({ code: "INVALID_SETTLE" });
    expect(SETTLE_MIN).toBeLessThan(0.5);
  });
});

/**
 * @requirements #401 E1・E3（wire へ載せる形）
 */
describe("toView（選ぶ人数）", () => {
  it("pickCount と picks を載せ、durationMs は k 人ぶん", () => {
    // Given
    const s = startSpin(withPickCount(2), spinInput())._unsafeUnwrap();
    // When
    const v = toView(s, 1000);
    // Then
    expect(v.pickCount).toBe(2);
    expect(v.spin?.picks).toEqual([
      { index: 0, settle: 0.5 },
      { index: 1, settle: 0.5 },
    ]);
    expect(v.spin?.durationMs).toBe(spinDurationMs(2));
  });

  it("経過は k 人ぶんの長さに丸める", () => {
    // Given
    const s = startSpin(withPickCount(4), spinInput({ members: many(5) }))._unsafeUnwrap();
    // When / Then
    expect(toView(s, 1000 + 6000).spin?.elapsedMs).toBe(6000);
    expect(toView(s, 1000 + 99_999).spin?.elapsedMs).toBe(spinDurationMs(4));
  });
});
