/**
 * CommandSchema の境界バリデーションのテスト
 * host.transfer コマンドの追加分（v2.2 R2-3）を中心に検証する。
 */

import { describe, it, expect } from "vitest";
import * as v from "valibot";
import { CommandSchema, RoomSchema } from "../src/index.js";

describe("CommandSchema host.transfer", () => {
  it("participantId 付きの host.transfer は success", () => {
    const result = v.safeParse(CommandSchema, {
      command: "host.transfer",
      participantId: "p2",
    });
    expect(result.success).toBe(true);
  });

  it("participantId 欠落の host.transfer は failure", () => {
    const result = v.safeParse(CommandSchema, {
      command: "host.transfer",
    });
    expect(result.success).toBe(false);
  });
});

describe("SessionConfigSchema 言語・難易度の境界", () => {
  const baseConfig = {
    members: ["Alice"],
    intervalMinutes: 5,
  };

  it("正常な言語・難易度の config.set を受理する", () => {
    const result = v.safeParse(CommandSchema, {
      command: "config.set",
      config: { ...baseConfig, language: "TypeScript", difficulty: "easy" },
    });
    expect(result.success).toBe(true);
  });

  it("言語が上限超過（41 字）の config.set を拒否する", () => {
    const result = v.safeParse(CommandSchema, {
      command: "config.set",
      config: { ...baseConfig, language: "x".repeat(41), difficulty: "easy" },
    });
    expect(result.success).toBe(false);
  });

  it("難易度が上限超過（21 字）の config.set を拒否する", () => {
    const result = v.safeParse(CommandSchema, {
      command: "config.set",
      config: { ...baseConfig, language: "TypeScript", difficulty: "x".repeat(21) },
    });
    expect(result.success).toBe(false);
  });

  it("巨大な言語文字列（プロンプト膨張狙い）を拒否する", () => {
    const result = v.safeParse(CommandSchema, {
      command: "config.set",
      config: { ...baseConfig, language: "x".repeat(100_000), difficulty: "easy" },
    });
    expect(result.success).toBe(false);
  });
});

describe("RoomSchema startedAt（後方互換・単調フラグ）", () => {
  /** startedAt を含まない最小 Room オブジェクト（v2 以前の既存形式を模す）。 */
  function baseRoom(): Record<string, unknown> {
    return {
      code: "ROOM-1",
      createdAt: 0,
      hostParticipantId: "p1",
      config: {
        language: "TypeScript",
        difficulty: "easy",
        members: ["A", "B", "C"],
        intervalMinutes: 5,
      },
      problem: null,
      session: {
        rotation: ["A", "B", "C"],
        currentIndex: 0,
        isPaused: false,
        driverCounts: [0, 0, 0],
        totalSwitches: 0,
      },
      clock: {
        running: false,
        intervalSeconds: 300,
        anchorServerTime: 0,
        secondsLeftAtAnchor: 300,
        accumulatedElapsedMs: 0,
        runningSince: null,
      },
      phase: "ready",
      participants: [
        {
          participantId: "p1",
          connId: "c1",
          displayName: "A",
          role: "host",
          presence: "online",
          hasAiKey: false,
          joinedAt: 1,
        },
      ],
      sessionRecords: [],
      handoffNote: "",
      onBreak: false,
    };
  }

  it("startedAt を省略した既存形式の room をパースできる（後方互換）", () => {
    const result = v.safeParse(RoomSchema, baseRoom());
    expect(result.success).toBe(true);
  });

  it("startedAt: null の room をパースできる", () => {
    const result = v.safeParse(RoomSchema, { ...baseRoom(), startedAt: null });
    expect(result.success).toBe(true);
  });

  it("startedAt: 1234567890（数値）の room をパースできる", () => {
    const result = v.safeParse(RoomSchema, { ...baseRoom(), startedAt: 1234567890 });
    expect(result.success).toBe(true);
  });
});
