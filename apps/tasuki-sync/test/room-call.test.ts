/**
 * 呼びかけの規則（`application/room-call.ts`・#677）。宛先の選び方と、連打の歯止め。
 *
 * ハブのメッセージ層の組み合わせ（在席・綴り・受け付けの返し）は `hub-room-call.test.ts`、
 * 実 WebSocket 越しの届き方は `live-ws.room-call.test.ts` が見る。
 */
import { describe, expect, it } from "bun:test";
import type { Participant, Room } from "@tasuki/room-core";
import { CALL_INTERVAL_MS, callRecipients, createRoomCallGate } from "../src/application/room-call.js";

/** 参加者を作る。`conns` は 接続 ID → その接続が居るツール（ハブは null）。 */
function person(id: string, conns: Record<string, string | null>): Participant {
  return { id, displayName: id, connections: new Map(Object.entries(conns)), joinedAt: 0 };
}

function roomOf(...participants: Participant[]): Room {
  return { code: "ROOM", createdAt: 0, participants };
}

describe("callRecipients（宛先の選び方）", () => {
  it("Given 呼んだ人と、ハブに居る人 / When 呼ぶ / Then 呼んだ人本人の接続は宛先に入らず、ほかの人のハブの接続は入る", () => {
    const room = roomOf(person("alice", { a1: null }), person("bob", { b1: null }));

    expect(callRecipients(room, "a1", "poker")).toEqual(["b1"]);
  });

  it("Given 呼んだ人がハブと別の道具の 2 本を持つ / When ハブから呼ぶ / Then 呼んだ人のもう 1 本の接続にも出さない", () => {
    const room = roomOf(person("alice", { a1: null, a2: "timer" }), person("bob", { b1: null }));

    expect(callRecipients(room, "a1", "poker")).toEqual(["b1"]);
  });

  it("Given その道具に接続を持つ人 / When その道具へ呼ぶ / Then その人は宛先に入らない（ほかの接続も含めて）", () => {
    const room = roomOf(
      person("alice", { a1: null }),
      person("bob", { b1: "poker", b2: null }),
      person("carol", { c1: "timer" }),
    );

    expect(callRecipients(room, "a1", "poker")).toEqual(["c1"]);
  });

  it("Given 1 人が複数の接続を持つ / When 呼ぶ / Then その人のすべての接続（ハブ・ほかの道具）が宛先に入る", () => {
    const room = roomOf(person("alice", { a1: null }), person("bob", { b1: null, b2: "timer", b3: "topic" }));

    expect(callRecipients(room, "a1", "poker")).toEqual(["b1", "b2", "b3"]);
  });

  it("Given 接続の無い人（切断中） / When 呼ぶ / Then 宛先に入らない", () => {
    const room = roomOf(person("alice", { a1: null }), person("bob", {}));

    expect(callRecipients(room, "a1", "poker")).toEqual([]);
  });

  it("Given 呼んだ人しか居ない / When 呼ぶ / Then 宛先は空", () => {
    expect(callRecipients(roomOf(person("alice", { a1: null })), "a1", "poker")).toEqual([]);
  });
});

describe("createRoomCallGate（連打の歯止め）", () => {
  function gateAt() {
    let t = 1_000;
    const gate = createRoomCallGate({ now: () => t });
    return { gate, set: (v: number) => (t = v) };
  }

  it("Given まだ呼んでいないルーム / When 受け付ける / Then 通る", () => {
    expect(gateAt().gate.tryAccept("R")).toBe(true);
  });

  it("Given 受け付けた直後 / When 間隔に 1ms 足りない / Then 拒む", () => {
    const { gate, set } = gateAt();
    gate.tryAccept("R");

    set(1_000 + CALL_INTERVAL_MS - 1);

    expect(gate.tryAccept("R")).toBe(false);
  });

  it("Given 受け付けた直後 / When ちょうど間隔がたつ / Then 通す（境界は通す側）", () => {
    const { gate, set } = gateAt();
    gate.tryAccept("R");

    set(1_000 + CALL_INTERVAL_MS);

    expect(gate.tryAccept("R")).toBe(true);
  });

  it("Given 受け付けた直後 / When 拒まれた呼びかけが続く / Then 拒んだ時刻は更新されず、最初の受け付けから数えて通る", () => {
    const { gate, set } = gateAt();
    gate.tryAccept("R");
    set(1_000 + CALL_INTERVAL_MS - 1);
    expect(gate.tryAccept("R")).toBe(false);

    // 拒まれた時刻から数え直していれば、ここはまだ拒まれる
    set(1_000 + CALL_INTERVAL_MS);

    expect(gate.tryAccept("R")).toBe(true);
  });

  it("Given あるルームで受け付けた / When 別のルームで呼ぶ / Then 別のルームの歯止めは別である", () => {
    const { gate } = gateAt();
    gate.tryAccept("R");

    expect(gate.tryAccept("S")).toBe(true);
  });

  it("Given 受け付けた直後 / When ルームを破棄する（clearRoom） / Then 時刻が消えて、すぐ受け付けられる", () => {
    const { gate } = gateAt();
    gate.tryAccept("R");

    gate.clearRoom("R");

    expect(gate.tryAccept("R")).toBe(true);
  });
});
