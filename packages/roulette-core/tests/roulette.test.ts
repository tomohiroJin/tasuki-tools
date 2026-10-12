import { describe, expect, it } from "vitest";
import {
  INITIAL_ROULETTE_STATE,
  MAX_GUESTS,
  MAX_WHEEL,
  SPIN_DURATION_MS,
  addGuest,
  prune,
  removeGuest,
  resetCycle,
  setIncluded,
  startSpin,
  toView,
  type Member,
  type RouletteState,
  type SpinInput,
} from "../src/index.js";

const A: Member = { id: "p-a", name: "あおい", present: true };
const B: Member = { id: "p-b", name: "健太", present: true };

function stateWith(patch: Partial<RouletteState>): RouletteState {
  return { ...INITIAL_ROULETTE_STATE, ...patch };
}

function spinInput(patch: Partial<SpinInput> = {}): SpinInput {
  return { members: [A, B], spunBy: "あおい", now: 1000, randomInt: () => 0, randomSettle: () => 0.5, ...patch };
}

function many(n: number): Member[] {
  return Array.from({ length: n }, (_, i) => ({ id: `p-${i}`, name: `人${i}`, present: true }));
}

/**
 * @requirements #94 E1・E5・E6（回す・回転中の拒否・入る人の数）
 */
describe("startSpin（回す）", () => {
  it("回すと seq が 1 になり、wheel は pool の写しになり、drawn に当たりが載る", () => {
    // Given
    const s = startSpin(INITIAL_ROULETTE_STATE, spinInput())._unsafeUnwrap();
    // When
    expect(s.lastSpin).toEqual({
      seq: 1,
      wheel: [
        { id: "p-a", name: "あおい" },
        { id: "p-b", name: "健太" },
      ],
      winnerIndex: 0,
      settle: 0.5,
      spunBy: "あおい",
      startedAt: 1000,
    });
    expect(s.drawn).toEqual(["p-a"]);
  });

  it("seq は 1 ずつ増える", () => {
    // Given
    const first = startSpin(INITIAL_ROULETTE_STATE, spinInput())._unsafeUnwrap();
    const second = startSpin(first, spinInput({ now: 1000 + SPIN_DURATION_MS }))._unsafeUnwrap();
    // When
    expect(second.lastSpin?.seq).toBe(2);
    // 一周の規則が効いている（乱数は常に 0 なのに 2 回目は B）
    expect(second.lastSpin?.winnerIndex).toBe(1);
  });

  it("後から pool を変えても wheel は変わらない（凍結）", () => {
    // Given
    const first = startSpin(INITIAL_ROULETTE_STATE, spinInput())._unsafeUnwrap();
    const edited = setIncluded(first, "p-b", false);
    // When
    expect(edited.lastSpin?.wheel.map((e) => e.id)).toEqual(["p-a", "p-b"]);
  });

  it("回転中の startSpin は ROULETTE_SPINNING で、lastSpin も drawn も変わらない", () => {
    // Given
    const first = startSpin(INITIAL_ROULETTE_STATE, spinInput())._unsafeUnwrap();
    const r = startSpin(first, spinInput({ now: 1000 + SPIN_DURATION_MS - 1 }));
    // When
    expect(r._unsafeUnwrapErr()).toEqual({ code: "ROULETTE_SPINNING" });
    expect(first.lastSpin?.seq).toBe(1);
    expect(first.drawn).toEqual(["p-a"]);
  });

  it("ちょうど SPIN_DURATION_MS 経った時点では回せる（境界）", () => {
    // Given
    const first = startSpin(INITIAL_ROULETTE_STATE, spinInput())._unsafeUnwrap();
    // When
    expect(startSpin(first, spinInput({ now: 1000 + SPIN_DURATION_MS })).isOk()).toBe(true);
  });

  it("まだ一度も回していなければ、時計がどこでも回せる", () => {
    expect(startSpin(INITIAL_ROULETTE_STATE, spinInput({ now: 0 })).isOk()).toBe(true);
  });

  it("入る人が 1 人なら ROULETTE_TOO_FEW", () => {
    // Given
    // When
    expect(startSpin(INITIAL_ROULETTE_STATE, spinInput({ members: [A] }))._unsafeUnwrapErr()).toEqual({
      code: "ROULETTE_TOO_FEW",
    });
  });

  it("離席中を除くと 1 人になる局面も ROULETTE_TOO_FEW", () => {
    // Given
    const away: Member = { ...B, present: false };
    // When
    expect(startSpin(INITIAL_ROULETTE_STATE, spinInput({ members: [A, away] }))._unsafeUnwrapErr().code).toBe(
      "ROULETTE_TOO_FEW",
    );
  });

  it("入る人が MAX_WHEEL 人ちょうどなら回せ、25 人なら ROULETTE_TOO_MANY", () => {
    // Given
    // When
    expect(startSpin(INITIAL_ROULETTE_STATE, spinInput({ members: many(MAX_WHEEL) })).isOk()).toBe(true);
    expect(
      startSpin(INITIAL_ROULETTE_STATE, spinInput({ members: many(MAX_WHEEL + 1) }))._unsafeUnwrapErr(),
    ).toEqual({ code: "ROULETTE_TOO_MANY" });
  });

  it("settle は渡された値をそのまま持ち、範囲外は Err", () => {
    // Given
    const ok = startSpin(INITIAL_ROULETTE_STATE, spinInput({ randomSettle: () => 0.2 }))._unsafeUnwrap();
    // When
    expect(ok.lastSpin?.settle).toBe(0.2);
    expect(startSpin(INITIAL_ROULETTE_STATE, spinInput({ randomSettle: () => 0.19 })).isErr()).toBe(true);
    expect(startSpin(INITIAL_ROULETTE_STATE, spinInput({ randomSettle: () => 0.81 })).isErr()).toBe(true);
  });
});

/**
 * @requirements #94 E7（途中参加でも同じ場所から合流できる）
 */
describe("toView（wire へ載せる形）", () => {
  const spun = startSpin(INITIAL_ROULETTE_STATE, spinInput())._unsafeUnwrap();

  it("回していなければ spin は null", () => {
    expect(toView(INITIAL_ROULETTE_STATE, 0)).toEqual({ excluded: [], guests: [], drawn: [], spin: null });
  });

  it("elapsedMs は送る時点の経過で、startedAt は出力に無い", () => {
    // Given
    const v = toView(spun, 1000 + 2000);
    // When
    expect(v.spin?.elapsedMs).toBe(2000);
    expect(v.spin?.durationMs).toBe(SPIN_DURATION_MS);
    expect(v.spin).not.toHaveProperty("startedAt");
    expect(v.spin?.winnerIndex).toBe(0);
    expect(v.spin?.spunBy).toBe("あおい");
  });

  it("終わった後は durationMs に丸める", () => {
    expect(toView(spun, 1000 + SPIN_DURATION_MS * 10).spin?.elapsedMs).toBe(SPIN_DURATION_MS);
  });

  it("時計が戻っても 0 未満にならない", () => {
    expect(toView(spun, 0).spin?.elapsedMs).toBe(0);
  });
});

/**
 * @requirements #94 E13（足した名前）
 */
describe("外す・足す・消す", () => {
  it("setIncluded は冪等（同じ値を 2 回 → 1 回と同じ）", () => {
    // Given
    const once = setIncluded(INITIAL_ROULETTE_STATE, "p-a", false);
    // When
    expect(setIncluded(once, "p-a", false)).toEqual(once);
    expect(once.excluded).toEqual(["p-a"]);
    const back = setIncluded(once, "p-a", true);
    expect(back.excluded).toEqual([]);
    expect(setIncluded(back, "p-a", true)).toEqual(back);
  });

  it("addGuest は g-1, g-2 と採番する", () => {
    // Given
    const one = addGuest(INITIAL_ROULETTE_STATE, "ゲスト一", [])._unsafeUnwrap();
    const two = addGuest(one, "ゲスト二", [])._unsafeUnwrap();
    // When
    expect(two.guests).toEqual([
      { id: "g-1", name: "ゲスト一" },
      { id: "g-2", name: "ゲスト二" },
    ]);
  });

  it("名前を消して足し直しても ID は再利用されない", () => {
    // Given
    const one = addGuest(INITIAL_ROULETTE_STATE, "ゲスト一", [])._unsafeUnwrap();
    const gone = removeGuest(one, "g-1");
    // When
    expect(addGuest(gone, "ゲスト一", [])._unsafeUnwrap().guests[0]?.id).toBe("g-2");
  });

  it("MAX_GUESTS 件目までは足せ、13 件目は TOO_MANY_GUESTS", () => {
    // Given
    let s = INITIAL_ROULETTE_STATE;
    for (let i = 0; i < MAX_GUESTS; i++) s = addGuest(s, `名前${i}`, [])._unsafeUnwrap();
    // When
    expect(s.guests).toHaveLength(MAX_GUESTS);
    expect(addGuest(s, "あふれ", [])._unsafeUnwrapErr()).toEqual({ code: "TOO_MANY_GUESTS" });
  });

  it("takenNames に有る名前は GUEST_NAME_TAKEN", () => {
    // Given
    // When
    expect(addGuest(INITIAL_ROULETTE_STATE, "あおい", ["あおい"])._unsafeUnwrapErr()).toEqual({
      code: "GUEST_NAME_TAKEN",
    });
  });

  it("すでに足した同じ名前も GUEST_NAME_TAKEN", () => {
    const one = addGuest(INITIAL_ROULETTE_STATE, "ゲスト", [])._unsafeUnwrap();
    expect(addGuest(one, "ゲスト", [])._unsafeUnwrapErr().code).toBe("GUEST_NAME_TAKEN");
  });

  it("removeGuest はゲストと、excluded・drawn の記録を落とす。知らない ID は何も変えない", () => {
    // Given
    const s = stateWith({
      guests: [
        { id: "g-1", name: "一" },
        { id: "g-2", name: "二" },
      ],
      excluded: ["g-1", "p-a"],
      drawn: ["g-1", "g-2"],
      nextGuestSeq: 3,
    });
    // When
    expect(removeGuest(s, "g-1")).toEqual({
      ...s,
      guests: [{ id: "g-2", name: "二" }],
      excluded: ["p-a"],
      drawn: ["g-2"],
    });
    expect(removeGuest(s, "g-99")).toEqual(s);
  });

  it("resetCycle は drawn だけを空にする", () => {
    const s = stateWith({ drawn: ["p-a"], excluded: ["p-b"] });
    expect(resetCycle(s)).toEqual({ ...s, drawn: [] });
  });

  it("prune は known に無い ID を excluded・drawn から落とす（ゲストの ID も known に含める前提）", () => {
    // Given
    const s = stateWith({
      guests: [{ id: "g-1", name: "一" }],
      excluded: ["p-a", "p-gone", "g-1"],
      drawn: ["p-gone", "p-b", "g-1"],
    });
    const pruned = prune(s, ["p-a", "p-b", "g-1"]);
    // When
    expect(pruned.excluded).toEqual(["p-a", "g-1"]);
    expect(pruned.drawn).toEqual(["p-b", "g-1"]);
  });
});
