/**
 * ソロモード ローカルエンジンのテスト
 * T026: FR-031
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LocalEngine } from "../../src/solo/local-engine.js";
import type { SessionConfig } from "@tdd-mob/core";

const baseConfig: SessionConfig = {
  language: "TypeScript",
  difficulty: "easy",
  members: ["Solo"],
  intervalMinutes: 5 as const,
};

// 1人でも動作するためメンバー1人の設定を追加
const soloConfig: SessionConfig = {
  ...baseConfig,
  members: ["Solo"],
};

// 2人設定（テスト用）
const twoPersonConfig: SessionConfig = {
  language: "TypeScript",
  difficulty: "easy",
  members: ["Alice", "Bob"],
  intervalMinutes: 5 as const,
};

describe("LocalEngine: ローカル完結（FR-031）", () => {
  let engine: LocalEngine;

  beforeEach(() => {
    vi.useFakeTimers();
    engine = new LocalEngine(twoPersonConfig);
  });

  afterEach(() => {
    engine.dispose();
    vi.useRealTimers();
  });

  it("初期状態は stopped（clock.running=false）", () => {
    expect(engine.aggregate.clock.running).toBe(false);
  });

  it("start() で clock.running=true になる", () => {
    engine.start();
    expect(engine.aggregate.clock.running).toBe(true);
  });

  it("pause() で clock.running=false になる", () => {
    engine.start();
    engine.pause();
    expect(engine.aggregate.clock.running).toBe(false);
    expect(engine.aggregate.session.isPaused).toBe(true);
  });

  it("resume() で clock.running=true に戻る", () => {
    engine.start();
    engine.pause();
    engine.resume();
    expect(engine.aggregate.clock.running).toBe(true);
    expect(engine.aggregate.session.isPaused).toBe(false);
  });

  it("交代間隔経過で自動交代が起きる（ローカル setTimeout）", () => {
    engine.start();
    const initialIndex = engine.aggregate.session.currentIndex;

    // 5分（300秒）経過させる
    vi.advanceTimersByTime(300 * 1000 + 100);

    expect(engine.aggregate.session.currentIndex).not.toBe(initialIndex);
    expect(engine.aggregate.session.totalSwitches).toBe(1);
  });

  it("skip() で即座に次のドライバーに交代する", () => {
    engine.start();
    const initialIndex = engine.aggregate.session.currentIndex;
    engine.skip();
    expect(engine.aggregate.session.currentIndex).not.toBe(initialIndex);
  });

  it("elapsed は停止中の時間を含まない（FR-006 と同一ロジック）", () => {
    engine.start();

    // 30秒稼働
    vi.advanceTimersByTime(30000);
    engine.pause();

    // 15秒停止（カウントされない）
    vi.advanceTimersByTime(15000);

    const elapsed1 = engine.elapsedMs;
    expect(elapsed1).toBeCloseTo(30000, -2); // 30秒前後

    engine.resume();
    // さらに 20秒稼働
    vi.advanceTimersByTime(20000);

    const elapsed2 = engine.elapsedMs;
    expect(elapsed2).toBeCloseTo(50000, -2); // 合計50秒（停止15秒は含まない）
  });

  it("onChange コールバックが状態変化時に呼ばれる", () => {
    const onChange = vi.fn();
    engine.setOnChange(onChange);

    engine.start();
    expect(onChange).toHaveBeenCalledTimes(1);

    engine.pause();
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("dispose() で自動交代タイマーが停止する", () => {
    engine.start();
    engine.dispose();

    // dispose後に時間が経過しても交代しない
    vi.advanceTimersByTime(600 * 1000);
    expect(engine.aggregate.session.totalSwitches).toBe(0);
  });
});
