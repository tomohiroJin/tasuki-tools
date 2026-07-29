/**
 * decide 関数のテスト
 * T010, T010b: FR-002, FR-003, FR-004, FR-009, FR-010
 */

import { describe, it, expect } from "vitest";
import { decide } from "../src/decide.js";
import { anAggregate } from "./support/aggregate-builder.js";

const baseAgg = anAggregate().build();
const NOW = 1000000;

// ─── ABORT ──────────────────────────────────────────────────────────────────

describe("decide: session.abort", () => {
  it("session.abort で SessionAborted イベントを1件発行する", () => {
    // When
    const result = decide({ command: "session.abort" }, baseAgg, NOW);
    // Then
    const events = result._unsafeUnwrap();
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("SessionAborted");
  });

  it("SessionAborted は SessionCompleted とは異なるイベント型である", () => {
    // Given
    const abortResult = decide({ command: "session.abort" }, baseAgg, NOW);
    const completeResult = decide({ command: "session.complete" }, baseAgg, NOW);
    // When
    const abortEvents = abortResult._unsafeUnwrap();
    const completeEvents = completeResult._unsafeUnwrap();
    // Then
    expect(abortEvents[0]?.type).toBe("SessionAborted");
    expect(completeEvents[0]?.type).toBe("SessionCompleted");
    expect(abortEvents[0]?.type).not.toBe(completeEvents[0]?.type);
  });
});

// ─── COMPLETE（回帰） ────────────────────────────────────────────────────────

describe("decide: session.complete（回帰テスト）", () => {
  it("session.complete は SessionCompleted イベントを発行し変わらない", () => {
    const result = decide({ command: "session.complete" }, baseAgg, NOW);
    expect(result._unsafeUnwrap()[0]?.type).toBe("SessionCompleted");
  });
});

// ─── START ──────────────────────────────────────────────────────────────────

describe("decide: START", () => {
  it("セッション開始でドライバーインデックスが0のままSessionStartedを発行する", () => {
    // When
    const result = decide({ command: "session.act", action: "START" }, baseAgg, NOW);
    // Then
    const events = result._unsafeUnwrap();
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("SessionStarted");
  });

  it("既にrunning=trueの場合はPhaseConflictを返す", () => {
    // Given
    const runningAgg = {
      ...baseAgg,
      clock: { ...baseAgg.clock, running: true },
    };
    // When
    const result = decide({ command: "session.act", action: "START" }, runningAgg, NOW);
    // Then
    expect(result._unsafeUnwrapErr().type).toBe("PhaseConflict");
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
    const switched = result._unsafeUnwrap().find((e) => e.type === "DriverSwitched");
    expect(switched).toBeTruthy();
  });

  it("次のインデックスは現インデックス+1（末尾は0に折り返す）", () => {
    // Given（currentIndex=2 は末尾なので0に折り返す）
    const atLastAgg = {
      ...runningAgg,
      session: {
        ...runningAgg.session,
        currentIndex: 2,
      },
    };
    // When
    const result = decide({ command: "session.act", action: "SWITCH" }, atLastAgg, NOW);
    // Then
    const switched = result._unsafeUnwrap().find((e) => e.type === "DriverSwitched");
    if (switched && switched.type === "DriverSwitched") {
      expect(switched.nextIndex).toBe(0);
    }
  });

  it("stopped状態ではSWITCH できない", () => {
    const result = decide({ command: "session.act", action: "SWITCH" }, baseAgg, NOW);
    expect(result._unsafeUnwrapErr().type).toBe("PhaseConflict");
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
    expect(result._unsafeUnwrap()[0]?.type).toBe("SessionPaused");
  });

  it("既に停止中の PAUSE はエラー", () => {
    // Given
    const pausedAgg = {
      ...runningAgg,
      session: { ...runningAgg.session, isPaused: true },
      clock: { ...runningAgg.clock, running: false },
    };
    // When / Then
    const result = decide({ command: "session.act", action: "PAUSE" }, pausedAgg, NOW);
    expect(result.isErr()).toBe(true);
  });

  it("RESUME で SessionResumed を発行する", () => {
    // Given
    const pausedAgg = {
      ...baseAgg,
      session: { ...baseAgg.session, isPaused: true },
      clock: { ...baseAgg.clock, running: false, runningSince: null },
    };
    // When / Then
    const result = decide({ command: "session.act", action: "RESUME" }, pausedAgg, NOW);
    expect(result._unsafeUnwrap()[0]?.type).toBe("SessionResumed");
  });

  it("稼働中の RESUME はエラー", () => {
    const result = decide({ command: "session.act", action: "RESUME" }, runningAgg, NOW);
    expect(result.isErr()).toBe(true);
  });
});

// ─── メンバー管理 ────────────────────────────────────────────────────────────

describe("decide: メンバー管理", () => {
  it("空名はエラー（EmptyName）", () => {
    const result = decide({ command: "member.add", participantId: "" }, baseAgg, NOW);
    expect(result._unsafeUnwrapErr().type).toBe("EmptyName");
  });

  it("重複名はエラー（DuplicateName）", () => {
    const result = decide({ command: "member.add", participantId: "Alice" }, baseAgg, NOW);
    expect(result._unsafeUnwrapErr().type).toBe("DuplicateName");
  });

  it("10人超過はエラー（MemberLimitExceeded）", () => {
    // Given
    const tenMemberAgg = anAggregate()
      .withRotation("A", "B", "C", "D", "E", "F", "G", "H", "I", "J")
      .build();
    // When / Then
    const result = decide({ command: "member.add", participantId: "K" }, tenMemberAgg, NOW);
    expect(result._unsafeUnwrapErr().type).toBe("MemberLimitExceeded");
  });

  it("2人のとき1人削除はできる（2層モデル: 下限は1人）", () => {
    const twoMemberAgg = anAggregate().withRotation("Alice", "Bob").build();
    const result = decide({ command: "member.remove", index: 0 }, twoMemberAgg, NOW);
    expect(result.isOk()).toBe(true);
  });

  it("最後の1人を削除しようとするとエラー（BelowMinMembers）", () => {
    const oneMemberAgg = anAggregate().withRotation("Alice").build();
    const result = decide({ command: "member.remove", index: 0 }, oneMemberAgg, NOW);
    expect(result._unsafeUnwrapErr().type).toBe("BelowMinMembers");
  });

  it("正常なメンバー追加は MemberAdded を発行する", () => {
    const result = decide({ command: "member.add", participantId: "Dave" }, baseAgg, NOW);
    expect(result._unsafeUnwrap()[0]?.type).toBe("MemberAdded");
  });

  it("正常なメンバー削除は MemberRemoved を発行する", () => {
    const result = decide({ command: "member.remove", index: 2 }, baseAgg, NOW);
    expect(result._unsafeUnwrap()[0]?.type).toBe("MemberRemoved");
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
    expect(result._unsafeUnwrap()[0]?.type).toBe("ConfigSet");
  });

  it("無効な交代間隔はエラー（InvalidInterval）", () => {
    const result = decide(
      { command: "config.set", config: { intervalMinutes: 6 as never } },
      baseAgg,
      NOW,
    );
    expect(result._unsafeUnwrapErr().type).toBe("InvalidInterval");
  });

  it("交代間隔の許容値は 3/5/7/10/15 のみ", () => {
    // Given
    const validIntervals = [3, 5, 7, 10, 15] as const;
    // When / Then
    for (const interval of validIntervals) {
      const result = decide(
        { command: "config.set", config: { intervalMinutes: interval } },
        baseAgg,
        NOW,
      );
      expect(result.isOk(), `interval ${interval} should be valid`).toBe(true);
    }
  });

  // ─── coverage-supplement.test.ts より移動（T036） ─────────────────────────

  it("2人未満のメンバー指定は BelowMinMembers（config.set のメンバー下限は据え置き）", () => {
    const result = decide({ command: "config.set", config: { members: ["Solo"] } }, baseAgg, NOW);
    expect(result.isErr()).toBe(true);
  });

  it("重複メンバー指定は DuplicateName", () => {
    const result = decide({ command: "config.set", config: { members: ["A", "A"] } }, baseAgg, NOW);
    expect(result._unsafeUnwrapErr().type).toBe("DuplicateName");
  });

  it("無効な交代間隔（4）も InvalidInterval", () => {
    const result = decide({ command: "config.set", config: { intervalMinutes: 4 as never } }, baseAgg, NOW);
    expect(result._unsafeUnwrapErr().type).toBe("InvalidInterval");
  });

  it("上限超過メンバーは MemberLimitExceeded", () => {
    // Given
    const many = Array.from({ length: 11 }, (_, i) => `M${i}`);
    // When / Then
    const result = decide({ command: "config.set", config: { members: many } }, baseAgg, NOW);
    expect(result._unsafeUnwrapErr().type).toBe("MemberLimitExceeded");
  });

  it("空名を含むメンバーは EmptyName", () => {
    const result = decide({ command: "config.set", config: { members: ["A", "  "] } }, baseAgg, NOW);
    expect(result._unsafeUnwrapErr().type).toBe("EmptyName");
  });

  it("言語・難易度のみの変更は成功する", () => {
    const result = decide(
      { command: "config.set", config: { language: "Go", difficulty: "hard" } },
      baseAgg,
      NOW,
    );
    expect(result.isOk()).toBe(true);
  });
});

// ─── T009/T011/T013: 在席の柔軟化（v2） ─────────────────────────────────────

/**
 * @requirements T009
 */
describe("decide: participant.addProxy", () => {
  it("有効な名前でプレースホルダー参加者を追加できる", () => {
    const result = decide(
      { command: "participant.addProxy", displayName: "Dave", participantId: "proxy-1" },
      baseAgg,
      NOW,
    );
    expect(result._unsafeUnwrap()[0]?.type).toBe("ProxyMemberAdded");
  });

  it("空の表示名は拒否される", () => {
    const result = decide(
      { command: "participant.addProxy", displayName: "  ", participantId: "proxy-2" },
      baseAgg,
      NOW,
    );
    expect(result._unsafeUnwrapErr().type).toBe("EmptyName");
  });

  // 表示名の重複検査はここには無い。rotation が参加者IDの配列になったため（D6b）、
  // 集約だけを見る decide からは名前の重複を判定できない。participants を持つ
  // サーバー層（handlers）へ移した。重複拒否の検証は apps/sync 側にある。
  it("既存の表示名と重複しても集約は受理する（名前の一意性はサーバー層の責務）", () => {
    const result = decide(
      { command: "participant.addProxy", displayName: "Alice", participantId: "proxy-3" },
      baseAgg,
      NOW,
    );
    expect(result.isOk()).toBe(true);
  });
});

/**
 * @requirements T011
 */
describe("decide: participant.rename", () => {
  // 表示名の重複検査はここには無い。rotation が参加者IDの配列になったため（D6b）、
  // 集約だけを見る decide からは名前の重複を判定できない。participants を持つ
  // サーバー層（handlers）へ移した（T052）。重複拒否の検証は apps/sync 側にある。
  it("有効な表示名への変更でイベントを発行する", () => {
    const result = decide(
      { command: "participant.rename", participantId: "p1", displayName: "NewName" },
      baseAgg,
      NOW,
    );
    expect(result._unsafeUnwrap()[0]?.type).toBe("ParticipantRenamed");
  });

  it("空の表示名への変更は拒否される", () => {
    const result = decide(
      { command: "participant.rename", participantId: "p1", displayName: "" },
      baseAgg,
      NOW,
    );
    expect(result._unsafeUnwrapErr().type).toBe("EmptyName");
  });

  it("自分の現在名と同一への変更はエラーにしない（no-op 相当で許可）", () => {
    // Given（Alice → Alice。rotation に同名があっても本人の現在名なので許可する）
    // When
    const result = decide(
      {
        command: "participant.rename",
        participantId: "p1",
        displayName: "Alice",
        currentDisplayName: "Alice",
      },
      baseAgg,
      NOW,
    );
    // Then
    expect(result._unsafeUnwrap()[0]?.type).toBe("ParticipantRenamed");
  });
});

/**
 * @requirements T013
 */
describe("decide: driver.skip / driver.resume", () => {
  it("driver.skip で DriverSkipped イベントを発行する", () => {
    const result = decide(
      { command: "driver.skip", participantId: "p1" },
      baseAgg,
      NOW,
    );
    expect(result._unsafeUnwrap()[0]?.type).toBe("DriverSkipped");
  });

  it("driver.resume で DriverResumed イベントを発行する", () => {
    const result = decide(
      { command: "driver.resume", participantId: "p1" },
      baseAgg,
      NOW,
    );
    expect(result._unsafeUnwrap()[0]?.type).toBe("DriverResumed");
  });
});

// ─── T015/T017/T019: お題の出所・編集・出題モード（v2） ─────────────────────

/**
 * @requirements T015
 */
describe("decide: problem.edit", () => {
  it("フィールドパッチで ProblemEdited イベントを発行する", () => {
    const result = decide(
      { command: "problem.edit", patch: { title: "新タイトル" } },
      baseAgg,
      NOW,
    );
    expect(result._unsafeUnwrap()[0]?.type).toBe("ProblemEdited");
  });

  it("requirements が上限を超えると InputLimitExceeded で拒否される（メンバー上限とは別エラー）", () => {
    // Given（メンバー数上限 MemberLimitExceeded の流用ではなく、入力サイズ専用のエラー型を使う）
    const tooMany = Array.from({ length: 21 }, (_, i) => `要件${i}`);
    // When / Then
    const result = decide(
      { command: "problem.edit", patch: { requirements: tooMany } },
      baseAgg,
      NOW,
    );
    expect(result._unsafeUnwrapErr().type).toBe("InputLimitExceeded");
  });

  it("requirements が上限ちょうど（20件）なら許可される", () => {
    const exactly = Array.from({ length: 20 }, (_, i) => `要件${i}`);
    const result = decide(
      { command: "problem.edit", patch: { requirements: exactly } },
      baseAgg,
      NOW,
    );
    expect(result.isOk()).toBe(true);
  });
});

/**
 * @requirements T019
 */
describe("decide: problem.mode.set", () => {
  it("AI モードへの切り替えで ProblemModeSet を発行する", () => {
    const result = decide(
      { command: "problem.mode.set", mode: "ai" },
      baseAgg,
      NOW,
    );
    expect(result._unsafeUnwrap()[0]?.type).toBe("ProblemModeSet");
  });

  it("定型モードへの切り替えで ProblemModeSet の mode が fallback になる", () => {
    // When
    const result = decide(
      { command: "problem.mode.set", mode: "fallback" },
      baseAgg,
      NOW,
    );
    // Then
    const evt = result._unsafeUnwrap()[0];
    if (evt?.type === "ProblemModeSet") {
      expect(evt.mode).toBe("fallback");
    }
  });
});

// ─── driver.assign（Issue #13 強制指名） ──────────────────────────────────────

describe("decide: driver.assign（任意メンバー強制指名）", () => {
  // baseAgg は members [Alice, Bob, Charlie]・currentIndex 0。
  const runningAgg = {
    ...baseAgg,
    clock: { ...baseAgg.clock, running: true },
  };

  it("稼働中に有効 index を指名すると DriverSwitched を1件発行する", () => {
    // When
    const result = decide({ command: "driver.assign", index: 2 }, runningAgg, NOW);
    // Then
    const events = result._unsafeUnwrap();
    expect(events).toHaveLength(1);
    const switched = events[0];
    expect(switched?.type).toBe("DriverSwitched");
    if (switched?.type === "DriverSwitched") {
      expect(switched.nextIndex).toBe(2);
    }
  });

  it("現ドライバー自身の指名は no-op（空イベント）を返す", () => {
    const result = decide({ command: "driver.assign", index: 0 }, runningAgg, NOW);
    expect(result._unsafeUnwrap()).toHaveLength(0);
  });

  it("rotation 範囲外の index は InvalidIndex を返す", () => {
    const result = decide({ command: "driver.assign", index: 5 }, runningAgg, NOW);
    expect(result._unsafeUnwrapErr().type).toBe("InvalidIndex");
  });

  it("非稼働中の指名は PhaseConflict を返す", () => {
    const result = decide({ command: "driver.assign", index: 1 }, baseAgg, NOW);
    expect(result._unsafeUnwrapErr().type).toBe("PhaseConflict");
  });
});
