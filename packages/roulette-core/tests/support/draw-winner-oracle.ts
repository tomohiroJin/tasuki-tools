import type { Entry, RouletteState } from "../../src/index.js";

/**
 * #94 の 1 人の抽選（`src/draw.ts` の `drawWinner`。#401 で `drawPicks` に置き換えた）を写したオラクル。
 * **製品のコードと別の計算**で、`drawPicks(…, 1, …)` が #94 と同じ結果を返すことを全組で比べるために置く
 * （`tests/draw-picks.test.ts`）。直前の当たりは `lastSpin.winnerIndex` から取る（`picks` を読まない）。
 *
 * 乱数が契約を破ったら `null`。
 */
export function drawWinnerOracle(
  pool: readonly Entry[],
  state: RouletteState,
  randomInt: (n: number) => number,
): { winnerIndex: number; drawn: string[] } | null {
  let drawn = new Set(state.drawn);
  let eligible = pool.filter((e) => !drawn.has(e.id));
  if (eligible.length === 0) {
    drawn = new Set();
    const last = state.lastSpin?.wheel[state.lastSpin.winnerIndex]?.id;
    eligible = pool.length >= 2 ? pool.filter((e) => e.id !== last) : [...pool];
  }
  const picked = eligible[randomInt(eligible.length)];
  if (picked === undefined) return null;
  const winnerIndex = pool.findIndex((e) => e.id === picked.id);
  return { winnerIndex, drawn: [...drawn, picked.id] };
}
