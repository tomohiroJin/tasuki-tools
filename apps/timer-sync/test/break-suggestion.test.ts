/**
 * 休憩提案シグナル（§9.1）の撤去確認テスト
 *
 * v2.10 で休憩機能（suggest-break シグナル配信・break.start/break.end コマンド受理）を撤去。
 * 以下のテストは「巡境界でも suggest-break が配信されない」ことを確認する。
 * break.start/break.end コマンドを送るテストは撤去対象挙動のため削除済み。
 *
 * dormant 残置: core の BreakStarted/BreakEnded イベント・Room.onBreak フィールド・
 * reconcileSchedule の !onBreak 判定は後方互換のため削除しない（§backward-compat）。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { makeHandlers } from "../src/application/handlers.js";
import { Scheduler } from "../src/application/schedule.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import type { SessionConfig } from "@tasuki/timer-core";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";

const INTERVAL_MS = 5 * 60 * 1000;

function suggestBreakCount(spy: SpyBroadcaster): number {
  return spy.signals.filter(
    (s) => s.msg.type === "signal" && (s.msg as { signal: string }).signal === "suggest-break",
  ).length;
}

describe("休憩提案シグナル撤去（v2.10・§9.1）", () => {
  let store: InMemoryRoomStore;
  let broadcaster: SpyBroadcaster;
  let clock: FakeClock;
  let scheduler: Scheduler;
  let handlers: ReturnType<typeof makeHandlers>;

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
    if (created.isOk()) { /* roomCode は使わないが setup は完結させる */ }
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

  it("breakEveryRotations=1 を指定しても自動交代後に suggest-break は配信されない", async () => {
    // Given
    await setup({ breakEveryRotations: 1 });

    // When / Then（1交代目・2交代目＝巡境界・2巡目境界のいずれでも配信されない）
    advanceOneSwitch();
    expect(suggestBreakCount(broadcaster)).toBe(0);
    advanceOneSwitch();
    expect(suggestBreakCount(broadcaster)).toBe(0);
    advanceOneSwitch();
    advanceOneSwitch();
    expect(suggestBreakCount(broadcaster)).toBe(0);
  });

  it("breakEveryRotations 未設定でも suggest-break は配信されない", async () => {
    // Given
    await setup({});

    // When
    advanceOneSwitch();
    advanceOneSwitch();
    advanceOneSwitch();
    advanceOneSwitch();

    // Then
    expect(suggestBreakCount(broadcaster)).toBe(0);
  });

  it("手動スキップ(SWITCH)で巡境界に達しても suggest-break は配信されない", async () => {
    // Given
    await setup({ breakEveryRotations: 1 });

    // When（手動 SWITCH を 2 回 = 2 人ローテーションの 1 巡境界）
    await handlers.handleCommand(hostConn, { command: "session.act", action: "SWITCH" });
    expect(suggestBreakCount(broadcaster)).toBe(0);
    await handlers.handleCommand(hostConn, { command: "session.act", action: "SWITCH" });

    // Then（v2.10 以前は 1 が期待値だったが、撤去後は 0）
    expect(suggestBreakCount(broadcaster)).toBe(0);
  });
});
