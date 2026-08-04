/**
 * 自己退出した本人への通知（Issue #32）。
 *
 * 自分で「ルームから抜ける」を押した本人だけが、退出が成立したことを知らされず
 * 操作できない画面に取り残される問題を解く。他者に退出させられた場合は既に
 * REMOVED_FROM_ROOM が本人へ届いているが、自己退出はこの経路が意図的に
 * 抑止されていた。本人自身の操作によるものと分かる別種のコード LEFT_ROOM を
 * 新設し、必ず本人の接続へ届くことを検証する。
 *
 * @requirements FR-124, FR-125, FR-129, US1-1, US1-4
 */

import { describe, it, expect, beforeEach } from "vitest";
import { makeHandlers } from "../src/application/handlers.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import type { SessionConfig } from "@tasuki/timer-core";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";

const config: SessionConfig = {
  language: "TypeScript",
  difficulty: "easy",
  members: ["Alice", "Bob", "Carol"],
  intervalMinutes: 5,
};

const HOST = "sl-host";
const BOB = "sl-bob";
const CAROL = "sl-carol";

/**
 * @requirements FR-124, US1-1
 */
describe("自己退出した本人への通知", () => {
  let store: InMemoryRoomStore;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;
  let code: string;

  const pidOf = (name: string): string =>
    store.get(code)!.participants.find((p) => p.displayName === name)!.participantId;

  beforeEach(async () => {
    store = new InMemoryRoomStore();
    broadcaster = new SpyBroadcaster();
    handlers = makeHandlers({
      store, clock: new FakeClock(1_000_000), broadcaster, codeGen: new FakeCodeGen(),
    });
    const created = await handlers.handleCommand(HOST, {
      command: "room.create", displayName: "Alice", config,
    });
    if (!created.isOk()) throw new Error("room.create failed");
    code = broadcaster.createdFor(HOST).code;
    await handlers.handleCommand(BOB, { command: "room.join", code, displayName: "Bob", hasAiKey: false });
    await handlers.handleCommand(CAROL, { command: "room.join", code, displayName: "Carol", hasAiKey: false });
    await handlers.handleCommand(HOST, { command: "phase.set", phase: "session" });
    broadcaster.sent.length = 0;
  });

  it("自分自身を対象に退出が受理されたとき、本人の接続へ LEFT_ROOM が届く", async () => {
    // Given
    const carolId = pidOf("Carol");

    // When
    const result = await handlers.handleCommand(CAROL, { command: "participant.remove", participantId: carolId });

    // Then
    result._unsafeUnwrap();
    expect(broadcaster.hasErrorCode(CAROL, "LEFT_ROOM")).toBe(true);
  });

  it("他者を対象に退出が受理されたとき、対象へ REMOVED_FROM_ROOM が届き LEFT_ROOM は届かない", async () => {
    // Given
    const carolId = pidOf("Carol");

    // When
    const result = await handlers.handleCommand(BOB, { command: "participant.remove", participantId: carolId });

    // Then
    result._unsafeUnwrap();
    expect(broadcaster.hasErrorCode(CAROL, "REMOVED_FROM_ROOM")).toBe(true);
    expect(broadcaster.hasErrorCode(CAROL, "LEFT_ROOM")).toBe(false);
    const notice = broadcaster.errorsTo(CAROL).find((msg) => msg.code === "REMOVED_FROM_ROOM");
    expect(notice?.message).toBe("Bob さんにより退出させられました。招待から再参加できます。");
  });

  it("代理（接続を持たない参加者）を対象に退出が受理されたとき、対象へ何も送られない", async () => {
    // Given
    const proxyResult = await handlers.handleCommand(HOST, {
      command: "participant.addProxy", displayName: "Dave", participantId: "ignored-client-supplied",
    });
    proxyResult._unsafeUnwrap();
    const proxyId = pidOf("Dave");
    broadcaster.sent.length = 0;

    // When
    const result = await handlers.handleCommand(BOB, { command: "participant.remove", participantId: proxyId });

    // Then
    result._unsafeUnwrap();
    expect(broadcaster.sent.filter((s) => s.msg.type === "error")).toEqual([]);
  });

  it("退出が拒否されたとき（進行できる人が残らない）、退出通知は届かない", async () => {
    // Given（Bob・Carol を見学者に降格し、Alice(host) だけが編集者以上の状態にする）
    await handlers.handleCommand(HOST, { command: "role.set", participantId: pidOf("Bob"), role: "viewer" });
    await handlers.handleCommand(HOST, { command: "role.set", participantId: pidOf("Carol"), role: "viewer" });
    broadcaster.sent.length = 0;

    // When（最後の編集者以上である host 自身の退出は拒否される）
    const aliceId = pidOf("Alice");
    const result = await handlers.handleCommand(HOST, { command: "participant.remove", participantId: aliceId });

    // Then
    expect(result.isErr()).toBe(true);
    expect(broadcaster.hasErrorCode(HOST, "LEFT_ROOM")).toBe(false);
    expect(broadcaster.hasErrorCode(HOST, "REMOVED_FROM_ROOM")).toBe(false);
  });
});
