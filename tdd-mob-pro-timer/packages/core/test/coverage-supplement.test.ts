/**
 * カバレッジ補強テスト（実ロジックの未検証パスを埋める）
 * evolve の config.set 再構築 / member.move / reset、records の周回数。
 */

import { describe, it, expect } from "vitest";
import { evolve } from "../src/evolve.js";
import { decide } from "../src/decide.js";
import { anAggregate } from "./support/aggregate-builder.js";
import { buildCompletionRecord } from "../src/records.js";
import { pickFallback, validateProblem } from "../src/problem.js";
import type { Aggregate, Problem, SessionConfig } from "../src/aggregate.js";

const baseConfig: SessionConfig = {
  language: "TypeScript",
  difficulty: "easy",
  members: ["Alice", "Bob", "Charlie"],
  intervalMinutes: 5,
};
const NOW = 1_000_000;

describe("evolve: ConfigSet によるメンバー再構築", () => {
  it("members 変更で rotation/driverCounts が再構築され、現ドライバー名を追従する", () => {
    // Bob を現ドライバーにしてから members を入替える
    let agg = anAggregate().build();
    agg = { ...agg, session: { ...agg.session, currentIndex: 1, driverCounts: [2, 3, 1] } };
    const next = evolve(agg, { type: "ConfigSet", config: { members: ["Charlie", "Bob"] }, now: NOW }, NOW);
    expect(next.session.rotation).toEqual(["Charlie", "Bob"]);
    // Bob の担当回数(3)が引き継がれる
    expect(next.session.driverCounts).toEqual([1, 3]);
    // 現ドライバー Bob は新 rotation の index 1
    expect(next.session.currentIndex).toBe(1);
  });

  it("intervalMinutes 変更は停止中なら新間隔で初期化する", () => {
    const agg = anAggregate().build();
    const next = evolve(agg, { type: "ConfigSet", config: { intervalMinutes: 10 }, now: NOW }, NOW);
    expect(next.clock.intervalSeconds).toBe(600);
    expect(next.clock.secondsLeftAtAnchor).toBe(600);
  });

  it("新メンバー追加は回数0、稼働中の間隔変更は残り時間を凍結する", () => {
    let agg = anAggregate().build();
    agg = evolve(agg, { type: "SessionStarted", now: NOW }, NOW); // running
    agg = { ...agg, clock: { ...agg.clock, secondsLeftAtAnchor: 123 } };
    const next = evolve(
      agg,
      { type: "ConfigSet", config: { members: ["Alice", "Dave", "Bob"], intervalMinutes: 7 }, now: NOW },
      NOW,
    );
    // Dave は旧 rotation に無いので 0
    expect(next.session.driverCounts[next.session.rotation.indexOf("Dave")]).toBe(0);
    // 稼働中は残り時間を凍結（新間隔で初期化しない）
    expect(next.clock.intervalSeconds).toBe(420);
    expect(next.clock.secondsLeftAtAnchor).toBe(123);
  });
});

describe("evolve: MemberMoved", () => {
  it("メンバーを移動すると rotation と driverCounts が同じ並びで動く", () => {
    let agg = anAggregate().build();
    agg = { ...agg, session: { ...agg.session, driverCounts: [1, 2, 3], currentIndex: 0 } };
    const next = evolve(agg, { type: "MemberMoved", fromIndex: 0, toIndex: 2, now: NOW }, NOW);
    expect(next.session.rotation).toEqual(["Bob", "Charlie", "Alice"]);
    expect(next.session.driverCounts).toEqual([2, 3, 1]);
    // 現ドライバー(Alice)は index 0→2 へ追従
    expect(next.session.currentIndex).toBe(2);
  });
});

describe("evolve: SessionReset", () => {
  // v2.3 #3: リセットは「最初から再スタート（走行）」になった（旧仕様は clock 停止だった）。
  it("リセットで集約が初期化され clock が走行状態で再スタートする", () => {
    let agg = anAggregate().build();
    agg = evolve(agg, { type: "SessionStarted", now: NOW }, NOW);
    const reset = evolve(agg, { type: "SessionReset", now: NOW + 5000 }, NOW + 5000);
    expect(reset.clock.running).toBe(true);
    expect(reset.clock.anchorServerTime).toBe(NOW + 5000);
    expect(reset.clock.runningSince).toBe(NOW + 5000);
    expect(reset.clock.secondsLeftAtAnchor).toBe(baseConfig.intervalMinutes * 60);
    expect(reset.session.rotation).toEqual(["Alice", "Bob", "Charlie"]);
    expect(reset.session.totalSwitches).toBe(0);
  });
});

describe("buildCompletionRecord: 周回数とドライバー回数", () => {
  const problem: Problem = {
    title: "T", description: "d", requirements: [], exampleTest: "", hints: [],
  };

  it("rotation 長で割った周回数を記録する", () => {
    let agg = anAggregate().build();
    agg = { ...agg, session: { ...agg.session, totalSwitches: 6, driverCounts: [2, 2, 2] } };
    const rec = buildCompletionRecord(agg, problem, baseConfig, NOW);
    expect(rec.rounds).toBe(2); // 6 / 3
    expect(rec.driverCounts).toEqual([2, 2, 2]);
  });

  it("roomId を渡すと記録に含める", () => {
    const agg = anAggregate().build();
    const rec = buildCompletionRecord(agg, problem, baseConfig, NOW, "ROOM-1");
    expect(rec.roomId).toBe("ROOM-1");
  });

  it("rotation が空なら周回数は 0", () => {
    const agg: Aggregate = {
      session: { rotation: [], currentIndex: 0, isPaused: false, driverCounts: [], totalSwitches: 0 },
      clock: { running: false, intervalSeconds: 300, anchorServerTime: 0, secondsLeftAtAnchor: 300, accumulatedElapsedMs: 0, runningSince: null },
    };
    const rec = buildCompletionRecord(agg, problem, baseConfig, NOW);
    expect(rec.rounds).toBe(0);
  });
});

describe("decide: config.set のメンバー検証", () => {
  it("2人未満のメンバー指定は BelowMinMembers（config.set のメンバー下限は据え置き）", () => {
    const agg = anAggregate().build();
    const result = decide({ command: "config.set", config: { members: ["Solo"] } }, agg, NOW);
    expect(result.isErr()).toBe(true);
  });

  it("重複メンバー指定は DuplicateName", () => {
    const agg = anAggregate().build();
    const result = decide({ command: "config.set", config: { members: ["A", "A"] } }, agg, NOW);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.type).toBe("DuplicateName");
  });
});

describe("evolve: MemberRemoved / MemberMoved の index 調整分岐", () => {
  it("現ドライバーより前を削除すると currentIndex が 1 減る", () => {
    let agg = anAggregate().build(); // [Alice,Bob,Charlie]
    agg = { ...agg, session: { ...agg.session, currentIndex: 2 } };
    const next = evolve(agg, { type: "MemberRemoved", index: 0, now: NOW }, NOW);
    expect(next.session.rotation).toEqual(["Bob", "Charlie"]);
    expect(next.session.currentIndex).toBe(1);
  });

  it("現ドライバーより後ろから前へ移動すると currentIndex が 1 増える", () => {
    let agg = anAggregate().build();
    agg = { ...agg, session: { ...agg.session, currentIndex: 1 } };
    // index2(Charlie) を index0 へ。fromIndex(2)>cur(1) かつ toIndex(0)<=cur(1) → cur++
    const next = evolve(agg, { type: "MemberMoved", fromIndex: 2, toIndex: 0, now: NOW }, NOW);
    expect(next.session.rotation).toEqual(["Charlie", "Alice", "Bob"]);
    expect(next.session.currentIndex).toBe(2);
  });

  it("現ドライバーより前から後ろへ移動すると currentIndex が 1 減る", () => {
    let agg = anAggregate().build();
    agg = { ...agg, session: { ...agg.session, currentIndex: 1 } };
    // index0(Alice) を index2 へ。fromIndex(0)<cur(1) かつ toIndex(2)>=cur(1) → cur--
    const next = evolve(agg, { type: "MemberMoved", fromIndex: 0, toIndex: 2, now: NOW }, NOW);
    expect(next.session.rotation).toEqual(["Bob", "Charlie", "Alice"]);
    expect(next.session.currentIndex).toBe(0);
  });
});

describe("decide: config.set の各バリデーション分岐", () => {
  const agg = anAggregate().build();
  it("無効な交代間隔は InvalidInterval", () => {
    const r = decide({ command: "config.set", config: { intervalMinutes: 4 as never } }, agg, NOW);
    expect(r.isErr() && r.error.type).toBe("InvalidInterval");
  });
  it("上限超過メンバーは MemberLimitExceeded", () => {
    const many = Array.from({ length: 11 }, (_, i) => `M${i}`);
    const r = decide({ command: "config.set", config: { members: many } }, agg, NOW);
    expect(r.isErr() && r.error.type).toBe("MemberLimitExceeded");
  });
  it("空名を含むメンバーは EmptyName", () => {
    const r = decide({ command: "config.set", config: { members: ["A", "  "] } }, agg, NOW);
    expect(r.isErr() && r.error.type).toBe("EmptyName");
  });
  it("言語・難易度のみの変更は成功する", () => {
    const r = decide({ command: "config.set", config: { language: "Go", difficulty: "hard" } }, agg, NOW);
    expect(r.isOk()).toBe(true);
  });
});

describe("problem: pickFallback と validateProblem", () => {
  it("該当言語が無くてもフォールバックお題を返す（全フォールバックへ縮退）", () => {
    const r = pickFallback("COBOL-不明言語", "easy");
    expect(r.source).toBe("fallback");
    expect(r.problem.title.length).toBeGreaterThan(0);
    expect(Array.isArray(r.problem.requirements)).toBe(true);
  });
  it("壊れた構造の問題は validateProblem で弾く", () => {
    expect(validateProblem({ title: 123 }).isErr()).toBe(true);
  });
  it("正しい構造は validateProblem を通る", () => {
    const ok = validateProblem({ title: "T", description: "d", requirements: ["r"], exampleTest: "t", hints: [] });
    expect(ok.isOk()).toBe(true);
  });
});
