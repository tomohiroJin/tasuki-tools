/**
 * InMemoryCheckinStore — チェックインの状態の揮発インメモリストア（#406）。
 */

import type { CheckinState } from "@tasuki/checkin-core";
import type { CheckinStore } from "../ports/checkin-store.js";

export class InMemoryCheckinStore implements CheckinStore {
  private readonly states = new Map<string, CheckinState>();

  get(code: string): CheckinState | undefined {
    return this.states.get(code);
  }

  put(code: string, state: CheckinState): void {
    this.states.set(code, state);
  }

  delete(code: string): void {
    this.states.delete(code);
  }
}
