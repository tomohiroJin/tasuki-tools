/**
 * うちわけの状態の保管（#476）。**ルームと寿命を共にする**（`destroy-room.ts` が消す）。
 * 永続化しない（`docs/timer/adr/0007`）。
 */

import type { TrackState } from "@tasuki/track-core";

export interface TrackStore {
  get(code: string): TrackState | undefined;
  put(code: string, state: TrackState): void;
  remove(code: string): void;
}
