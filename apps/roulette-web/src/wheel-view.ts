/**
 * 円盤に載せる席（#94 PR 3・spec §6.3）。React にも時計にも依存しない。
 *
 * - 回っている間は、回し始めの席（`spin.wheel`）を凍らせて見せる（入る人の増減で席が入れ替わらない）
 * - 止まったら、いまの入る人と回したときの席が同じなら当たりの席を示す。違えば（止まった後に
 *   外した・足した）いまの入る人を当たり無しで見せる
 */
import { conflictsWithExisting } from '@tasuki/room-core';
import { poolOf, type Entry, type Member, type RouletteView } from '@tasuki/roulette-core';

export interface WheelSeats {
  entries: Entry[];
  /** 当たりの席（止まった後で、席が回したときと同じときだけ。無ければ -1） */
  winnerIndex: number;
}

const sameSeats = (a: readonly Entry[], b: readonly Entry[]): boolean =>
  a.length === b.length && a.every((e, i) => e.id === b[i]?.id);

export function wheelSeatsOf(input: { members: readonly Member[]; view: RouletteView; settled: boolean }): WheelSeats {
  const { members, view, settled } = input;
  const spin = view.spin;
  if (spin !== null && !settled) return { entries: spin.wheel, winnerIndex: -1 };
  const pool = poolOf(
    members,
    { excluded: view.excluded, guests: view.guests, drawn: view.drawn, lastSpin: null, nextGuestSeq: 1 },
    conflictsWithExisting,
  );
  if (spin !== null && sameSeats(spin.wheel, pool)) return { entries: spin.wheel, winnerIndex: spin.winnerIndex };
  return { entries: pool, winnerIndex: -1 };
}
