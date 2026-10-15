/**
 * ツールの入口（hub・topic・roulette）の参加のユースケース（`join-tool-room.ts`・#366 Task 4）の単体テスト。
 *
 * 3 つの入口が同じ流れを写して持っていたものを 1 つにした。入口ごとの違いは、ツール ID・返事を送る口・
 * 参加の後に送る 1 通の 3 つで、引数で受ける。入口ごとに送るフレームは
 * `live-ws.join-entries.test.ts`（実 WS 越しの特性テスト）が固定している。
 */
import { describe, expect, it } from "bun:test";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { createTokenBucketLimiter, DEFAULT_CAPACITY, DEFAULT_REFILL_PER_SEC } from "@tasuki/rate-limit";
import type { HubServerMsg } from "@tasuki/room-core";
import { errorMessageFor } from "@tasuki/timer-core";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { InMemoryTimerStore } from "../src/adapters/in-memory-timer-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import { CONNECTION_ERROR_TEXT } from "../src/application/connection-errors.js";
import { INVALID_DISPLAY_NAME_MESSAGE } from "../src/application/display-name-rule.js";
import { joinFailureMessage, ROOM_NOT_FOUND_MESSAGE, type JoinRoomOutcome } from "../src/application/join-room.js";
import { joinToolRoom } from "../src/application/join-tool-room.js";
import { createRateLimitGate } from "../src/application/rate-limit-gate.js";
import { createTokenStore } from "../src/application/token-store.js";
import { TOOL_TOPIC } from "../src/application/tool-id.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";
import { spyHub } from "./support/hub.js";
import { testMonotonicClock } from "./support/test-clocks.js";

const ROOM = "ROOM-A";

function setup() {
  const store = new InMemoryRoomStore();
  store.put({ code: ROOM, createdAt: 0, participants: [] });
  const hub = spyHub();
  const deps = {
    store,
    monotonicClock: testMonotonicClock,
    timers: new InMemoryTimerStore(),
    clock: new FakeClock(1_000_000),
    codeGen: new FakeCodeGen(),
    tokenStore: createTokenStore(),
    rateLimitGate: createRateLimitGate(
      createTokenBucketLimiter({ capacity: DEFAULT_CAPACITY, refillPerSec: DEFAULT_REFILL_PER_SEC }),
    ),
    hub,
    timerBroadcaster: new SpyBroadcaster(),
  };
  /** 起きたことを順に記録する（返事・名簿の配信・参加の後の 1 通）。 */
  const events: string[] = [];
  const replies: HubServerMsg[] = [];
  const outcomes: JoinRoomOutcome[] = [];
  const join = (connId: string, displayName: string, code = ROOM) =>
    joinToolRoom(deps, {
      connId,
      cmd: { command: "room.join", code, displayName },
      tool: TOOL_TOPIC,
      reply: (msg) => {
        replies.push(msg);
        events.push(`reply:${msg.type}`);
      },
      afterJoin: (outcome) => {
        outcomes.push(outcome);
        events.push(`after:${hub.rosterCalls.length}`);
      },
    });
  return { store, hub, events, replies, outcomes, join };
}

describe("joinFailureMessage（参加の失敗の文言）", () => {
  it("Given ROOM_NOT_FOUND / When 文言を引く / Then 存在しないルームの文言（合言葉の拒否と区別させない・ADR 0011）", () => {
    expect(joinFailureMessage("ROOM_NOT_FOUND")).toBe(ROOM_NOT_FOUND_MESSAGE);
  });

  it("Given ほかのコード / When 文言を引く / Then timer-core の文言表の文", () => {
    for (const code of ["PASSPHRASE_REQUIRED", "PASSPHRASE_MISMATCH", "JOIN_RATE_LIMITED"] as const) {
      expect(joinFailureMessage(code)).toBe(errorMessageFor(code));
    }
  });
});

describe("joinToolRoom（ツールの入口の参加）", () => {
  it("Given 空のルーム / When 参加する / Then room.joined を返し、名簿を保管して配ってから、参加の後の 1 通を送る（この順）", () => {
    // Given
    const h = setup();
    // When
    h.join("c-1", "さくら");
    // Then
    expect(h.events).toEqual(["reply:room.joined", "after:1"]);
    expect(h.replies[0]).toMatchObject({ type: "room.joined", code: ROOM });
    expect(h.store.get(ROOM)!.participants.map((p) => p.displayName)).toEqual(["さくら"]);
    expect(h.outcomes[0]?.kind).toBe("joined");
  });

  it("Given 参加済みの接続 / When もう一度参加する / Then INVALID_COMMAND（コマンドの形式が不正です）を返し、何も変えない", () => {
    // Given
    const h = setup();
    h.join("c-1", "さくら");
    h.events.length = 0;
    // When
    h.join("c-1", "さくら");
    // Then
    expect(h.replies.at(-1)).toEqual({
      type: "error",
      code: "INVALID_COMMAND",
      message: CONNECTION_ERROR_TEXT.INVALID_COMMAND,
    });
    expect(h.events).toEqual(["reply:error"]);
    expect(h.store.get(ROOM)!.participants).toHaveLength(1);
  });

  it("Given 規約に合わない表示名 / When 参加する / Then INVALID_COMMAND（表示名の文言）を返し、何も変えない", () => {
    // Given
    const h = setup();
    // When
    h.join("c-1", "​");
    // Then
    expect(h.replies).toEqual([{ type: "error", code: "INVALID_COMMAND", message: INVALID_DISPLAY_NAME_MESSAGE }]);
    expect(h.store.get(ROOM)!.participants).toEqual([]);
  });

  it("Given 無いルーム / When 参加する / Then ROOM_NOT_FOUND とその文言を返し、参加の後の 1 通は送らない", () => {
    // Given
    const h = setup();
    // When
    h.join("c-1", "さくら", "NOPE");
    // Then
    expect(h.replies).toEqual([{ type: "error", code: "ROOM_NOT_FOUND", message: ROOM_NOT_FOUND_MESSAGE }]);
    expect(h.events).toEqual(["reply:error"]);
  });
});
