/**
 * InMemoryTopicStore — お題の状態の揮発インメモリストア（#91）。
 */

import type { TopicState } from "@tasuki/topic-core";
import type { TopicStore } from "../ports/topic-store.js";

export class InMemoryTopicStore implements TopicStore {
  private readonly states = new Map<string, TopicState>();

  get(code: string): TopicState | undefined {
    return this.states.get(code);
  }

  put(code: string, state: TopicState): void {
    this.states.set(code, state);
  }

  remove(code: string): void {
    this.states.delete(code);
  }
}
