/**
 * InMemoryRouletteStore — ルーレットの状態の揮発インメモリストア（#94）。
 */

import type { RouletteState } from "@tasuki/roulette-core";
import type { RouletteStore } from "../ports/roulette-store.js";

export class InMemoryRouletteStore implements RouletteStore {
  private readonly states = new Map<string, RouletteState>();

  get(code: string): RouletteState | undefined {
    return this.states.get(code);
  }

  put(code: string, state: RouletteState): void {
    this.states.set(code, state);
  }

  remove(code: string): void {
    this.states.delete(code);
  }
}
