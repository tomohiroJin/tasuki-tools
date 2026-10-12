/**
 * 一周の規則で当たりを引く（#94 spec R6）。
 */
import type { Entry, RouletteState } from "./types.js";

export interface DrawResult {
  /** `pool` の中の添字 */
  winnerIndex: number;
  /** 引いた後の「この一周で選ばれた人」（周を閉じたら新しい周の 1 件目だけ） */
  drawn: string[];
}

/**
 * 当たりを「この一周でまだ選ばれていない人」から一様に引く。
 *
 * - `eligible = pool − drawn`。空なら周を閉じる: `drawn = []`、`eligible = pool − {直前の当たり}`
 *   （pool が 2 人以上のとき。**新しい周の最初に同じ人が 2 回続くのを防ぐ**）
 * - 周の途中で入ってきた人は `drawn` に居ないので、その周の残りに入る
 * - 直前の当たりは `lastSpin` の当たりの席から取る（`drawn` の末尾は周を閉じた直後に意味が変わる）
 *
 * `randomInt(n)` は `[0, n)` の整数を返す注入された関数（ドメインは環境から値を読まない）。
 * **pool が 1 人のときは呼ばない前提**: `startSpin` が `ROULETTE_TOO_FEW` で先に拒む。
 */
export function drawWinner(pool: readonly Entry[], state: RouletteState, randomInt: (n: number) => number): DrawResult {
  let drawn = new Set(state.drawn);
  let eligible = pool.filter((e) => !drawn.has(e.id));
  if (eligible.length === 0) {
    drawn = new Set();
    const last = state.lastSpin?.wheel[state.lastSpin.winnerIndex]?.id;
    eligible = pool.length >= 2 ? pool.filter((e) => e.id !== last) : [...pool];
  }
  const picked = eligible[randomInt(eligible.length)];
  if (picked === undefined) {
    // randomInt が契約（[0, n)）を破った。サーバーの乱数源は契約を守るので、ここへは来ない
    throw new RangeError("randomInt returned an out-of-range index");
  }
  const winnerIndex = pool.findIndex((e) => e.id === picked.id);
  return { winnerIndex, drawn: [...drawn, picked.id] };
}
