/**
 * problem.request / problem.submit ハンドラ統合テスト
 * T055: FR-025, FR-027 (US3)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeHandlers } from "../src/application/handlers.js";
import { ProblemDelegator } from "../src/application/problem-delegation.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import type { RoomCodeGen } from "../src/ports/code-gen.js";
import type { Broadcaster } from "../src/ports/broadcaster.js";
import type { ServerMsg, SessionConfig, Problem } from "@tdd-mob/core";

class FakeCodeGen implements RoomCodeGen {
  private _c = 0;
  generate(): string { return `PR${String(++this._c).padStart(2, "0")}`; }
  generateParticipantId(): string { return `pid-${++this._c}`; }
  generateResumeToken(): string { return `rt-${++this._c}`; }
}

class SpyBroadcaster implements Broadcaster {
  readonly sent: Array<{ connId: string; msg: ServerMsg }> = [];
  readonly snapshots: string[] = [];
  readonly signals: Array<{ roomCode: string; msg: ServerMsg }> = [];
  broadcastSnapshot(code: string): void { this.snapshots.push(code); }
  sendTo(connId: string, msg: ServerMsg): void { this.sent.push({ connId, msg }); }
  broadcastSignal(code: string, msg: ServerMsg): void { this.signals.push({ roomCode: code, msg }); }
}

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

describe("handlers: problem.request / problem.submit", () => {
  let store: InMemoryRoomStore;
  let clock: FakeClock;
  let broadcaster: SpyBroadcaster;
  let delegator: ProblemDelegator;
  let handlers: ReturnType<typeof makeHandlers>;
  let code: string;
  let hostId: string;

  beforeEach(async () => {
    vi.useFakeTimers();
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
    code = create.value.code;
    hostId = create.value.participantId;

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
    vi.useRealTimers();
  });

  it("editor+ の problem.request で先頭候補へ need-problem が送られる（FR-025）", async () => {
    await handlers.handleCommand("host-conn", {
      command: "problem.request",
      requestId: "req-1",
    });

    const needProblem = broadcaster.sent.find(
      (s) => s.msg.type === "signal" && s.msg.signal === "need-problem",
    );
    expect(needProblem?.connId).toBe("host-conn");
  });

  it("代表の problem.submit で Room.problem が確定する（FR-025）", async () => {
    await handlers.handleCommand("host-conn", {
      command: "problem.request",
      requestId: "req-1",
    });
    await handlers.handleCommand("host-conn", {
      command: "problem.submit",
      requestId: "req-1",
      problem: validProblem,
      usedFallback: false,
    });

    expect(store.get(code)?.problem?.title).toBe("FizzBuzz");
  });

  it("viewer は problem.request を実行できない（FR-017）", async () => {
    const join = await handlers.handleCommand("viewer-conn", {
      command: "room.join",
      code,
      displayName: "Carol",
      hasAiKey: false,
    });
    expect(join.isOk()).toBe(true);
    // 既定 editor を host が viewer へ降格してから制限を検証する。
    const carolPid = store.get(code)!.participants.find((p) => p.displayName === "Carol")!.participantId;
    await handlers.handleCommand("host-conn", {
      command: "role.set",
      participantId: carolPid,
      role: "viewer",
    });
    broadcaster.sent.length = 0;

    await handlers.handleCommand("viewer-conn", {
      command: "problem.request",
      requestId: "req-x",
    });

    const error = broadcaster.sent.find((s) => s.msg.type === "error");
    expect(error?.msg.type === "error" && error.msg.code).toBe("UNAUTHORIZED");
  });
});
