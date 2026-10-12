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
import { foldCase, neverConflicts } from "./support/name-conflict.js";

const A: Member = { id: "p-a", name: "あおい", present: true };
const B: Member = { id: "p-b", name: "健太", present: true };

function stateWith(patch: Partial<RouletteState>): RouletteState {
  return { ...INITIAL_ROULETTE_STATE, ...patch };
}

function spinInput(patch: Partial<SpinInput> = {}): SpinInput {
  return { members: [A, B], spunBy: "あおい", now: 1000, randomInt: () => 0, randomSettle: () => 0.5, conflicts: foldCase, ...patch };
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

  it("在室者と同じ名前のゲストは円盤に載らない（同じ人が 2 席にならない）", () => {
    // Given: ゲスト「あおい」を足した後で、在室の「あおい」と同じ名前になった
    const s = stateWith({ guests: [{ id: "g-1", name: "あおい" }], nextGuestSeq: 2 });
    // When
    const spun = startSpin(s, spinInput())._unsafeUnwrap();
    // Then: 状態にはゲストが残る（在室者が抜ければまた入る）
    expect(spun.lastSpin?.wheel.map((e) => e.id)).toEqual(["p-a", "p-b"]);
    expect(spun.guests).toEqual([{ id: "g-1", name: "あおい" }]);
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
    const one = addGuest(INITIAL_ROULETTE_STATE, "ゲスト一", [], foldCase)._unsafeUnwrap();
    const two = addGuest(one, "ゲスト二", [], foldCase)._unsafeUnwrap();
    // When
    expect(two.guests).toEqual([
      { id: "g-1", name: "ゲスト一" },
      { id: "g-2", name: "ゲスト二" },
    ]);
  });

  it("名前を消して足し直しても ID は再利用されない", () => {
    // Given
    const one = addGuest(INITIAL_ROULETTE_STATE, "ゲスト一", [], foldCase)._unsafeUnwrap();
    const gone = removeGuest(one, "g-1");
    // When
    expect(addGuest(gone, "ゲスト一", [], foldCase)._unsafeUnwrap().guests[0]?.id).toBe("g-2");
  });

  it("MAX_GUESTS 件目までは足せ、13 件目は TOO_MANY_GUESTS", () => {
    // Given
    let s = INITIAL_ROULETTE_STATE;
    for (let i = 0; i < MAX_GUESTS; i++) s = addGuest(s, `名前${i}`, [], foldCase)._unsafeUnwrap();
    // When
    expect(s.guests).toHaveLength(MAX_GUESTS);
    expect(addGuest(s, "あふれ", [], foldCase)._unsafeUnwrapErr()).toEqual({ code: "TOO_MANY_GUESTS" });
  });

  it("名簿の参加者（在室を問わない）と同じ名前は GUEST_NAME_TAKEN。大文字小文字だけの違いも同じ名前", () => {
    // Given: Alice は在室、Bob は離席中
    const members: Member[] = [
      { id: "p-alice", name: "Alice", present: true },
      { id: "p-bob", name: "Bob", present: false },
    ];
    // When / Then: 大文字小文字を区別する完全一致だと「alice」「BOB」が通ってしまう
    expect(addGuest(INITIAL_ROULETTE_STATE, "alice", members, foldCase)._unsafeUnwrapErr()).toEqual({
      code: "GUEST_NAME_TAKEN",
    });
    expect(addGuest(INITIAL_ROULETTE_STATE, "BOB", members, foldCase)._unsafeUnwrapErr().code).toBe("GUEST_NAME_TAKEN");
    expect(addGuest(INITIAL_ROULETTE_STATE, "Carol", members, foldCase).isOk()).toBe(true);
  });

  it("すでに足したゲストと同じ名前も GUEST_NAME_TAKEN（大文字小文字だけの違いも）", () => {
    // Given
    const one = addGuest(INITIAL_ROULETTE_STATE, "Guest", [], foldCase)._unsafeUnwrap();
    // When / Then
    expect(addGuest(one, "Guest", [], foldCase)._unsafeUnwrapErr().code).toBe("GUEST_NAME_TAKEN");
    expect(addGuest(one, "GUEST", [], foldCase)._unsafeUnwrapErr().code).toBe("GUEST_NAME_TAKEN");
  });

  it("同じ名前かどうかは渡された判定だけで決める（ドメインは文字列を自分で比べない）", () => {
    // Given: 同じ文字列でも衝突としない判定
    const one = addGuest(INITIAL_ROULETTE_STATE, "Guest", [], neverConflicts)._unsafeUnwrap();
    const members: Member[] = [{ id: "p-alice", name: "Alice", present: true }];
    // When / Then: 自前の完全一致が残っていると拒んでしまう
    expect(addGuest(one, "Guest", members, neverConflicts).isOk()).toBe(true);
    expect(addGuest(one, "Alice", members, neverConflicts).isOk()).toBe(true);
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
    expect(removeGuest(s, "g-99")).toBe(s);
  });

  it("resetCycle は drawn だけを空にする", () => {
    const s = stateWith({ drawn: ["p-a"], excluded: ["p-b"] });
    expect(resetCycle(s)).toEqual({ ...s, drawn: [] });
  });

  it("変わらない操作は同じ参照を返す（同期サーバーが「変わっていないので配らない」を判定できる）", () => {
    // Given
    const s = stateWith({ excluded: ["p-a"], drawn: ["p-b"], guests: [{ id: "g-1", name: "一" }] });
    // When / Then: 中身が同じでも新しいオブジェクトを返すと、配らなくてよい配信が全員へ飛ぶ
    expect(setIncluded(s, "p-a", false)).toBe(s);
    expect(setIncluded(s, "p-b", true)).toBe(s);
    expect(removeGuest(s, "g-9")).toBe(s);
    expect(prune(s, ["p-a", "p-b", "g-1"])).toBe(s);
    const empty = stateWith({ excluded: ["p-a"] });
    expect(resetCycle(empty)).toBe(empty);
    // 変わるときは新しい参照
    expect(prune(s, ["p-b", "g-1"])).not.toBe(s);
    expect(resetCycle(s)).not.toBe(s);
  });

  it("INITIAL_ROULETTE_STATE は凍結されている（配列も）。共有の既定値を誰かが書き換えると全ルームへ漏れる", () => {
    // Given: 全ルームが共有する既定値
    // When / Then
    expect(Object.isFrozen(INITIAL_ROULETTE_STATE)).toBe(true);
    expect(Object.isFrozen(INITIAL_ROULETTE_STATE.excluded)).toBe(true);
    expect(Object.isFrozen(INITIAL_ROULETTE_STATE.guests)).toBe(true);
    expect(Object.isFrozen(INITIAL_ROULETTE_STATE.drawn)).toBe(true);
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
