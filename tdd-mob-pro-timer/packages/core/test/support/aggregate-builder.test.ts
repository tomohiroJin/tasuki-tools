/**
 * anAggregate() — 集約ビルダーのテスト（G2-b・新設5）
 *
 * packages/core のテストは集約（{ session, clock }）を直接組み立てて decide/evolve を呼ぶ。
 * このビルダーは initialAggregate を手で組んでいた 12 ファイルの Given を圧縮するための
 * 集約ビルダーであり、apps/sync の aRoom() とは前提の形がまったく違う（core には aRoom() は使えない）。
 *
 * @requirements FR-096, FR-097, US2
 */

import { describe, it, expect } from "vitest";
import { anAggregate, NOW } from "./aggregate-builder.js";

describe("anAggregate()", () => {
  it("既定値で集約を作る（rotation 3人・currentIndex=0・clock 停止）", () => {
    const agg = anAggregate().build();

    expect(agg.session.rotation).toEqual(["Alice", "Bob", "Charlie"]);
    expect(agg.session.currentIndex).toBe(0);
    expect(agg.session.driverCounts).toEqual([0, 0, 0]);
    expect(agg.session.totalSwitches).toBe(0);
    expect(agg.clock.running).toBe(false);
  });

  it("withRotation() は参加者ID配列で rotation と driverCounts の長さを決める", () => {
    const agg = anAggregate().withRotation("p1", "p2", "p3", "p4").build();

    expect(agg.session.rotation).toEqual(["p1", "p2", "p3", "p4"]);
    expect(agg.session.driverCounts).toEqual([0, 0, 0, 0]);
  });

  it("withCurrentDriver() は currentIndex を設定する", () => {
    const agg = anAggregate().withRotation("p1", "p2", "p3").withCurrentDriver(2).build();

    expect(agg.session.currentIndex).toBe(2);
  });

  it("withCurrentDriver() が rotation の範囲外なら throw する（expect ではなく throw で失敗を表す）", () => {
    expect(() => anAggregate().withRotation("p1", "p2").withCurrentDriver(5).build()).toThrow();
  });

  it("running() は clock を稼働状態にし、anchorServerTime/runningSince が at() の時刻になる", () => {
    const at = 2_000_000;
    const agg = anAggregate().withRotation("p1", "p2", "p3").running().at(at).build();

    expect(agg.clock.running).toBe(true);
    expect(agg.clock.anchorServerTime).toBe(at);
    expect(agg.clock.runningSince).toBe(at);
  });

  it("paused() は running() を経てから一時停止した状態を作る（running=false・isPaused=true）", () => {
    const agg = anAggregate().withRotation("p1", "p2", "p3").paused().build();

    expect(agg.clock.running).toBe(false);
    expect(agg.session.isPaused).toBe(true);
  });

  it("at() を指定しない場合は既定の決定的時刻 NOW をアンカーに使う", () => {
    const agg = anAggregate().withRotation("p1", "p2", "p3").running().build();

    expect(agg.clock.anchorServerTime).toBe(NOW);
  });

  it("withIntervalMinutes() は clock.intervalSeconds に反映される", () => {
    const agg = anAggregate().withRotation("p1", "p2").withIntervalMinutes(7).build();

    expect(agg.clock.intervalSeconds).toBe(420);
    expect(agg.clock.secondsLeftAtAnchor).toBe(420);
  });

  /**
   * 前提の構築失敗は検証の失敗と区別できる形で報告する。
   * @requirements FR-096
   */
  it("rotation を 1 件も指定せずに組み立てると throw する", () => {
    expect(() => anAggregate().withRotation().build()).toThrow();
  });
});
