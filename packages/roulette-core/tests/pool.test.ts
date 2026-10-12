import { describe, expect, it } from "vitest";
import { INITIAL_ROULETTE_STATE, poolOf, type Member, type RouletteState } from "../src/index.js";
import { foldCase, neverConflicts } from "./support/name-conflict.js";

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
    expect(poolOf([A, C, B], INITIAL_ROULETTE_STATE, foldCase).map((e) => e.id)).toEqual(["p-a", "p-b"]);
  });

  it("離席中の 1 人を除くと 2 人未満になる局面では 1 人しか入らない", () => {
    expect(poolOf([A, C], INITIAL_ROULETTE_STATE, foldCase)).toEqual([{ id: "p-a", name: "あおい" }]);
  });

  it("外した参加者は入らない", () => {
    expect(poolOf([A, B], stateWith({ excluded: ["p-a"] }), foldCase)).toEqual([{ id: "p-b", name: "健太" }]);
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
    expect(poolOf([A], state, foldCase).map((e) => e.id)).toEqual(["p-a", "g-2"]);
  });

  it("並びは名簿の順 → ゲストの足した順で、同じ入力から常に同じ", () => {
    // Given
    const state = stateWith({
      guests: [
        { id: "g-2", name: "後から" },
        { id: "g-1", name: "先に" },
      ],
    });
    const first = poolOf([B, A], state, foldCase);
    // When
    expect(first.map((e) => e.id)).toEqual(["p-b", "p-a", "g-2", "g-1"]);
    expect(poolOf([B, A], state, foldCase)).toEqual(first);
  });

  it("外した ID が名簿に居なくても落ちない（全域関数）", () => {
    expect(poolOf([A], stateWith({ excluded: ["p-gone", "g-9"] }), foldCase)).toEqual([{ id: "p-a", name: "あおい" }]);
  });
});

/**
 * 在室者と同じ名前（同じ判定）のゲストは入れない（#94 spec R13・PR #355 のレビュー指摘 2）。
 *
 * ゲストを足した後に、同じ名前の人が参加・改名すると、同じ人が円盤に 2 席になる。
 * 参加や改名を拒むと他のツールへ波及するので、**入る人の段で在室者を勝たせ、状態にはゲストを残す**。
 *
 * @requirements #94 E4・E13
 */
describe("poolOf（在室者と同じ名前のゲスト）", () => {
  const guestAlice = stateWith({ guests: [{ id: "g-1", name: "alice" }] });
  const alice: Member = { id: "p-alice", name: "Alice", present: true };

  it("在室者と同じ名前のゲストは入らない（在室者が勝つ）", () => {
    // Given: ゲスト「alice」を足した後で「Alice」が参加した
    // When
    const pool = poolOf([alice, B], guestAlice, foldCase);
    // Then: Alice は 1 席だけ。ゲストの側が外れる
    expect(pool.map((e) => e.id)).toEqual(["p-alice", "p-b"]);
  });

  it("外した在室者と同じ名前のゲストも入らない（外した人がゲストの席で戻ってこない）", () => {
    expect(poolOf([alice, B], { ...guestAlice, excluded: ["p-alice"] }, foldCase).map((e) => e.id)).toEqual(["p-b"]);
  });

  it("離席中の参加者と同じ名前のゲストは入る（離席中の参加者は円盤に居ない）", () => {
    expect(poolOf([{ ...alice, present: false }, B], guestAlice, foldCase).map((e) => e.id)).toEqual(["p-b", "g-1"]);
  });

  it("同じ名前かどうかは渡された判定だけで決める（ドメインは文字列を自分で比べない）", () => {
    // Given: 同じ文字列でも衝突としない判定
    const sameSpelling = stateWith({ guests: [{ id: "g-1", name: "Alice" }] });
    // When / Then: 自前の比較が残っていると、ゲストが落ちる
    expect(poolOf([alice], sameSpelling, neverConflicts).map((e) => e.id)).toEqual(["p-alice", "g-1"]);
  });
});
