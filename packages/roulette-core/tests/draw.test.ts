import { describe, expect, it } from "vitest";
import { drawWinner as drawWinnerResult } from "../src/draw.js";
import { INITIAL_ROULETTE_STATE, type Entry, type RouletteState } from "../src/index.js";

const A: Entry = { id: "p-a", name: "あおい" };
const B: Entry = { id: "p-b", name: "健太" };
const C: Entry = { id: "p-c", name: "Ren" };
const D: Entry = { id: "p-d", name: "遅れて来た人" };

/**
 * 契約を守る乱数での引き。**#364 で `drawWinner` は `Result` を返すようになった**ので、
 * 乱数が契約を守る組はここで中身を取り出す（取り出せなければ前提の誤りとして落ちる）。
 */
const drawWinner = (...args: Parameters<typeof drawWinnerResult>) => drawWinnerResult(...args)._unsafeUnwrap();

/** 常に 0 を返す偽の乱数。「選べる先頭」を引き続ける最悪の偏りを作る */
const alwaysZero = (): number => 0;

/** 引数 n を記録する偽の乱数 */
function recordingRandom(): { randomInt: (n: number) => number; calls: number[] } {
  const calls: number[] = [];
  return {
    calls,
    randomInt: (n) => {
      calls.push(n);
      return 0;
    },
  };
}

function stateWith(patch: Partial<RouletteState>): RouletteState {
  return { ...INITIAL_ROULETTE_STATE, ...patch };
}

/**
 * pool が 1 人のときは呼ばない前提（`startSpin` が `ROULETTE_TOO_FEW` で先に拒む。
 * `tests/roulette.test.ts` で見る）。
 *
 * @requirements #94 E2・E3（一周の規則・spec R6）
 */
describe("drawWinner（一周の規則）", () => {
  it("2 人 [A,B]・drawn=[A] なら、乱数が 0 を返しても A にならず B になる（2 回目で見る）", () => {
    // Given: 1 回目で A が選ばれた後
    const state = stateWith({ drawn: ["p-a"] });
    // When
    const { winnerIndex, drawn } = drawWinner([A, B], state, alwaysZero);
    // Then: 添字は pool の中の位置
    expect(winnerIndex).toBe(1);
    expect(drawn).toEqual(["p-a", "p-b"]);
  });

  it("選べる人の数を randomInt へ渡す（pool 全体の数ではない）", () => {
    // Given
    const rec = recordingRandom();
    drawWinner([A, B, C], stateWith({ drawn: ["p-a"] }), rec.randomInt);
    // When
    expect(rec.calls).toEqual([2]);
  });

  it("2 人で 3 回続けて引くと A, B, A になる。3 回目の時点で drawn は新しい周の 1 件だけ", () => {
    // Given: 乱数は常に 0
    let state = INITIAL_ROULETTE_STATE;
    const winners: string[] = [];
    const drawnAfter: string[][] = [];
    // When
    for (let i = 0; i < 3; i++) {
      const r = drawWinner([A, B], state, alwaysZero);
      winners.push([A, B][r.winnerIndex]!.id);
      drawnAfter.push(r.drawn);
      state = stateWith({
        drawn: r.drawn,
        lastSpin: { seq: i + 1, wheel: [A, B], winnerIndex: r.winnerIndex, settle: 0.5, spunBy: "x", startedAt: 0 },
      });
    }
    // Then
    expect(winners).toEqual(["p-a", "p-b", "p-a"]);
    expect(drawnAfter[2]).toEqual(["p-a"]);
  });

  it("3 人 [A,B,C]・drawn=[A,B,C]・直前の当たり C なら、新しい周の 1 回目は 2 人から引き、C は選ばれない", () => {
    // Given
    const rec = recordingRandom();
    const state = stateWith({
      drawn: ["p-a", "p-b", "p-c"],
      lastSpin: { seq: 3, wheel: [A, B, C], winnerIndex: 2, settle: 0.5, spunBy: "x", startedAt: 0 },
    });
    const { winnerIndex, drawn } = drawWinner([A, B, C], state, rec.randomInt);
    // When
    expect(rec.calls).toEqual([2]);
    expect(winnerIndex).toBe(0);
    expect(drawn).toEqual(["p-a"]);
  });

  it("直前の当たりは lastSpin から引く（drawn の末尾ではなく）", () => {
    // Given
    const state = stateWith({
      drawn: ["p-c", "p-a", "p-b"],
      lastSpin: { seq: 3, wheel: [A, B, C], winnerIndex: 1, settle: 0.5, spunBy: "x", startedAt: 0 },
    });
    // 直前の当たりは B（wheel[1]）。末尾でも同じなので、C を入れ替えた並びで区別する
    const { winnerIndex } = drawWinner([A, B, C], state, alwaysZero);
    // When
    expect(winnerIndex).toBe(0);
    const state2 = stateWith({
      drawn: ["p-a", "p-b", "p-c"],
      lastSpin: { seq: 3, wheel: [A, B, C], winnerIndex: 0, settle: 0.5, spunBy: "x", startedAt: 0 },
    });
    // 直前の当たりは A なので、周を閉じた後の先頭は B（drawn の末尾 C を信じると A になる）
    expect(drawWinner([A, B, C], state2, alwaysZero).winnerIndex).toBe(1);
  });

  it("周の途中で入ってきた D（drawn に居ない）は、残りの周に入る", () => {
    // Given
    const rec = recordingRandom();
    const { winnerIndex } = drawWinner([A, B, D], stateWith({ drawn: ["p-a", "p-b"] }), rec.randomInt);
    // When
    expect(rec.calls).toEqual([1]);
    expect(winnerIndex).toBe(2);
  });

  it("Given randomInt が範囲外を返す / When 引く / Then INVALID_RANDOM の Err（契約違反を黙って通さない・#364 で投げるのをやめた）", () => {
    // Given
    const outOfRange = (): number => 5;
    // When
    const drawn = drawWinnerResult([A, B], INITIAL_ROULETTE_STATE, outOfRange);
    // Then
    expect(drawn._unsafeUnwrapErr()).toEqual({ code: "INVALID_RANDOM" });
  });
});
