import { describe, expect, it } from "vitest";
import { PRESS_AUTO_STOP_MS, PRESS_SEATS_PER_SEC, SPIN_DURATION_MS } from "../src/limits.js";
import {
  INITIAL_ROULETTE_STATE,
  pressPositionAt,
  pressStopOf,
  setMode,
  setPickCount,
  startSpin,
  stopPress,
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
  return { members: many(4), spunBy: "あおい", now: 1000, randomInt: () => 2, randomSettle: () => 0.5, conflicts: foldCase, ...patch };
}

function pressState(): RouletteState {
  return setMode(INITIAL_ROULETTE_STATE, "press", 0)._unsafeUnwrap();
}

/** 4 人で回し始めた（起点の位置は 2.5）。回し始めは 1000 */
function spinning(): RouletteState {
  return startSpin(pressState(), spinInput())._unsafeUnwrap();
}

/**
 * @requirements #401 押して止める P2（回り方）
 */
describe("startSpin（押して止める）", () => {
  it("止まる席を決めずに回し始め、起点の位置と速さを持つ。選ぶ人数と一周の記録は使わない", () => {
    // Given: 選ぶ人数 3 でも 1 人だけ
    const base = setPickCount(pressState(), 3)._unsafeUnwrap();
    // When
    const s = startSpin(base, spinInput())._unsafeUnwrap();
    // Then
    expect(s.lastSpin?.press).toEqual({ p0: 2.5, rate: PRESS_SEATS_PER_SEC, stop: null });
    expect(s.lastSpin?.picks).toEqual([]);
    expect(s.lastSpin?.wheel).toHaveLength(4);
  });

  it("位置は一定の速さで減っていき、席の数で巡る", () => {
    // Given
    const spin = spinning().lastSpin!;
    // When / Then: 1 秒に 20 席 → 0.1 秒で 2 席
    expect(pressPositionAt(spin, 0)).toBeCloseTo(2.5);
    expect(pressPositionAt(spin, 100)).toBeCloseTo(0.5);
    expect(pressPositionAt(spin, 150)).toBeCloseTo(3.5);
  });

  it("押して止める回転でなければ、位置は 0 で止まりも無い", () => {
    // Given
    const once = startSpin(INITIAL_ROULETTE_STATE, spinInput())._unsafeUnwrap().lastSpin!;
    // When / Then
    expect(pressPositionAt(once, 100)).toBe(0);
    expect(pressPositionAt({ ...spinning().lastSpin!, wheel: [] }, 100)).toBe(0);
    expect(pressStopOf(once, PRESS_AUTO_STOP_MS)).toBeNull();
  });

  it("新しい回は 2 人から。上限を超えたら ROULETTE_TOO_MANY", () => {
    // Given / When / Then
    expect(startSpin(pressState(), spinInput({ members: many(1) }))._unsafeUnwrapErr()).toEqual({ code: "ROULETTE_TOO_FEW" });
    expect(startSpin(pressState(), spinInput({ members: many(25) }))._unsafeUnwrapErr()).toEqual({ code: "ROULETTE_TOO_MANY" });
  });

  it("乱数源が契約を破ったら INVALID_RANDOM・INVALID_SETTLE", () => {
    // Given / When / Then
    expect(startSpin(pressState(), spinInput({ randomInt: () => 4 }))._unsafeUnwrapErr()).toEqual({ code: "INVALID_RANDOM" });
    expect(startSpin(pressState(), spinInput({ randomSettle: () => 0.9 }))._unsafeUnwrapErr()).toEqual({ code: "INVALID_SETTLE" });
  });

  it("止まるまでは回せない。止まったらすぐ回せる", () => {
    // Given
    const s = spinning();
    // When / Then
    expect(startSpin(s, spinInput({ now: 1000 + SPIN_DURATION_MS + 5000 }))._unsafeUnwrapErr()).toEqual({ code: "ROULETTE_SPINNING" });
    const stopped = stopPress(s, { seq: 1, index: 1, settle: 0.3, by: "健太", now: 2000 })._unsafeUnwrap();
    expect(startSpin(stopped, spinInput({ now: 2001 }))._unsafeUnwrap().lastSpin?.seq).toBe(2);
  });
});

/**
 * @requirements #401 押して止める P3・P4（押して止める）
 */
describe("stopPress", () => {
  it("押した画面が送った位置で止まり、押した人を持つ。当たりの席も同じにする", () => {
    // Given
    const s = spinning();
    // When
    const stopped = stopPress(s, { seq: 1, index: 3, settle: 0.25, by: "健太", now: 1700 })._unsafeUnwrap();
    // Then
    const spin = stopped.lastSpin!;
    expect(spin.press?.stop).toEqual({ index: 3, settle: 0.25, by: "健太", atMs: 700 });
    expect(spin.winnerIndex).toBe(3);
    expect(spin.picks).toEqual([{ index: 3, settle: 0.25 }]);
  });

  it("最初の押下だけを採る。後から届いた押下・違う回転の押下は何も変えない（同じ参照）", () => {
    // Given
    const stopped = stopPress(spinning(), { seq: 1, index: 3, settle: 0.25, by: "健太", now: 1700 })._unsafeUnwrap();
    // When / Then
    expect(stopPress(stopped, { seq: 1, index: 0, settle: 0.5, by: "あおい", now: 1710 })._unsafeUnwrap()).toBe(stopped);
    const s = spinning();
    expect(stopPress(s, { seq: 2, index: 0, settle: 0.5, by: "あおい", now: 1710 })._unsafeUnwrap()).toBe(s);
  });

  it("回していない・1 回で決めるの回転なら何も変えない", () => {
    // Given
    const once = startSpin(INITIAL_ROULETTE_STATE, spinInput())._unsafeUnwrap();
    // When / Then
    expect(stopPress(INITIAL_ROULETTE_STATE, { seq: 1, index: 0, settle: 0.5, by: "x", now: 0 })._unsafeUnwrap()).toBe(INITIAL_ROULETTE_STATE);
    expect(stopPress(once, { seq: 1, index: 0, settle: 0.5, by: "x", now: 1100 })._unsafeUnwrap()).toBe(once);
  });

  it("30 秒を過ぎた押下は何も変えない（自動で止まった後）", () => {
    // Given
    const s = spinning();
    // When / Then
    expect(stopPress(s, { seq: 1, index: 0, settle: 0.5, by: "x", now: 1000 + PRESS_AUTO_STOP_MS })._unsafeUnwrap()).toBe(s);
  });

  it("席の番号と席の中の位置の形が外れたら ROULETTE_STOP_INVALID", () => {
    // Given
    const s = spinning();
    // When / Then
    for (const [index, settle] of [[4, 0.5], [-1, 0.5], [1.5, 0.5], [1, 1], [1, -0.1], [1, Number.NaN]] as const) {
      expect(stopPress(s, { seq: 1, index, settle, by: "x", now: 1100 })._unsafeUnwrapErr()).toEqual({ code: "ROULETTE_STOP_INVALID" });
    }
  });
});

/**
 * @requirements #401 押して止める P5（誰も押さないとき）
 */
describe("pressStopOf（30 秒で止まる）", () => {
  it("押されていなければ、30 秒の時点で指し針が指していた人に決まる（押した人は無い）", () => {
    // Given
    const spin = spinning().lastSpin!;
    const p = pressPositionAt(spin, PRESS_AUTO_STOP_MS);
    // When / Then
    expect(pressStopOf(spin, PRESS_AUTO_STOP_MS - 1)).toBeNull();
    expect(pressStopOf(spin, PRESS_AUTO_STOP_MS + 5000)).toEqual({
      index: Math.floor(p),
      settle: p - Math.floor(p),
      by: null,
      atMs: PRESS_AUTO_STOP_MS,
    });
  });

  it("30 秒を過ぎたら次を回せる", () => {
    // Given
    const s = spinning();
    // When / Then
    expect(startSpin(s, spinInput({ now: 1000 + PRESS_AUTO_STOP_MS }))._unsafeUnwrap().lastSpin?.seq).toBe(2);
  });
});

/**
 * @requirements #401 押して止める §5（wire）
 */
describe("toView（押して止める）", () => {
  it("回っている間は止まりが null で、長さは 30 秒", () => {
    // Given / When
    const v = toView(spinning(), 1500);
    // Then
    expect(v.mode).toBe("press");
    expect(v.spin?.press).toEqual({ p0: 2.5, rate: PRESS_SEATS_PER_SEC, stop: null });
    expect(v.spin?.durationMs).toBe(PRESS_AUTO_STOP_MS);
    expect(v.spin?.elapsedMs).toBe(500);
  });

  it("30 秒を過ぎたら、自動で止まった位置を載せ、当たりの席もそろえる", () => {
    // Given
    const spin = spinning().lastSpin!;
    const auto = pressStopOf(spin, PRESS_AUTO_STOP_MS)!;
    // When
    const v = toView(spinning(), 1000 + PRESS_AUTO_STOP_MS + 1);
    // Then
    expect(v.spin?.press?.stop).toEqual(auto);
    expect(v.spin?.winnerIndex).toBe(auto.index);
    expect(v.spin?.picks).toEqual([{ index: auto.index, settle: auto.settle }]);
  });
});
