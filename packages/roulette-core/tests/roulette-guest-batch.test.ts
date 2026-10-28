import { describe, expect, it } from "vitest";
import { INITIAL_ROULETTE_STATE, addGuest, addGuests, type Member, type RouletteState } from "../src/index.js";
import { MAX_GUESTS } from "../src/limits.js";
import { foldCase } from "./support/name-conflict.js";

function withGuests(names: string[]): RouletteState {
  return {
    ...INITIAL_ROULETTE_STATE,
    guests: names.map((name, i) => ({ id: `g-${i + 1}`, name })),
    nextGuestSeq: names.length + 1,
  };
}

/**
 * @requirements #458（名前をまとめて足す）
 */
describe("addGuests", () => {
  it("名前を渡した順に足し、ID を g-1 から採番する", () => {
    // Given
    // When
    const b = addGuests(INITIAL_ROULETTE_STATE, ["佐藤", "鈴木"], [], foldCase);
    // Then
    expect(b.added).toEqual(["佐藤", "鈴木"]);
    expect(b.state.guests).toEqual([
      { id: "g-1", name: "佐藤" },
      { id: "g-2", name: "鈴木" },
    ]);
    expect(b.state.nextGuestSeq).toBe(3);
    expect(b.skipped).toEqual([]);
    expect(b.overflow).toEqual([]);
  });

  it("在室の参加者と同じ名前は飛ばし、残りを足す", () => {
    // Given
    const members: Member[] = [{ id: "p1", name: "tomo", present: true }];
    // When
    const b = addGuests(INITIAL_ROULETTE_STATE, ["tomo", "佐藤"], members, foldCase);
    // Then
    expect(b.skipped).toEqual(["tomo"]);
    expect(b.added).toEqual(["佐藤"]);
  });

  it("在室していない名簿の参加者と同じ名前も飛ばす", () => {
    // Given
    const members: Member[] = [{ id: "p1", name: "tomo", present: false }];
    // When
    const b = addGuests(INITIAL_ROULETTE_STATE, ["tomo"], members, foldCase);
    // Then
    expect(b.skipped).toEqual(["tomo"]);
    expect(b.added).toEqual([]);
  });

  it("既存のゲストと、束の中で表記だけ違う同じ名前を飛ばす", () => {
    // Given
    // When: 表記の違い（大文字小文字）は渡された判定が畳む。全角などの正規化は呼び出し側（サーバー）の役目
    const b = addGuests(withGuests(["佐藤"]), ["佐藤", "alice", "ALICE"], [], foldCase);
    // Then
    expect(b.added).toEqual(["alice"]);
    expect(b.skipped).toEqual(["佐藤", "ALICE"]);
  });

  it("上限に達したら残りは入らない（とばしたと数えない）", () => {
    // Given
    const twenty = withGuests(Array.from({ length: 20 }, (_, i) => `客${i}`));
    // When
    const b = addGuests(twenty, ["a", "b", "c", "d", "e", "f", "g", "h"], [], foldCase);
    // Then
    expect(b.added).toHaveLength(4);
    expect(b.overflow).toEqual(["e", "f", "g", "h"]);
    expect(b.skipped).toEqual([]);
    expect(b.state.guests).toHaveLength(24);
  });

  it("上限に達した後でも、同じ名前なら skipped に入る", () => {
    // Given
    const full = withGuests(Array.from({ length: 24 }, (_, i) => `客${i}`));
    // When
    const b = addGuests(full, ["客0", "新"], [], foldCase);
    // Then
    expect(b.skipped).toEqual(["客0"]);
    expect(b.overflow).toEqual(["新"]);
  });

  it("1 人も足さないときは同じ参照を返す", () => {
    // Given
    const state = withGuests(["佐藤"]);
    // When
    const b = addGuests(state, ["佐藤"], [], foldCase);
    // Then
    expect(b.state).toBe(state);
  });

  it("addGuest も 24 人まで足せて、25 人目は TOO_MANY_GUESTS", () => {
    // Given
    let s = INITIAL_ROULETTE_STATE;
    for (let i = 0; i < 24; i++) s = addGuest(s, `名前${i}`, [], foldCase)._unsafeUnwrap();
    // When
    // Then
    expect(MAX_GUESTS).toBe(24);
    expect(s.guests).toHaveLength(24);
    expect(addGuest(s, "あふれ", [], foldCase)._unsafeUnwrapErr()).toEqual({ code: "TOO_MANY_GUESTS" });
  });
});
