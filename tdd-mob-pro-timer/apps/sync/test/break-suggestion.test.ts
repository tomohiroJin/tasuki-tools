/**
 * 休憩提案シグナル（§9.1 breakEveryRotations）の結合テスト
 *
 * 自動交代が breakEveryRotations 巡（= rotation 長 × N 回の交代）に達するたび、
 * サーバーが suggest-break シグナルを配信することを検証する。
 * シグナルは演出専用（§5.2）で状態ではない。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { makeHandlers } from "../src/application/handlers.js";
import { Scheduler } from "../src/application/schedule.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import type { RoomCodeGen } from "../src/ports/code-gen.js";
import type { Broadcaster } from "../src/ports/broadcaster.js";
import type { Room, ServerMsg, SessionConfig } from "@tdd-mob/core";

class FakeCodeGen implements RoomCodeGen {
  private _c = 0;
  generate(): string { return `BRK${String(++this._c).padStart(3, "0")}`; }
  generateParticipantId(): string { return `pid-${++this._c}`; }
  generateResumeToken(): string { return `rt-${++this._c}`; }
}

class SpyBroadcaster implements Broadcaster {
  readonly signals: ServerMsg[] = [];
  broadcastSnapshot(): void {}
  sendTo(): void {}
  broadcastSignal(_code: string, msg: ServerMsg): void { this.signals.push(msg); }
}

const INTERVAL_MS = 5 * 60 * 1000;

function suggestBreakCount(spy: SpyBroadcaster): number {
  return spy.signals.filter(
    (m) => m.type === "signal" && (m as { signal: string }).signal === "suggest-break",
  ).length;
}

describe("休憩提案シグナル（§9.1）", () => {
  let store: InMemoryRoomStore;
  let broadcaster: SpyBroadcaster;
  let clock: FakeClock;
  let scheduler: Scheduler;
  let handlers: ReturnType<typeof makeHandlers>;
  let roomCode: string;
  const hostConn = "host-conn";

  async function setup(config: Partial<SessionConfig>) {
    store = new InMemoryRoomStore();
    broadcaster = new SpyBroadcaster();
    clock = new FakeClock(1_000_000);
    scheduler = new Scheduler(clock);
    handlers = makeHandlers({ store, clock, broadcaster, codeGen: new FakeCodeGen(), scheduler });

    const created = await handlers.handleCommand(hostConn, {
      command: "room.create",
      displayName: "Alice",
      config: {
        language: "TypeScript",
        difficulty: "easy",
        members: ["Alice", "Bob"],
        intervalMinutes: 5,
        ...config,
      },
    });
    if (created.isOk()) roomCode = created.value.code;
    await handlers.handleCommand(hostConn, { command: "session.act", action: "START" });
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    scheduler.clearAll();
    vi.useRealTimers();
  });

  /** FakeClock を進めつつ次の自動交代を発火させる（クロックとタイマーを同期前進）。 */
  function advanceOneSwitch() {
    clock.advance(INTERVAL_MS);
    vi.advanceTimersByTime(INTERVAL_MS + 100);
  }

  it("breakEveryRotations=1 のとき 1 巡（2交代）ごとに suggest-break が出る", async () => {
    await setup({ breakEveryRotations: 1 });
    expect(suggestBreakCount(broadcaster)).toBe(0);
    advanceOneSwitch(); // 1 交代目（巡の途中）
    expect(suggestBreakCount(broadcaster)).toBe(0);
    advanceOneSwitch(); // 2 交代目 = 1 巡完了
    expect(suggestBreakCount(broadcaster)).toBe(1);
    advanceOneSwitch();
    advanceOneSwitch(); // 2 巡完了
    expect(suggestBreakCount(broadcaster)).toBe(2);
  });

  it("breakEveryRotations 未設定なら suggest-break は出ない", async () => {
    await setup({});
    advanceOneSwitch();
    advanceOneSwitch();
    advanceOneSwitch();
    advanceOneSwitch();
    expect(suggestBreakCount(broadcaster)).toBe(0);
  });

  it("手動スキップ(SWITCH)で巡境界に達しても suggest-break が出る（レビュー #3）", async () => {
    await setup({ breakEveryRotations: 1 });
    // 手動 SWITCH を 2 回 = 2 人ローテーションの 1 巡
    await handlers.handleCommand(hostConn, { command: "session.act", action: "SWITCH" });
    expect(suggestBreakCount(broadcaster)).toBe(0);
    await handlers.handleCommand(hostConn, { command: "session.act", action: "SWITCH" });
    expect(suggestBreakCount(broadcaster)).toBe(1);
  });
});
