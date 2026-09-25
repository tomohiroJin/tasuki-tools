/**
 * ルーム破棄の共通経路（Issue #79）。
 *
 * ルームが消える契機は「アイドル回収（TTL）」と「在室者が 0 人になる退出」の 2 つある
 * （#95 S4a で poker の即時破棄を撤去し、この 2 つが全部になった）。
 * ルームを store から消すだけでは足りず、自動交代の予約・お題生成の委譲・お題の生成・
 * 不在検知のタイマー・トークン・各ツールとお題の状態はいずれも roomCode をキーに
 * 別々の Map で生きている。
 * 2 つの契機がそれぞれ後始末を並べると片方だけ更新されて必ずずれるため、
 * 内容と順序を 1 箇所に固定し、両方が同じ関数を通ることをここで固定する。
 *
 * @requirements Issue #79, #95 S4a（R10・D8）, #91 E6
 */

import { describe, it, expect } from "bun:test";
import { createRoomDestroyer } from "../src/application/destroy-room.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { InMemoryTimerStore } from "../src/adapters/in-memory-timer-store.js";
import { InMemoryRoundStore } from "../src/adapters/poker-in-memory-round-store.js";
import { InMemoryTopicStore } from "../src/adapters/in-memory-topic-store.js";
import { INITIAL_TOPIC_STATE } from "@tasuki/topic-core";
import { spyDestroyer } from "./support/spy-destroyer.js";

describe("createRoomDestroyer", () => {
  it("タイマー・お題の生成・presence・トークンを解放してからルームを消す", () => {
    // Given
    const store = new InMemoryRoomStore();
    const timers = new InMemoryTimerStore();
    const { destroy, calls } = spyDestroyer(store, timers);

    // When
    destroy("AAA");

    // Then: 発火しうるものを先に止め、最後に実体を消す
    // （先に消すと停止処理中に発火したタイマーが参照先の無いルームを触りうる）
    expect(calls).toEqual([
      "scheduler.clear:AAA",
      "topicGenerator.cancel:AAA",
      "presence.clearRoomTimers:AAA",
      "releaseRoom:AAA",
    ]);
  });

  it("名簿・各ツールの状態・お題の状態を揃ってストアから取り除く", () => {
    // Given: 1 つのルームコードに名簿と各ツール・お題の保管がぶら下がっている状態（#95 S4a・#91）
    const store = new InMemoryRoomStore();
    const timers = new InMemoryTimerStore();
    const rounds = new InMemoryRoundStore();
    const topics = new InMemoryTopicStore();
    store.put({ code: "BBB", createdAt: 0, participants: [] });
    timers.put({ code: "BBB" } as never);
    rounds.put("BBB", { status: "voting", votes: new Map() });
    topics.put("BBB", INITIAL_TOPIC_STATE);
    const { destroy } = spyDestroyer(store, timers, rounds, topics);

    // When
    destroy("BBB");

    // Then: どの面も揃って消える（1 面でも残ると「幽霊のルーム」になる）
    expect(store.get("BBB")).toBeUndefined();
    expect(timers.get("BBB")).toBeUndefined();
    expect(rounds.get("BBB")).toBeUndefined();
    expect(topics.get("BBB")).toBeUndefined();
  });

  it("スケジューラ・presence を持たない構成でも解放とストア削除は行う", () => {
    // Given: makeHandlers 単体（scheduler を省略できる）で組んだ場合
    const store = new InMemoryRoomStore();
    const timers = new InMemoryTimerStore();
    const rounds = new InMemoryRoundStore();
    store.put({ code: "CCC", createdAt: 0, participants: [] });
    timers.put({ code: "CCC" } as never);
    rounds.put("CCC", { status: "voting", votes: new Map() });
    const topics = new InMemoryTopicStore();
    topics.put("CCC", INITIAL_TOPIC_STATE);
    const released: string[] = [];
    // scheduler / presence は省略できるが、**保管とお題の生成は省略できない**
    // （optional にすると本番の配線から落ちても緑のままになる。理由は destroy-room.ts）。
    const destroy = createRoomDestroyer({
      store,
      timers,
      rounds,
      topics,
      topicGenerator: { cancel: () => {} },
      releaseRoom: (c) => released.push(c),
    });

    // When
    destroy("CCC");

    // Then
    expect(released).toEqual(["CCC"]);
    expect(store.get("CCC")).toBeUndefined();
    expect(timers.get("CCC")).toBeUndefined();
    expect(rounds.get("CCC")).toBeUndefined();
    expect(topics.get("CCC")).toBeUndefined();
  });
});
