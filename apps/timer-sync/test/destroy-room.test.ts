/**
 * ルーム破棄の共通経路（Issue #79）。
 *
 * ルームが消える契機は「アイドル回収（TTL）」と「在室者が 0 人になる退出」の 2 つある。
 * ルームを store から消すだけでは足りず、自動交代の予約・お題生成の委譲・不在検知の
 * タイマー・トークンはいずれも roomCode をキーに別々の Map で生きている。
 * 2 つの契機がそれぞれ後始末を並べると片方だけ更新されて必ずずれるため、
 * 内容と順序を 1 箇所に固定し、両方が同じ関数を通ることをここで固定する。
 *
 * @requirements Issue #79
 */

import { describe, it, expect } from "bun:test";
import { createRoomDestroyer } from "../src/application/destroy-room.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { spyDestroyer } from "./support/spy-destroyer.js";

describe("createRoomDestroyer", () => {
  it("タイマー・委譲・presence・トークンを解放してからルームを消す", () => {
    // Given
    const store = new InMemoryRoomStore();
    const { destroy, calls } = spyDestroyer(store);

    // When
    destroy("AAA");

    // Then: 発火しうるものを先に止め、最後に実体を消す
    // （先に消すと停止処理中に発火したタイマーが参照先の無いルームを触りうる）
    expect(calls).toEqual([
      "scheduler.clear:AAA",
      "delegator.cancel:AAA",
      "presence.clearRoomTimers:AAA",
      "releaseRoom:AAA",
    ]);
  });

  it("ルームをストアから取り除く", () => {
    // Given
    const store = new InMemoryRoomStore();
    store.put({ code: "BBB", participants: [] } as never);
    const { destroy } = spyDestroyer(store);

    // When
    destroy("BBB");

    // Then
    expect(store.get("BBB")).toBeUndefined();
  });

  it("スケジューラ・委譲・presence を持たない構成でも解放とストア削除は行う", () => {
    // Given: makeHandlers 単体（scheduler/delegator を省略できる）で組んだ場合
    const store = new InMemoryRoomStore();
    store.put({ code: "CCC", participants: [] } as never);
    const released: string[] = [];
    const destroy = createRoomDestroyer({ store, releaseRoom: (c) => released.push(c) });

    // When
    destroy("CCC");

    // Then
    expect(released).toEqual(["CCC"]);
    expect(store.get("CCC")).toBeUndefined();
  });
});
