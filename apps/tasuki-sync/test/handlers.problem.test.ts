/**
 * problem.request / problem.submit ハンドラ統合テスト
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "bun:test";
import { makeHandlers } from "../src/application/handlers.js";
import { makeTestHandlers } from "./support/room-builder.js";
import { ProblemDelegator } from "../src/application/problem-delegation.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import type { SessionConfig, Problem } from "@tasuki/timer-core";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";
import { testLogger, testRefEncoder } from "./support/test-logger.js";

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
  let creatorId: string;

  beforeEach(async () => {
    jest.useFakeTimers();
    store = new InMemoryRoomStore();
    clock = new FakeClock(1000000);
    broadcaster = new SpyBroadcaster();
    delegator = new ProblemDelegator({ store, clock, broadcaster, logger: testLogger, refEncoder: testRefEncoder });
    handlers = makeTestHandlers({ store, clock, broadcaster, codeGen: new FakeCodeGen(), delegator });

    // 作成者が AI 鍵ありでルーム作成（room.create は hasAiKey を持たないため後で更新）
    const create = await handlers.handleCommand("host-conn", {
      command: "room.create",
      displayName: "Alice",
      config,
    });
    if (!create.isOk()) throw new Error("create failed");
    // 本番（server.ts）は handleCommand の戻り値を破棄する。値は本番と同じ観測点から取る（FR-100）。
    code = broadcaster.createdFor("host-conn").code;
    creatorId = broadcaster.createdFor("host-conn").participantId;

    // 作成者に AI 鍵を付与
    const room = store.get(code)!;
    store.put({
      ...room,
      participants: room.participants.map((p) =>
        p.participantId === creatorId ? { ...p, hasAiKey: true } : p,
      ),
    });
  });

  afterEach(() => {
    delegator.cancelAll();
    jest.useRealTimers();
  });

  it("problem.request で先頭候補へ need-problem が送られる", async () => {
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

  // #95 S3 以前は「見学者は problem.request を実行できない（UNAUTHORIZED）」ことを
  // ここで固定していた。役割の廃止で在室者なら誰でも要求できるようになったため、
  // 期待を反転させて「要求が委譲へ届く」ことを固定する。
  it("後から参加した人も problem.request を実行でき、代表へ need-problem が送られる", async () => {
    // Given（AI 鍵を持たない参加者が後から加わる。代表は AI 鍵を持つ作成者になる）
    const join = await handlers.handleCommand("guest-conn", {
      command: "room.join",
      code,
      displayName: "Carol",
      hasAiKey: false,
    });
    join._unsafeUnwrap();
    broadcaster.sent.length = 0;

    // When
    await handlers.handleCommand("guest-conn", {
      command: "problem.request",
      requestId: "req-x",
    });

    // Then（拒否されず、代表（作成者）へ need-problem が届く）
    expect(broadcaster.errorsTo("guest-conn")).toEqual([]);
    const needProblem = broadcaster.sent.find(
      (s) => s.msg.type === "signal" && s.msg.signal === "need-problem",
    );
    expect(needProblem?.connId).toBe("host-conn");
  });

  /**
   * 旧 `permissions-after-start.test.ts` が「権限層は通過し、その先の委譲層で止まる」
   * ことの確認として持っていた性質。権限層が無くなっても、**委譲が配線されていなければ
   * 断られる**という境界は残るので、ここへ引き取って単独で固定する。
   *
   * @requirements FR-025
   */
  it("委譲が配線されていないハンドラでは problem.request が DELEGATION_UNAVAILABLE で断られる", async () => {
    // Given（delegator を渡さずに組んだハンドラでルームを作る）
    const bare = makeTestHandlers({
      store: new InMemoryRoomStore(),
      clock: new FakeClock(1000000),
      broadcaster,
      codeGen: new FakeCodeGen(),
    });
    await bare.handleCommand("bare-conn", { command: "room.create", displayName: "Alice" });
    broadcaster.sent.length = 0;

    // When
    const result = await bare.handleCommand("bare-conn", {
      command: "problem.request",
      requestId: "req-bare",
    });

    // Then
    expect(result.isErr()).toBe(true);
    expect(broadcaster.errorsTo("bare-conn").at(-1)?.code).toBe("DELEGATION_UNAVAILABLE");
  });
});
