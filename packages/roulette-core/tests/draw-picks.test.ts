import { describe, expect, it } from "vitest";
import { drawPicks as drawPicksResult } from "../src/draw.js";
import { INITIAL_ROULETTE_STATE, type Entry, type RouletteState } from "../src/index.js";
import { drawWinnerOracle } from "./support/draw-winner-oracle.js";

const A: Entry = { id: "p-a", name: "あおい" };
const B: Entry = { id: "p-b", name: "健太" };
const C: Entry = { id: "p-c", name: "Ren" };
const D: Entry = { id: "p-d", name: "Mika" };
const E: Entry = { id: "p-e", name: "陽菜" };
const F: Entry = { id: "p-f", name: "Sam" };

/** 契約を守る乱数での引き（取り出せなければ前提の誤りとして落ちる） */
const drawPicks = (...args: Parameters<typeof drawPicksResult>) => drawPicksResult(...args)._unsafeUnwrap();

/** 常に 0 を返す偽の乱数。「選べる先頭」を引き続ける最悪の偏りを作る */
const alwaysZero = (): number => 0;

/** 直前の回転で `ids` が選ばれた状態 */
function afterSpinOf(pool: readonly Entry[], ids: readonly string[], drawn: readonly string[]): RouletteState {
  const picks = ids.map((id) => ({ index: pool.findIndex((e) => e.id === id), settle: 0.5 }));
  return {
    ...INITIAL_ROULETTE_STATE,
    drawn,
    lastSpin: {
      seq: 1,
      wheel: [...pool],
      winnerIndex: picks[0]?.index ?? 0,
      settle: 0.5,
      picks,
      spunBy: "あおい",
      startedAt: 0,
    },
  };
}

const idsOf = (pool: readonly Entry[], indices: readonly number[]): string[] => indices.map((i) => pool[i]?.id ?? "?");

/**
 * @requirements #401 E3・E4（k 人を一周の規則で引く・spec M7・M8）
 */
describe("drawPicks（k 人を引く）", () => {
  it("k 人は互いに異なり、全員がこの一周で選ばれた人に載る", () => {
    // Given: 4 人・k = 2・まだ誰も選ばれていない
    const pool = [A, B, C, D];
    // When: 乱数は常に先頭
    const r = drawPicks(pool, INITIAL_ROULETTE_STATE, 2, alwaysZero);
    // Then: 先頭を引き続けても同じ人は 2 度出ない
    expect(idsOf(pool, r.picks)).toEqual(["p-a", "p-b"]);
    expect(r.drawn).toEqual(["p-a", "p-b"]);
  });

  it("周の残りでちょうど足りるなら、残りの人だけから引く", () => {
    // Given: 3 人・k = 2・A はこの一周で選ばれた
    const pool = [A, B, C];
    const state = { ...INITIAL_ROULETTE_STATE, drawn: ["p-a"] };
    // When
    const r = drawPicks(pool, state, 2, alwaysZero);
    // Then
    expect(idsOf(pool, r.picks)).toEqual(["p-b", "p-c"]);
    expect(r.drawn).toEqual(["p-a", "p-b", "p-c"]);
  });

  it("周の途中で閉じたら、新しい周からこの回転ですでに選んだ人を除いて引く", () => {
    // Given: 3 人・k = 2・A と B はこの一周で選ばれた（直前の回転は無い）
    const pool = [A, B, C];
    const state = { ...INITIAL_ROULETTE_STATE, drawn: ["p-a", "p-b"] };
    // When: 乱数は常に先頭
    const r = drawPicks(pool, state, 2, alwaysZero);
    // Then: 1 人目は周の残りの C。2 人目は周を閉じて引くが、C は今回すでに選んだので出ない
    expect(idsOf(pool, r.picks)).toEqual(["p-c", "p-a"]);
    // 新しい周に載るのは 2 人目だけ
    expect(r.drawn).toEqual(["p-a"]);
  });

  it("新しい周の最初は直前の回転で選ばれた人を除く", () => {
    // Given: 5 人・k = 2・全員が選ばれた・直前の回転は D と E
    const pool = [A, B, C, D, E];
    const state = afterSpinOf(pool, ["p-d", "p-e"], ["p-a", "p-b", "p-c", "p-d", "p-e"]);
    // When: 乱数は常に末尾
    const r = drawPicks(pool, state, 2, (n) => n - 1);
    // Then: 末尾を引き続けても D と E は出ない
    expect(idsOf(pool, r.picks)).toEqual(["p-c", "p-b"]);
    expect(r.drawn).toEqual(["p-c", "p-b"]);
  });

  it("直前の回転の人を除くと足りないときは、この回転ですでに選んだ人だけを除く", () => {
    // Given: 3 人・k = 2・全員が選ばれた・直前の回転は A と B
    const pool = [A, B, C];
    const state = afterSpinOf(pool, ["p-a", "p-b"], ["p-a", "p-b", "p-c"]);
    // When
    const r = drawPicks(pool, state, 2, alwaysZero);
    // Then: 1 人目は直前の 2 人を除いた C。2 人目は C だけを除いて A か B（先頭の A）
    expect(idsOf(pool, r.picks)).toEqual(["p-c", "p-a"]);
  });

  it("周を閉じても、この回転ですでに選んだ人は 2 度選ばない", () => {
    // Given: 3 人・k = 2・B と C はこの一周で選ばれた（直前の回転は無い）
    const pool = [A, B, C];
    const state = { ...INITIAL_ROULETTE_STATE, drawn: ["p-b", "p-c"] };
    // When: 乱数は常に先頭
    const r = drawPicks(pool, state, 2, alwaysZero);
    // Then: 1 人目は周の残りの A。周を閉じた後の先頭も A だが、今回すでに選んだので B になる
    expect(idsOf(pool, r.picks)).toEqual(["p-a", "p-b"]);
  });

  it("randomInt に渡す n は、その回の候補の数", () => {
    // Given: 4 人・k = 3
    const calls: number[] = [];
    // When
    drawPicks([A, B, C, D], INITIAL_ROULETTE_STATE, 3, (n) => {
      calls.push(n);
      return 0;
    });
    // Then
    expect(calls).toEqual([4, 3, 2]);
  });

  it("randomInt が契約を破ったら INVALID_RANDOM", () => {
    // Given / When
    const r = drawPicksResult([A, B, C], INITIAL_ROULETTE_STATE, 2, (n) => n);
    // Then
    expect(r._unsafeUnwrapErr()).toEqual({ code: "INVALID_RANDOM" });
  });
});

/**
 * @requirements #401 E7（選ぶ人数が 1 なら #94 と同じ）
 */
describe("drawPicks の k = 1 は #94 の 1 人の抽選と同じ", () => {
  const people = [A, B, C, D, E, F];

  /** `ids` の全部分集合 */
  function subsets(ids: readonly string[]): string[][] {
    return Array.from({ length: 1 << ids.length }, (_, mask) => ids.filter((_, i) => (mask >> i) & 1));
  }

  it("入る人 2〜6 人・drawn の全部分集合・直前の当たりの全通り・乱数の全位置で一致する", () => {
    let compared = 0;
    for (let n = 2; n <= people.length; n++) {
      const pool = people.slice(0, n);
      for (const drawn of subsets(pool.map((e) => e.id))) {
        for (const last of [null, ...pool.map((e) => e.id)]) {
          const state = last === null ? { ...INITIAL_ROULETTE_STATE, drawn } : afterSpinOf(pool, [last], drawn);
          for (let at = 0; at < n; at++) {
            // Given: 候補の数より小さい位置を返す乱数（候補が少ないときは末尾に丸める）
            const random = (m: number): number => Math.min(at, m - 1);
            // When
            const one = drawWinnerOracle(pool, state, random);
            const many = drawPicks(pool, state, 1, random);
            // Then
            expect(many.picks).toEqual([one?.winnerIndex]);
            expect(many.drawn).toEqual(one?.drawn);
            compared++;
          }
        }
      }
    }
    // 表が空回りしていない
    expect(compared).toBeGreaterThan(1000);
  });
});
