import { describe, expect, it } from "vitest";
import { SPIN_DURATION_MS } from "../src/limits.js";
import {
  INITIAL_ROULETTE_STATE,
  prune,
  removeGuest,
  resetOrder,
  setIncluded,
  setMode,
  setPickCount,
  startSpin,
  toView,
  addGuest,
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

function orderState(): RouletteState {
  return setMode(INITIAL_ROULETTE_STATE, "order", 0)._unsafeUnwrap();
}

/** 回して、止まった後の時刻を返す（次に回せるように） */
function spinAt(state: RouletteState, now: number, patch: Partial<SpinInput> = {}): RouletteState {
  return startSpin(state, spinInput({ now, ...patch }))._unsafeUnwrap();
}

/**
 * @requirements #401 順番に回す T1・T8（決め方）
 */
describe("setMode（決め方）", () => {
  it("既定は「1 回で決める」で、回は無い", () => {
    // Given / When / Then
    expect(INITIAL_ROULETTE_STATE.mode).toBe("once");
    expect(INITIAL_ROULETTE_STATE.order).toBeNull();
  });

  it("「順番に回す」へ変えられ、同じ値なら同じ参照を返す", () => {
    // Given
    const s = orderState();
    // When / Then
    expect(s.mode).toBe("order");
    expect(setMode(s, "order", 0)._unsafeUnwrap()).toBe(s);
  });

  it("回の途中は ROULETTE_ROUND_IN_PROGRESS で拒む", () => {
    // Given: 4 人のうち 1 人の番が決まった
    const s = spinAt(orderState(), 1000);
    // When / Then
    expect(setMode(s, "once", 1000 + SPIN_DURATION_MS)._unsafeUnwrapErr()).toEqual({ code: "ROULETTE_ROUND_IN_PROGRESS" });
  });

  it("回っている間は ROULETTE_SPINNING で拒む（1 回で決めるの回転も）", () => {
    // Given
    const s = spinAt(INITIAL_ROULETTE_STATE, 1000);
    // When / Then
    expect(setMode(s, "order", 1001)._unsafeUnwrapErr()).toEqual({ code: "ROULETTE_SPINNING" });
  });

  it("回が終わっていれば変えられ、回は捨てる", () => {
    // Given: 2 人の回を終える（1 回回して、最後の 1 人を出す）
    const two = { members: many(2) };
    const s1 = spinAt(orderState(), 1000, two);
    const s2 = spinAt(s1, 1000 + SPIN_DURATION_MS, two);
    expect(s2.order?.finished).toBe(true);
    // When
    const s3 = setMode(s2, "once", 1000 + SPIN_DURATION_MS)._unsafeUnwrap();
    // Then
    expect(s3.mode).toBe("once");
    expect(s3.order).toBeNull();
  });
});

/**
 * @requirements #401 順番に回す T2・T3・T4・T6・T7
 */
describe("startSpin（順番に回す）", () => {
  it("まだの人から 1 人を引き、その人が 1 番になる。選ぶ人数と一周の記録は使わない", () => {
    // Given: 選ぶ人数 3 でも順番に回すときは 1 人
    const base = setPickCount(orderState(), 3)._unsafeUnwrap();
    // When: 4 人のうち添字 2 を引く
    const s = spinAt(base, 1000, { randomInt: () => 2 });
    // Then
    expect(s.lastSpin?.picks).toEqual([{ index: 2, settle: 0.5 }]);
    expect(s.lastSpin?.turn).toBe(1);
    expect(s.lastSpin?.wheel.map((e) => e.id)).toEqual(["p-0", "p-1", "p-2", "p-3"]);
    expect(s.order).toEqual({ done: [{ id: "p-2", name: "人2" }], finished: false });
    expect(s.drawn).toEqual([]);
    expect(s.pickCount).toBe(3);
  });

  it("次の回転の円盤から、済んだ人は抜ける", () => {
    // Given
    const s1 = spinAt(orderState(), 1000, { randomInt: () => 2 });
    // When
    const s2 = spinAt(s1, 1000 + SPIN_DURATION_MS, { randomInt: () => 0 });
    // Then
    expect(s2.lastSpin?.wheel.map((e) => e.id)).toEqual(["p-0", "p-1", "p-3"]);
    expect(s2.lastSpin?.turn).toBe(2);
    expect(s2.order?.done.map((e) => e.id)).toEqual(["p-2", "p-0"]);
  });

  it("まだの人から一様に引く（randomInt にはまだの人の数を渡す）", () => {
    // Given
    const asked: number[] = [];
    const randomInt = (n: number) => {
      asked.push(n);
      return n - 1;
    };
    // When: 4 人 → 3 人 → 2 人
    const s1 = spinAt(orderState(), 1000, { randomInt });
    const s2 = spinAt(s1, 1000 + SPIN_DURATION_MS, { randomInt });
    spinAt(s2, 1000 + 2 * SPIN_DURATION_MS, { randomInt });
    // Then
    expect(asked).toEqual([4, 3, 2]);
  });

  it("まだの人が 1 人なら回さずにその人を出し、回が終わる（回転は変えない）", () => {
    // Given: 2 人のうち 1 人の番が決まった
    const two = { members: many(2) };
    const s1 = spinAt(orderState(), 1000, { ...two, randomInt: () => 0 });
    let called = false;
    // When
    const s2 = spinAt(s1, 1000 + SPIN_DURATION_MS, {
      ...two,
      randomInt: () => {
        called = true;
        return 0;
      },
    });
    // Then
    expect(called).toBe(false);
    expect(s2.lastSpin).toBe(s1.lastSpin);
    expect(s2.order).toEqual({ done: [{ id: "p-0", name: "人0" }, { id: "p-1", name: "人1" }], finished: true });
  });

  it("回が終わった後に押すと、新しい回の 1 番を回す", () => {
    // Given
    const two = { members: many(2) };
    const s2 = spinAt(spinAt(orderState(), 1000, two), 1000 + SPIN_DURATION_MS, two);
    // When
    const s3 = spinAt(s2, 1000 + SPIN_DURATION_MS, { ...two, randomInt: () => 1 });
    // Then
    expect(s3.lastSpin?.turn).toBe(1);
    expect(s3.lastSpin?.seq).toBe(2);
    expect(s3.order).toEqual({ done: [{ id: "p-1", name: "人1" }], finished: false });
  });

  it("回の途中で入った人はまだの人に入り、抜けた人・外した人は入らない", () => {
    // Given: 3 人で 1 番が p-0
    const s1 = spinAt(orderState(), 1000, { members: many(3), randomInt: () => 0 });
    // When: p-1 を外し、p-2 が抜け、p-3 が入る
    const excluded = setIncluded(s1, "p-1", false);
    const members = [...many(4)].map((m) => (m.id === "p-2" ? { ...m, present: false } : m));
    const s2 = spinAt(excluded, 1000 + SPIN_DURATION_MS, { members });
    // Then: まだの人は p-3 だけなので、回さずに出して終わる
    expect(s2.order).toEqual({ done: [{ id: "p-0", name: "人0" }, { id: "p-3", name: "人3" }], finished: true });
  });

  it("まだの人が居なくなったら（途中で全員が抜けた）、回を終える", () => {
    // Given: 2 人で 1 番が p-0
    const s1 = spinAt(orderState(), 1000, { members: many(2), randomInt: () => 0 });
    // When: p-1 が抜けた（入る人は p-0 だけ）
    const s2 = spinAt(s1, 1000 + SPIN_DURATION_MS, { members: many(1) });
    // Then
    expect(s2.order).toEqual({ done: [{ id: "p-0", name: "人0" }], finished: true });
    expect(s2.lastSpin).toBe(s1.lastSpin);
  });

  it("新しい回は 2 人から。1 人なら ROULETTE_TOO_FEW", () => {
    // Given / When / Then
    expect(startSpin(orderState(), spinInput({ members: many(1) }))._unsafeUnwrapErr()).toEqual({ code: "ROULETTE_TOO_FEW" });
  });

  it("回っている間は ROULETTE_SPINNING（1 人の回転の長さ）", () => {
    // Given
    const s1 = spinAt(orderState(), 1000);
    // When / Then
    expect(startSpin(s1, spinInput({ now: 1000 + SPIN_DURATION_MS - 1 }))._unsafeUnwrapErr()).toEqual({ code: "ROULETTE_SPINNING" });
  });

  it("まだの人が上限を超えたら ROULETTE_TOO_MANY", () => {
    // Given / When / Then
    expect(startSpin(orderState(), spinInput({ members: many(25) }))._unsafeUnwrapErr()).toEqual({ code: "ROULETTE_TOO_MANY" });
  });

  it("randomInt が契約を破ったら INVALID_RANDOM", () => {
    // Given / When / Then
    expect(startSpin(orderState(), spinInput({ randomInt: () => 4 }))._unsafeUnwrapErr()).toEqual({ code: "INVALID_RANDOM" });
  });

  it("settle が範囲の外なら INVALID_SETTLE", () => {
    // Given / When / Then
    expect(startSpin(orderState(), spinInput({ randomSettle: () => 0.9 }))._unsafeUnwrapErr()).toEqual({ code: "INVALID_SETTLE" });
  });

  it("1 回で決めるときの回転には番が付かない", () => {
    // Given / When
    const s = spinAt(INITIAL_ROULETTE_STATE, 1000);
    // Then
    expect(s.lastSpin?.turn).toBeUndefined();
    expect(s.order).toBeNull();
  });
});

/**
 * @requirements #401 順番に回す T8（最初からやり直す）
 */
describe("resetOrder（最初からやり直す）", () => {
  it("回を捨て、一周の記録は変えない", () => {
    // Given
    const s1 = { ...spinAt(orderState(), 1000), drawn: ["p-9"] };
    // When
    const s2 = resetOrder(s1, 1000 + SPIN_DURATION_MS)._unsafeUnwrap();
    // Then
    expect(s2.order).toBeNull();
    expect(s2.drawn).toEqual(["p-9"]);
  });

  it("回が無ければ同じ参照を返す", () => {
    // Given
    const s = orderState();
    // When / Then
    expect(resetOrder(s, 0)._unsafeUnwrap()).toBe(s);
  });

  it("回っている間は ROULETTE_SPINNING で拒む", () => {
    // Given
    const s1 = spinAt(orderState(), 1000);
    // When / Then
    expect(resetOrder(s1, 1001)._unsafeUnwrapErr()).toEqual({ code: "ROULETTE_SPINNING" });
  });
});

/**
 * @requirements #401 順番に回す T5・T6（名簿から消えた人）
 */
describe("prune・removeGuest（順番の記録）", () => {
  it("番が決まった人が名簿から消えても、番の記録から落とさない。次の番は既出の番と重ならない（PR #418 のレビュー）", () => {
    // Given: 5 人で 1〜3 番が p-0・p-1・p-2
    const five = { members: many(5), randomInt: () => 0 };
    let s = orderState();
    for (let i = 0; i < 3; i++) s = spinAt(s, 1000 + i * SPIN_DURATION_MS, five);
    expect(s.order?.done.map((e) => e.id)).toEqual(["p-0", "p-1", "p-2"]);
    // When: 1 番の p-0 が部屋を抜け、名簿から消える
    const left = many(5).filter((m) => m.id !== "p-0");
    const pruned = prune(s, left.map((m) => m.id));
    const next = spinAt(pruned, 1000 + 3 * SPIN_DURATION_MS, { members: left, randomInt: () => 0 });
    // Then: 記録は変わらず（同じ参照）、次は 4 番
    expect(pruned).toBe(s);
    expect(next.lastSpin?.turn).toBe(4);
    expect(next.order?.done.map((e) => e.id)).toEqual(["p-0", "p-1", "p-2", "p-3"]);
  });

  it("抜けた人が戻ってきても、番が済んだ人として円盤に入らない", () => {
    // Given: 3 人で 1 番が p-0、p-0 が抜けて名簿から消えた
    const s1 = spinAt(orderState(), 1000, { members: many(3), randomInt: () => 0 });
    const pruned = prune(s1, ["p-1", "p-2"]);
    // When: p-0 が戻ってきて、次を回す
    const s2 = spinAt(pruned, 1000 + SPIN_DURATION_MS, { members: many(3) });
    // Then
    expect(s2.lastSpin?.wheel.map((e) => e.id)).toEqual(["p-1", "p-2"]);
  });

  it("ゲストを消しても、番の記録から落とさない（決まったときの名前で残る）", () => {
    // Given: ゲストが 2 番になった
    const g = addGuest(orderState(), "ゲスト", [], foldCase)._unsafeUnwrap();
    const s1 = spinAt(g, 1000, { members: many(1) });
    const s2 = spinAt(s1, 1000 + SPIN_DURATION_MS, { members: many(1) });
    expect(s2.order?.done).toEqual([{ id: "p-0", name: "人0" }, { id: "g-1", name: "ゲスト" }]);
    // When
    const s3 = removeGuest(s2, "g-1");
    // Then
    expect(s3.order).toBe(s2.order);
  });
});

/**
 * @requirements #401 順番に回す T5（wire）
 */
describe("toView（順番に回す）", () => {
  it("決め方・回・番を載せる（写しで渡す）", () => {
    // Given
    const s = spinAt(orderState(), 1000, { randomInt: () => 1 });
    // When
    const view = toView(s, 1000);
    // Then
    expect(view.mode).toBe("order");
    expect(view.order).toEqual({ done: [{ id: "p-1", name: "人1" }], finished: false });
    expect(view.order?.done).not.toBe(s.order?.done);
    expect(view.spin?.turn).toBe(1);
  });

  it("1 回で決めるときは回が null で、回転に番を載せない", () => {
    // Given
    const s = spinAt(INITIAL_ROULETTE_STATE, 1000);
    // When
    const view = toView(s, 1000);
    // Then
    expect(view.mode).toBe("once");
    expect(view.order).toBeNull();
    expect(view.spin !== null && "turn" in view.spin).toBe(false);
  });
});
