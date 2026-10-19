/**
 * 進行タイマーの状態の保管（#429）。**ルームと寿命を共にする**（`destroy-room.ts` が消す）。
 * 永続化しない（`docs/timer/adr/0007`）。
 */

import type { AgendaState } from "@tasuki/agenda-core";

export interface AgendaStore {
  get(code: string): AgendaState | undefined;
  put(code: string, state: AgendaState): void;
  remove(code: string): void;
}
