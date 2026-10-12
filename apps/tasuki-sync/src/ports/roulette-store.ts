/**
 * ルーレットの状態の保管（#94）。**ルームと寿命を共にする**（`destroy-room.ts` が消す）。
 * 永続化しない（`docs/timer/adr/0007`）。
 */

import type { RouletteState } from "@tasuki/roulette-core";

export interface RouletteStore {
  get(code: string): RouletteState | undefined;
  put(code: string, state: RouletteState): void;
  remove(code: string): void;
}
