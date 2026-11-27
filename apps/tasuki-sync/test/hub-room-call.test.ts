/**
 * ハブのメッセージ層が `room.call`（全員を同じ道具へ呼ぶ・#677）をどう扱うか。
 *
 * 宛先の選び方・連打の境界そのものは `room-call.test.ts`、実 WebSocket 越しは `live-ws.room-call.test.ts`。
 * ここは「在席しているか・綴りが実在するか・歯止めに掛かるか」の順と、**誰に何が返るか**を見る。
 */
import { describe, expect, it } from "bun:test";
import { createTokenBucketLimiter, DEFAULT_CAPACITY, DEFAULT_REFILL_PER_SEC } from "@tasuki/rate-limit";
import type { Participant, RoomCallFrame } from "@tasuki/room-core";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { InMemoryTimerStore } from "../src/adapters/in-memory-timer-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import { makeHubHandlers } from "../src/application/hub-handlers.js";
import { createRateLimitGate } from "../src/application/rate-limit-gate.js";
import { CALL_INTERVAL_MS, CALL_TOO_SOON_MESSAGE, createRoomCallGate } from "../src/application/room-call.js";
import { createTokenStore } from "../src/application/token-store.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";
import { spyHub } from "./support/hub.js";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { TEST_MAX_ROOMS } from "./support/room-builder.js";

const ROOM = "ROOM-A";

function person(id: string, displayName: string, conns: Record<string, string | null>): Participant {
  return { id, displayName, connections: new Map(Object.entries(conns)), joinedAt: 0 };
}

/** アリス（ハブ a-hub・timer a-timer）・ボブ（ハブ b-hub）・キャロル（poker c-poker）・切断中のデイブの部屋。 */
function setup() {
  const store = new InMemoryRoomStore();
  store.put({
    code: ROOM,
    createdAt: 0,
    participants: [
      person("alice", "アリス", { "a-hub": null, "a-timer": "timer" }),
      person("bob", "ボブ", { "b-hub": null }),
      person("carol", "キャロル", { "c-poker": "poker" }),
      person("dave", "デイブ", {}),
    ],
  });
  let now = 10_000;
  const hub = spyHub();
  const calls: { connIds: string[]; frame: RoomCallFrame }[] = [];
  const handlers = makeHubHandlers({
    store,
    timers: new InMemoryTimerStore(),
    clock: new FakeClock(1_000_000),
    monotonicClock: { now: () => now },
    codeGen: new FakeCodeGen(),
    tokenStore: createTokenStore(),
    rateLimitGate: createRateLimitGate(
      createTokenBucketLimiter({ capacity: DEFAULT_CAPACITY, refillPerSec: DEFAULT_REFILL_PER_SEC }),
    ),
    maxRooms: TEST_MAX_ROOMS,
    hub,
    timerBroadcaster: new SpyBroadcaster(),
    topicBroadcaster: { sendCurrent: () => {} },
    roomCalls: createRoomCallGate({ now: () => now }),
    sendCall: (connIds, frame) => calls.push({ connIds, frame }),
  });
  const call = (connId: string, tool: unknown) =>
    handlers.handleMessage(connId, JSON.stringify({ command: "room.call", tool }));
  return { handlers, hub, store, calls, call, advance: (ms: number) => (now += ms) };
}

describe("ハブの room.call", () => {
  it("Given ハブに居る人 / When poker へ呼ぶ / Then その道具に居ない人のすべての接続へ、呼んだ人の名前つきで配る", async () => {
    const { call, calls } = setup();

    await call("a-hub", "poker");

    expect(calls).toEqual([
      {
        connIds: ["b-hub"],
        frame: { type: "room.call", call: { tool: "poker", fromParticipantId: "alice", fromName: "アリス" } },
      },
    ]);
  });

  it("Given ハブに居る人 / When timer へ呼ぶ / Then timer に居ない人（poker の人）へ出し、timer に居る呼んだ本人のほかの接続には出さない", async () => {
    const { call, calls } = setup();

    await call("b-hub", "timer");

    expect(calls[0]?.connIds).toEqual(["c-poker"]);
  });

  it("Given 呼びかけを受け付けた / When 結果を見る / Then 受け付け room.called は呼んだ接続にだけ返る（配った知らせとは別）", async () => {
    const { call, hub } = setup();

    await call("a-hub", "poker");

    expect(hub.sent).toEqual([{ connId: "a-hub", msg: { type: "room.called", tool: "poker" } }]);
  });

  it("Given 宛先が 0 人になる呼びかけ（ほかの人は全員その道具に居る・切断中） / When 呼ぶ / Then 宛先は空だが、受け付けは返す", async () => {
    const { call, calls, hub, store } = setup();
    store.put({
      code: ROOM,
      createdAt: 0,
      participants: [person("alice", "アリス", { "a-hub": null }), person("dave", "デイブ", {}), person("erin", "エリン", { "e-poker": "poker" })],
    });

    await call("a-hub", "poker");

    expect(calls.map((c) => c.connIds)).toEqual([[]]);
    expect(hub.sent).toEqual([{ connId: "a-hub", msg: { type: "room.called", tool: "poker" } }]);
  });

  it("Given 知らない道具の綴り / When 呼ぶ / Then INVALID_COMMAND を返し、配らず、歯止めの時刻も使わない", async () => {
    const { call, calls, hub } = setup();

    await call("a-hub", "nonexistent");

    expect(calls).toEqual([]);
    expect(hub.sent).toEqual([
      { connId: "a-hub", msg: { type: "error", code: "INVALID_COMMAND", message: "コマンドの形式が不正です" } },
    ]);
    // 綴りの誤りが歯止めの枠を食っていない
    hub.sent.length = 0;
    await call("a-hub", "poker");
    expect(calls).toHaveLength(1);
  });

  it("Given ハブとして在席していない接続（timer の接続） / When 呼ぶ / Then NOT_IN_ROOM で拒み、配らない", async () => {
    const { call, calls, hub } = setup();

    await call("a-timer", "poker");

    expect(calls).toEqual([]);
    expect(hub.sent).toEqual([
      { connId: "a-timer", msg: { type: "error", code: "NOT_IN_ROOM", message: "ルームに参加していません" } },
    ]);
  });

  it("Given どのルームにも居ない接続 / When 呼ぶ / Then NOT_IN_ROOM", async () => {
    const { call, calls, hub } = setup();

    await call("stranger", "poker");

    expect(calls).toEqual([]);
    expect(hub.sent[0]?.msg).toMatchObject({ type: "error", code: "NOT_IN_ROOM" });
  });

  it("Given 受け付けた直後 / When 5 秒たたないうちに別の人が呼ぶ / Then 配らず、呼んだ人だけに CALL_TOO_SOON を返す", async () => {
    const { call, calls, hub, advance } = setup();
    await call("a-hub", "poker");
    calls.length = 0;
    hub.sent.length = 0;

    advance(CALL_INTERVAL_MS - 1);
    await call("b-hub", "timer");

    expect(calls).toEqual([]);
    expect(hub.sent).toEqual([
      { connId: "b-hub", msg: { type: "error", code: "CALL_TOO_SOON", message: CALL_TOO_SOON_MESSAGE } },
    ]);
  });

  it("Given 受け付けた直後 / When ちょうど 5 秒後に呼ぶ / Then 配る", async () => {
    const { call, calls, advance } = setup();
    await call("a-hub", "poker");

    advance(CALL_INTERVAL_MS);
    await call("b-hub", "timer");

    expect(calls).toHaveLength(2);
  });

  it("Given 余計な項目つきのコマンド / When 呼ぶ / Then 境界で INVALID_COMMAND（strict）", async () => {
    const { handlers, calls, hub } = setup();

    await handlers.handleMessage("a-hub", JSON.stringify({ command: "room.call", tool: "poker", code: "OTHER" }));

    expect(calls).toEqual([]);
    expect(hub.sent[0]?.msg).toMatchObject({ type: "error", code: "INVALID_COMMAND" });
  });
});
