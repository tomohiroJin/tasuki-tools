/**
 * InMemoryAgendaStore — 進行タイマーの状態の揮発インメモリストア（#429）。
 */

import type { AgendaState } from "@tasuki/agenda-core";
import type { AgendaStore } from "../ports/agenda-store.js";

export class InMemoryAgendaStore implements AgendaStore {
  private readonly states = new Map<string, AgendaState>();

  get(code: string): AgendaState | undefined {
    return this.states.get(code);
  }

  put(code: string, state: AgendaState): void {
    this.states.set(code, state);
  }

  remove(code: string): void {
    this.states.delete(code);
  }
}
