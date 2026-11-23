/**
 * InMemoryTrackStore — うちわけの状態の揮発インメモリストア（#476）。
 */

import type { TrackState } from "@tasuki/track-core";
import type { TrackStore } from "../ports/track-store.js";

export class InMemoryTrackStore implements TrackStore {
  private readonly states = new Map<string, TrackState>();

  get(code: string): TrackState | undefined {
    return this.states.get(code);
  }

  put(code: string, state: TrackState): void {
    this.states.set(code, state);
  }

  remove(code: string): void {
    this.states.delete(code);
  }
}
