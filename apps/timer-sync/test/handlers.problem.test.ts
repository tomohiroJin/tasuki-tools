/**
 * problem.request / problem.submit ハンドラ統合テスト
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "bun:test";
import { makeHandlers } from "../src/application/handlers.js";
import { ProblemDelegator } from "../src/application/problem-delegation.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import type { SessionConfig, Problem } from "@tasuki/timer-core";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";

const config: SessionConfig = {
  language: "TypeScript",
  difficulty: "easy",
  members: ["Alice", "Bob"],
  intervalMinutes: 5,
};

const validProblem: Problem = {
  title: "FizzBuzz",
  description: "d",
  requirements: ["r"],
  exampleTest: "t",
  hints: [],
};

/**
 * @requirements FR-025, FR-027, US3
 */
describe("handlers: problem.request / problem.submit", () => {
  let store: InMemoryRoomStore;
  let clock: FakeClock;
  let broadcaster: SpyBroadcaster;
  let delegator: ProblemDelegator;
  let handlers: ReturnType<typeof makeHandlers>;
  let code: string;
  let hostId: string;

  beforeEach(async () => {
    jest.useFakeTimers();
    store = new InMemoryRoomStore();
    clock = new FakeClock(1000000);
    broadcaster = new SpyBroadcaster();
    delegator = new ProblemDelegator({ store, clock, broadcaster });
    handlers = makeHandlers({ store, clock, broadcaster, codeGen: new FakeCodeGen(), delegator });

    // host が AI 鍵ありでルーム作成（room.create は hasAiKey を持たないため後で更新）
    const create = await handlers.handleCommand("host-conn", {
      command: "room.create",
      displayName: "Alice",
      config,
    });
    if (!create.isOk()) throw new Error("create failed");
    // 本番（server.ts）は handleCommand の戻り値を破棄する。値は本番と同じ観測点から取る（FR-100）。
    code = broadcaster.createdFor("host-conn").code;
    hostId = broadcaster.createdFor("host-conn").participantId;

    // host に AI 鍵を付与
    const room = store.get(code)!;
    store.put({
      ...room,
      participants: room.participants.map((p) =>
        p.participantId === hostId ? { ...p, hasAiKey: true } : p,
      ),
    });
  });

  afterEach(() => {
    delegator.cancelAll();
    jest.useRealTimers();
  });

  it("editor+ の problem.request で先頭候補へ need-problem が送られる", async () => {
    // Given
    const command = { command: "problem.request", requestId: "req-1" } as const;

    // When
    await handlers.handleCommand("host-conn", command);

    // Then
    const needProblem = broadcaster.sent.find(
      (s) => s.msg.type === "signal" && s.msg.signal === "need-problem",
    );
    expect(needProblem?.connId).toBe("host-conn");
  });

  it("代表の problem.submit で Room.problem が確定する", async () => {
    // Given（先に problem.request で代表を確定させる）
    await handlers.handleCommand("host-conn", {
      command: "problem.request",
      requestId: "req-1",
    });
    const command = {
      command: "problem.submit",
      requestId: "req-1",
      problem: validProblem,
      usedFallback: false,
    } as const;

    // When
    await handlers.handleCommand("host-conn", command);

    // Then
    expect(store.get(code)?.problem?.title).toBe("FizzBuzz");
  });

  it("viewer は problem.request を実行できない", async () => {
    // Given（既定 editor を host が viewer へ降格してから制限を検証する）
    const join = await handlers.handleCommand("viewer-conn", {
      command: "room.join",
      code,
      displayName: "Carol",
      hasAiKey: false,
    });
    join._unsafeUnwrap();
    const carolPid = store.get(code)!.participants.find((p) => p.displayName === "Carol")!.participantId;
    await handlers.handleCommand("host-conn", {
      command: "role.set",
      participantId: carolPid,
      role: "viewer",
    });
    broadcaster.sent.length = 0;

    // When
    await handlers.handleCommand("viewer-conn", {
      command: "problem.request",
      requestId: "req-x",
    });

    // Then
    const error = broadcaster.sent.find((s) => s.msg.type === "error");
    expect(error?.msg.type === "error" && error.msg.code).toBe("UNAUTHORIZED");
  });
});
