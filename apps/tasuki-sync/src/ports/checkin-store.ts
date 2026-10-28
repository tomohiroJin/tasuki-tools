/**
 * チェックインの状態の保管（#406）。**ルームと寿命を共にする**（`destroy-room.ts` が消す）。
 * 永続化しない（`docs/timer/adr/0007`）。
 */

import type { CheckinState } from "@tasuki/checkin-core";

export interface CheckinStore {
  get(code: string): CheckinState | undefined;
  put(code: string, state: CheckinState): void;
  delete(code: string): void;
}
