/**
 * InMemoryTopicStore のテスト
 */

import { describe, it, expect } from "bun:test";
import { INITIAL_TOPIC_STATE } from "@tasuki/topic-core";
import type { TopicState } from "@tasuki/topic-core";
import { InMemoryTopicStore } from "../src/adapters/in-memory-topic-store.js";

/**
 * @requirements #91
 */
describe("InMemoryTopicStore", () => {
  it("置いた状態を引け、消すと引けなくなる", () => {
    const store = new InMemoryTopicStore();
    store.put("R1", INITIAL_TOPIC_STATE);
    expect(store.get("R1")).toEqual(INITIAL_TOPIC_STATE);
    store.remove("R1");
    expect(store.get("R1")).toBeUndefined();
  });

  it("初期状態でない値も、置いたそのままを引ける", () => {
    // Given: 初期状態を返すだけのスタブでは検出できない、確定済みのお題を持つ状態
    const settled: TopicState = {
      topic: { title: "配列の重複を消す", body: "", source: "manual" },
      generating: false,
      degraded: false,
      aiUnlocked: true,
    };
    const store = new InMemoryTopicStore();

    // When
    store.put("R2", settled);

    // Then
    expect(store.get("R2")).toEqual(settled);
  });

  it("存在しないコードは undefined を返す", () => {
    const store = new InMemoryTopicStore();
    expect(store.get("NOTEXIST")).toBeUndefined();
  });
});
