import { describe, expect, it } from "vitest";
import { INITIAL_ROULETTE_STATE, poolOf, type Member, type RouletteState } from "../src/index.js";

const A: Member = { id: "p-a", name: "あおい", present: true };
const B: Member = { id: "p-b", name: "健太", present: true };
const C: Member = { id: "p-c", name: "Ren", present: false };

function stateWith(patch: Partial<RouletteState>): RouletteState {
  return { ...INITIAL_ROULETTE_STATE, ...patch };
}

/**
 * @requirements #94 E4（入る人 = 在室の参加者 − 外した人 ＋ 足した名前）
 */
describe("poolOf（入る人）", () => {
  it("在室の参加者だけが入り、離席中の参加者は入らない", () => {
    // Given: 3 人のうち 1 人が離席中
    // When / Then
    expect(poolOf([A, C, B], INITIAL_ROULETTE_STATE).map((e) => e.id)).toEqual(["p-a", "p-b"]);
  });

  it("離席中の 1 人を除くと 2 人未満になる局面では 1 人しか入らない", () => {
    expect(poolOf([A, C], INITIAL_ROULETTE_STATE)).toEqual([{ id: "p-a", name: "あおい" }]);
  });

  it("外した参加者は入らない", () => {
    expect(poolOf([A, B], stateWith({ excluded: ["p-a"] }))).toEqual([{ id: "p-b", name: "健太" }]);
  });

  it("外したゲストは入らない", () => {
    // Given
    const state = stateWith({
      guests: [
        { id: "g-1", name: "ゲスト一" },
        { id: "g-2", name: "ゲスト二" },
      ],
      excluded: ["g-1"],
    });
    // When
    expect(poolOf([A], state).map((e) => e.id)).toEqual(["p-a", "g-2"]);
  });

  it("並びは名簿の順 → ゲストの足した順で、同じ入力から常に同じ", () => {
    // Given
    const state = stateWith({
      guests: [
        { id: "g-2", name: "後から" },
        { id: "g-1", name: "先に" },
      ],
    });
    const first = poolOf([B, A], state);
    // When
    expect(first.map((e) => e.id)).toEqual(["p-b", "p-a", "g-2", "g-1"]);
    expect(poolOf([B, A], state)).toEqual(first);
  });

  it("外した ID が名簿に居なくても落ちない（全域関数）", () => {
    expect(poolOf([A], stateWith({ excluded: ["p-gone", "g-9"] }))).toEqual([{ id: "p-a", name: "あおい" }]);
  });
});
