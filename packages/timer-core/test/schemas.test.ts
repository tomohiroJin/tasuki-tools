/**
 * CommandSchema の境界バリデーションのテスト
 * host.transfer コマンドの追加分（v2.2 R2-3）を中心に検証する。
 */

import { describe, it, expect } from "vitest";
import * as v from "valibot";
import { CommandSchema, ServerMsgSchema } from "../src/index.js";
// RoomSchema は公開契約に載せない（取り込むのがテストだけのため。#220）。
import { RoomSchema } from "../src/schemas.js";

describe("CommandSchema host.transfer", () => {
  it("participantId 付きの host.transfer は success", () => {
    // Given
    const command = { command: "host.transfer", participantId: "p2" };
    // When
    const result = v.safeParse(CommandSchema, command);
    // Then
    expect(result.success).toBe(true);
  });

  it("participantId 欠落の host.transfer は failure", () => {
    // Given
    const command = { command: "host.transfer" };
    // When
    const result = v.safeParse(CommandSchema, command);
    // Then
    expect(result.success).toBe(false);
  });
});

describe("SessionConfigSchema 言語・難易度の境界", () => {
  const baseConfig = {
    members: ["Alice"],
    intervalMinutes: 5,
  };

  it("正常な言語・難易度の config.set を受理する", () => {
    // Given
    const command = {
      command: "config.set",
      config: { ...baseConfig, language: "TypeScript", difficulty: "easy" },
    };
    // When
    const result = v.safeParse(CommandSchema, command);
    // Then
    expect(result.success).toBe(true);
  });

  it("言語が上限超過（41 字）の config.set を拒否する", () => {
    // Given
    const command = {
      command: "config.set",
      config: { ...baseConfig, language: "x".repeat(41), difficulty: "easy" },
    };
    // When
    const result = v.safeParse(CommandSchema, command);
    // Then
    expect(result.success).toBe(false);
  });

  it("難易度が上限超過（21 字）の config.set を拒否する", () => {
    // Given
    const command = {
      command: "config.set",
      config: { ...baseConfig, language: "TypeScript", difficulty: "x".repeat(21) },
    };
    // When
    const result = v.safeParse(CommandSchema, command);
    // Then
    expect(result.success).toBe(false);
  });

  it("巨大な言語文字列（プロンプト膨張狙い）を拒否する", () => {
    // Given
    const command = {
      command: "config.set",
      config: { ...baseConfig, language: "x".repeat(100_000), difficulty: "easy" },
    };
    // When
    const result = v.safeParse(CommandSchema, command);
    // Then
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

// ─── signal: "notice"（Issue #22 G4・FR-077） ─────────────────────────────────
// 破壊的操作の実行者を全員に伝えるためのシグナル。サーバーは「意味」だけを運び、
// 日本語の文言化は UI 側が行う（plan.md「API / インターフェース契約」1）。

/**
 * @requirements FR-077
 */
describe("ServerMsgSchema signal: notice（実行者の通知）", () => {
  /** 妥当な notice メッセージの雛形。各テストで一部だけを差し替える。 */
  const base = {
    type: "signal",
    signal: "notice",
    action: "session-aborted",
    actorName: "Alice",
    actorParticipantId: "pid-1",
  };

  it("4つの action すべてが受理される", () => {
    // Given（対象は下記4種の action）
    // When / Then
    for (const action of [
      "participant-removed",
      "session-aborted",
      "session-reset",
      "session-completed",
    ]) {
      const result = v.safeParse(ServerMsgSchema, { ...base, action });
      expect(result.success, `action=${action}`).toBe(true);
    }
  });

  it("規定外の action は failure", () => {
    const result = v.safeParse(ServerMsgSchema, { ...base, action: "session-paused" });
    expect(result.success).toBe(false);
  });

  it("actorName が欠けていると failure（誰が実行したか分からない通知は無意味）", () => {
    // Given
    const { actorName: _omitted, ...withoutActorName } = base;
    // When
    const result = v.safeParse(ServerMsgSchema, withoutActorName);
    // Then
    expect(result.success).toBe(false);
  });

  it("actorParticipantId が欠けていると failure（同名参加者を区別できない）", () => {
    // Given
    const { actorParticipantId: _omitted, ...withoutActorId } = base;
    // When
    const result = v.safeParse(ServerMsgSchema, withoutActorId);
    // Then
    expect(result.success).toBe(false);
  });

  it("target 系は任意（participant-removed 以外では省略される）", () => {
    const result = v.safeParse(ServerMsgSchema, base);
    expect(result.success).toBe(true);
  });

  it("participant-removed では target 系を伴って受理される", () => {
    // Given
    const message = {
      ...base,
      action: "participant-removed",
      targetName: "Bob",
      targetParticipantId: "pid-2",
    };
    // When
    const result = v.safeParse(ServerMsgSchema, message);
    // Then
    expect(result.success).toBe(true);
  });

  it("既存の signal（switch）は引き続き受理される（variant への追加で壊さない）", () => {
    // Given
    const message = {
      type: "signal",
      signal: "switch",
      nextDriverName: "Bob",
    };
    // When
    const result = v.safeParse(ServerMsgSchema, message);
    // Then
    expect(result.success).toBe(true);
  });
});
