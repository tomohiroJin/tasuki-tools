/**
 * decide 関数のテスト
 * T010, T010b: FR-002, FR-003, FR-004, FR-009, FR-010
 */

import { describe, it, expect } from "vitest";
import { err, ok } from "neverthrow";
import { decide } from "../src/decide.js";
import { initialAggregate } from "../src/aggregate.js";
import type { SessionConfig } from "../src/aggregate.js";

const baseConfig: SessionConfig = {
  language: "TypeScript",
  difficulty: "easy",
  members: ["Alice", "Bob", "Charlie"],
  intervalMinutes: 5,
};

const baseAgg = initialAggregate(baseConfig);
const NOW = 1000000;

// ─── START ──────────────────────────────────────────────────────────────────

describe("decide: START", () => {
  it("セッション開始でドライバーインデックスが0のままSessionStartedを発行する", () => {
    const result = decide({ command: "session.act", action: "START" }, baseAgg, NOW);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.type).toBe("SessionStarted");
    }
  });

  it("既にrunning=trueの場合はPhaseConflictを返す", () => {
    const runningAgg = {
      ...baseAgg,
      clock: { ...baseAgg.clock, running: true },
    };
    const result = decide({ command: "session.act", action: "START" }, runningAgg, NOW);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("PhaseConflict");
    }
  });
});

// ─── SWITCH ─────────────────────────────────────────────────────────────────

describe("decide: SWITCH（自動/手動交代）", () => {
  const runningAgg = {
    ...baseAgg,
    clock: { ...baseAgg.clock, running: true },
  };

  it("SWITCH でドライバー交代イベントを発行する", () => {
    const result = decide({ command: "session.act", action: "SWITCH" }, runningAgg, NOW);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const switched = result.value.find((e) => e.type === "DriverSwitched");
      expect(switched).toBeTruthy();
    }
  });

  it("次のインデックスは現インデックス+1（末尾は0に折り返す）", () => {
    // currentIndex=2 は末尾なので0に折り返す
    const atLastAgg = {
      ...runningAgg,
      session: {
        ...runningAgg.session,
        currentIndex: 2,
      },
    };
    const result = decide({ command: "session.act", action: "SWITCH" }, atLastAgg, NOW);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const switched = result.value.find((e) => e.type === "DriverSwitched");
      if (switched && switched.type === "DriverSwitched") {
        expect(switched.nextIndex).toBe(0);
      }
    }
  });

  it("stopped状態ではSWITCH できない", () => {
    const result = decide({ command: "session.act", action: "SWITCH" }, baseAgg, NOW);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("PhaseConflict");
    }
  });
});

// ─── PAUSE / RESUME ─────────────────────────────────────────────────────────

describe("decide: PAUSE / RESUME", () => {
  const runningAgg = {
    ...baseAgg,
    clock: { ...baseAgg.clock, running: true },
  };

  it("PAUSE で SessionPaused を発行する", () => {
    const result = decide({ command: "session.act", action: "PAUSE" }, runningAgg, NOW);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value[0]?.type).toBe("SessionPaused");
    }
  });

  it("既に停止中の PAUSE はエラー", () => {
    const pausedAgg = {
      ...runningAgg,
      session: { ...runningAgg.session, isPaused: true },
      clock: { ...runningAgg.clock, running: false },
    };
    const result = decide({ command: "session.act", action: "PAUSE" }, pausedAgg, NOW);
    expect(result.isErr()).toBe(true);
  });

  it("RESUME で SessionResumed を発行する", () => {
    const pausedAgg = {
      ...baseAgg,
      session: { ...baseAgg.session, isPaused: true },
      clock: { ...baseAgg.clock, running: false, runningSince: null },
    };
    const result = decide({ command: "session.act", action: "RESUME" }, pausedAgg, NOW);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value[0]?.type).toBe("SessionResumed");
    }
  });

  it("稼働中の RESUME はエラー", () => {
    const result = decide({ command: "session.act", action: "RESUME" }, runningAgg, NOW);
    expect(result.isErr()).toBe(true);
  });
});

// ─── メンバー管理 ────────────────────────────────────────────────────────────

describe("decide: メンバー管理", () => {
  it("空名はエラー（EmptyName）", () => {
    const result = decide({ command: "member.add", name: "" }, baseAgg, NOW);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("EmptyName");
    }
  });

  it("重複名はエラー（DuplicateName）", () => {
    const result = decide({ command: "member.add", name: "Alice" }, baseAgg, NOW);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("DuplicateName");
    }
  });

  it("10人超過はエラー（MemberLimitExceeded）", () => {
    const tenMemberConfig: SessionConfig = {
      ...baseConfig,
      members: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"],
    };
    const tenMemberAgg = initialAggregate(tenMemberConfig);
    const result = decide({ command: "member.add", name: "K" }, tenMemberAgg, NOW);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("MemberLimitExceeded");
    }
  });

  it("2人未満になる削除はエラー（BelowMinMembers）", () => {
    const twoMemberConfig: SessionConfig = {
      ...baseConfig,
      members: ["Alice", "Bob"],
    };
    const twoMemberAgg = initialAggregate(twoMemberConfig);
    const result = decide({ command: "member.remove", index: 0 }, twoMemberAgg, NOW);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("BelowMinMembers");
    }
  });

  it("正常なメンバー追加は MemberAdded を発行する", () => {
    const result = decide({ command: "member.add", name: "Dave" }, baseAgg, NOW);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value[0]?.type).toBe("MemberAdded");
    }
  });

  it("正常なメンバー削除は MemberRemoved を発行する", () => {
    const result = decide({ command: "member.remove", index: 2 }, baseAgg, NOW);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value[0]?.type).toBe("MemberRemoved");
    }
  });
});

// ─── config.set ─────────────────────────────────────────────────────────────

describe("decide: config.set", () => {
  it("有効な交代間隔を設定できる", () => {
    const result = decide(
      { command: "config.set", config: { intervalMinutes: 7 } },
      baseAgg,
      NOW,
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value[0]?.type).toBe("ConfigSet");
    }
  });

  it("無効な交代間隔はエラー（InvalidInterval）", () => {
    const result = decide(
      { command: "config.set", config: { intervalMinutes: 6 as never } },
      baseAgg,
      NOW,
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("InvalidInterval");
    }
  });

  it("交代間隔の許容値は 3/5/7/10/15 のみ", () => {
    const validIntervals = [3, 5, 7, 10, 15] as const;
    for (const interval of validIntervals) {
      const result = decide(
        { command: "config.set", config: { intervalMinutes: interval } },
        baseAgg,
        NOW,
      );
      expect(result.isOk(), `interval ${interval} should be valid`).toBe(true);
    }
  });
});
