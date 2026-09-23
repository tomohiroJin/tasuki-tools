/**
 * お題の状態の保管（#91）。**ルームと寿命を共にする**（`destroy-room.ts` が消す）。
 * 永続化しない（`docs/timer/adr/0007`）。
 */

import type { TopicState } from "@tasuki/topic-core";

export interface TopicStore {
  get(code: string): TopicState | undefined;
  put(code: string, state: TopicState): void;
  remove(code: string): void;
}
