/**
 * 完成記録のテスト
 * T020: FR-028, SC-004
 */

import { describe, it, expect } from "vitest";
import { buildCompletionRecord, createRecordIdGenerator } from "../src/records.js";
import { INITIAL_BREAK_STATE, elapsedMs } from "../src/aggregate.js";
import { evolve } from "../src/evolve.js";
import type { Aggregate } from "../src/aggregate.js";
import type { DomainEvent } from "../src/events.js";
import { anAggregate } from "./support/aggregate-builder.js";

/**
 * ローテーション順の表示名。#95 S4a で `config.members` が消えたため、
 * 呼び出し側が解決して渡す引数になった（D15）。
 */
const memberNames = ["Alice", "Bob", "Charlie"];

/** 記録の ID の生成器（#364 で注入になった。状態は呼び出し側が持つ） */
const nextId = createRecordIdGenerator();

/** 完了した時点で掲げていたお題のタイトル（#91・同期サーバーのアプリ層が値として渡す）。 */
const topicTitle = "FizzBuzz";

describe("buildCompletionRecord", () => {
  it("必要なフィールドが全て含まれる", () => {
    // Given
    const agg = anAggregate().build();
    const completedAt = 1000000 + 300000;
    // When
    const record = buildCompletionRecord(agg, topicTitle, memberNames, completedAt, nextId);
    // Then
    expect(record.topicTitle).toBe(topicTitle);
    expect(record.members).toEqual(memberNames);
    expect(record.completedAt).toBe(completedAt);
    expect(record.id).toBeTruthy();
  });

  /**
   * @requirements SC-004
   */
  it("elapsedSeconds は停止時間を除いた稼働時間", () => {
    // Given（開始 → 60秒稼働 → 一時停止 → 30秒の停止（計上しない）→ 再開 → 40秒稼働して完成）
    const startTime = 1000000;
    let agg = anAggregate().build();
    agg = evolve(agg, { type: "SessionStarted", now: startTime }, startTime);
    const pauseTime = startTime + 60000;
    agg = evolve(agg, { type: "SessionPaused", now: pauseTime }, pauseTime);
    const resumeTime = pauseTime + 30000;
    agg = evolve(agg, { type: "SessionResumed", now: resumeTime }, resumeTime);
    const completeTime = resumeTime + 40000;
    // When
    const totalElapsed = elapsedMs(agg.clock, completeTime);
    const record = buildCompletionRecord(agg, topicTitle, memberNames, completeTime, nextId);
    // Then（60秒 + 40秒 = 100秒。停止30秒は含まない）
    expect(totalElapsed).toBe(100000);
    expect(record.elapsedSeconds).toBe(100); // ms → seconds
  });

  it("totalSwitches が集約から転記される", () => {
    // Given（2回交代した集約を作る）
    const startTime = 1000000;
    let agg = anAggregate().build();
    agg = evolve(agg, { type: "SessionStarted", now: startTime }, startTime);
    agg = evolve(
      agg,
      { type: "DriverSwitched", nextIndex: 1, now: startTime + 10000 },
      startTime + 10000,
    );
    agg = evolve(
      agg,
      { type: "DriverSwitched", nextIndex: 2, now: startTime + 20000 },
      startTime + 20000,
    );
    // When
    const record = buildCompletionRecord(agg, topicTitle, memberNames, startTime + 20000, nextId);
    // Then
    expect(record.totalSwitches).toBe(2);
  });

  it("id は一意（2つの記録が同じ id を持たない）", () => {
    // Given
    const agg = anAggregate().build();
    // When
    const r1 = buildCompletionRecord(agg, topicTitle, memberNames, 1000000, nextId);
    const r2 = buildCompletionRecord(agg, topicTitle, memberNames, 1000001, nextId);
    // Then
    expect(r1.id).not.toBe(r2.id);
  });
});

/**
 * 記録の ID の生成器（#364 Task 3）。
 *
 * かつてはモジュールの状態（`let counter`）だった。生成器ごとに連番をクロージャへ持たせ、
 * 状態は呼び出し側（同期サーバー。プロセスに 1 つ）が持つ。**ID の形は変えない** ——
 * 利用者の端末が記録を保存するときの ID になる。
 */
describe("createRecordIdGenerator", () => {
  it("Given 新しい生成器 / When ID を作る / Then `時刻36進-連番36進5桁` の形で、連番は 1 から始まる", () => {
    // Given
    const next = createRecordIdGenerator();
    const now = 1_700_000_000_000;
    // When
    const ids = [next(now), next(now), next(now)];
    // Then
    const head = now.toString(36);
    expect(ids).toEqual([`${head}-00001`, `${head}-00002`, `${head}-00003`]);
  });

  it("Given 同じ時刻 / When 2 回作る / Then 違う ID になる", () => {
    // Given
    const next = createRecordIdGenerator();
    // When
    const a = next(1_000);
    const b = next(1_000);
    // Then
    expect(a).not.toBe(b);
  });

  it("Given 2 つの生成器 / When それぞれで作る / Then 連番は互いに独立している", () => {
    // Given
    const first = createRecordIdGenerator();
    const second = createRecordIdGenerator();
    first(1_000);
    first(1_000);
    // When
    const id = second(1_000);
    // Then
    expect(id).toBe(`${(1_000).toString(36)}-00001`);
  });

  it("Given 連番が 99999 まで進んだ / When 次を作る / Then 0 に戻る（100000 で割った余り）", () => {
    // Given
    const next = createRecordIdGenerator();
    for (let i = 0; i < 99_999; i++) next(1_000);
    // When
    const wrapped = next(1_000);
    // Then
    expect(wrapped).toBe(`${(1_000).toString(36)}-00000`);
  });

  it("Given 生成器 / When 完成記録を組む / Then 記録の id はその生成器が作ったもの", () => {
    // Given
    const next = createRecordIdGenerator();
    // When
    const record = buildCompletionRecord(anAggregate().build(), null, ["あや"], 1_000, next);
    // Then
    expect(record.id).toBe(`${(1_000).toString(36)}-00001`);
  });
});

/**
 * @requirements T008
 */
describe("中断（SessionAborted）の記録扱い", () => {
  it("SessionAborted イベント自体には CompletionRecord に必要な topicTitle / members が存在しない", () => {
    // Given（実際の「保存を呼ばない」制御は handlers/App.tsx 層で行う。ここではドメインイベント型の設計確認）
    const rawEvent = { type: "SessionAborted", now: 1000000 } as const;
    // When（rawEvent が SessionAborted 型として受理されることを確認する）
    // SessionAborted は events.ts が export していない（公開記号を増やさないため、
    // 公開されている DomainEvent の union から取り出す）
    const abortedEvent: Extract<DomainEvent, { type: "SessionAborted" }> = rawEvent;
    // Then
    expect(abortedEvent.type).toBe("SessionAborted");
    expect("topicTitle" in abortedEvent).toBe(false);
    expect("members" in abortedEvent).toBe(false);
  });

  it("SessionCompleted イベントには now が含まれ、buildCompletionRecord で記録を作れる", () => {
    // Given（完成時のみ記録を生成することを確認する。abort とは対照的）
    const agg = anAggregate().build();
    // When
    const record = buildCompletionRecord(agg, topicTitle, memberNames, 1000000, nextId);
    // Then
    expect(record.topicTitle).toBe(topicTitle);
    expect(record.completedAt).toBe(1000000);
  });
});

/**
 * @requirements #91 E17（お題の有無にかかわらず記録を作り、お題があればタイトルを写す）
 */
describe("完成記録にお題のタイトルを写す", () => {
  it("Given お題のタイトル / When 記録を作る / Then topicTitle に写り、言語と難易度は持たない", () => {
    // Given
    const agg = anAggregate().build();
    // When
    const record = buildCompletionRecord(agg, "FizzBuzz", ["あや"], 1_000, nextId);
    // Then
    expect(record.topicTitle).toBe("FizzBuzz");
    expect(record).not.toHaveProperty("language");
    expect(record).not.toHaveProperty("difficulty");
    expect(record).not.toHaveProperty("problemTitle");
  });

  it("Given お題なし / When 記録を作る / Then topicTitle は null で記録はできる", () => {
    expect(buildCompletionRecord(anAggregate().build(), null, ["あや"], 1_000, nextId).topicTitle).toBeNull();
  });
});

// ─── buildCompletionRecord: 周回数とドライバー回数（coverage-supplement.test.ts より移動・T036） ──

describe("buildCompletionRecord: 周回数とドライバー回数", () => {
  it("rotation 長で割った周回数を記録する", () => {
    // Given
    let agg = anAggregate().build();
    agg = { ...agg, session: { ...agg.session, totalSwitches: 6, driverCounts: [2, 2, 2] } };
    // When
    const rec = buildCompletionRecord(agg, "T", memberNames, 1000000, nextId);
    // Then（6 / 3 = 2）
    expect(rec.rounds).toBe(2);
    expect(rec.driverCounts).toEqual([2, 2, 2]);
  });

  it("roomId を渡すと記録に含める", () => {
    // Given
    const agg = anAggregate().build();
    const roomId = "ROOM-1";
    // When
    const rec = buildCompletionRecord(agg, "T", memberNames, 1000000, nextId, roomId);
    // Then
    expect(rec.roomId).toBe("ROOM-1");
  });

  it("rotation が空なら周回数は 0", () => {
    // Given
    const agg: Aggregate = {
      session: { rotation: [], currentIndex: 0, isPaused: false, driverCounts: [], totalSwitches: 0, previousDriverId: null, break: INITIAL_BREAK_STATE },
      clock: { running: false, intervalSeconds: 300, anchorServerTime: 0, secondsLeftAtAnchor: 300, accumulatedElapsedMs: 0, runningSince: null },
    };
    // When
    const rec = buildCompletionRecord(agg, "T", memberNames, 1000000, nextId);
    // Then
    expect(rec.rounds).toBe(0);
  });
});
