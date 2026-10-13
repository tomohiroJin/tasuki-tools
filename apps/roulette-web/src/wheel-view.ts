/**
 * 円盤に載せる席（#94 PR 3・spec §6.3）。React にも時計にも依存しない。
 *
 * - 回転があれば、**次に回すまで回したときの席（`spin.wheel`）を描き続ける**。回っている間は入る人の増減で
 *   席が入れ替わらず、止まった後も、止まった角度（`spin.wheel` の席数で計算した角度）と描く席が食い違わない
 *   ので、指し針と札は必ず同じ人を指す。止まった後に入る人が変わっても（足した・外した・名簿の順が変わった）、
 *   円盤は結果のまま。いまの入る人は脇の一覧が持つ（結果の一言と同じく、次の回転までは結果が主役）
 * - 当たりの席は止まってから示す
 * - 回したことが無ければ、いまの入る人を当たり無しで見せる
 */
import type { Entry, RouletteView } from '@tasuki/roulette-core';

export interface WheelSeats {
  entries: readonly Entry[];
  /** 当たりの席（止まった後だけ。無ければ -1） */
  winnerIndex: number;
}

export function wheelSeatsOf(input: { pool: readonly Entry[]; spin: RouletteView['spin']; settled: boolean }): WheelSeats {
  const { pool, spin, settled } = input;
  if (spin === null) return { entries: pool, winnerIndex: -1 };
  return { entries: spin.wheel, winnerIndex: settled ? spin.winnerIndex : -1 };
}
