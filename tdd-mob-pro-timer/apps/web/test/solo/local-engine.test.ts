/**
 * ソロモード ローカルエンジンのテスト
 * T026: FR-031
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LocalEngine } from "../../src/solo/local-engine.js";
import type { SessionConfig } from "@tdd-mob/core";

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

// ─── T064: v2 新コマンドのソロ対応テスト ─────────────────────────────────────

describe("LocalEngine v2 新コマンド（T064/T065）", () => {
  const config: SessionConfig = {
    language: "TypeScript",
    difficulty: "easy",
    members: ["Alice", "Bob"],
    intervalMinutes: 5 as const,
  };

  it("abort() が呼べる（エラーにならない）", () => {
    const engine = new LocalEngine(config);
    expect(() => engine.abort()).not.toThrow();
  });

  it("abort() の後は集約がリセットに向かわず現状維持（ソロでは画面切替はUIが担当）", () => {
    const engine = new LocalEngine(config);
    engine.start();
    const aggBefore = engine.aggregate;
    engine.abort();
    // abort はドメインイベントを発行するだけで集約の session/clock に影響しない
    expect(engine.aggregate.session).toEqual(aggBefore.session);
  });
});

// ─── 項目2: ソロでもドライバー対象外を飛ばす（plan.md L194/L209）─────────────────
describe("LocalEngine: ドライバー対象外（ineligible）を飛ばす交代", () => {
  const threeConfig: SessionConfig = {
    language: "TypeScript",
    difficulty: "easy",
    members: ["Alice", "Bob", "Charlie"],
    intervalMinutes: 5 as const,
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("skip() は ineligible のメンバーを飛ばして次の eligible へ進む", () => {
    const engine = new LocalEngine(threeConfig);
    engine.setIneligibleProvider(() => new Set([1])); // Bob を対象外に
    engine.start();
    expect(engine.aggregate.session.currentIndex).toBe(0);
    engine.skip();
    expect(engine.aggregate.session.currentIndex).toBe(2); // Bob を飛ばして Charlie
    engine.dispose();
  });

  it("自動交代も ineligible を飛ばす", () => {
    const engine = new LocalEngine(threeConfig);
    engine.setIneligibleProvider(() => new Set([1]));
    engine.start();
    vi.advanceTimersByTime(300 * 1000 + 100);
    expect(engine.aggregate.session.currentIndex).toBe(2);
    engine.dispose();
  });

  it("全員 ineligible のときは現状維持（無限ループしない）", () => {
    const engine = new LocalEngine(threeConfig);
    engine.setIneligibleProvider(() => new Set([0, 1, 2]));
    engine.start();
    engine.skip();
    expect(engine.aggregate.session.currentIndex).toBe(0);
    // タイマーを大きく進めても現状維持（同期的な無限ループにならない）
    vi.advanceTimersByTime(900 * 1000);
    expect(engine.aggregate.session.currentIndex).toBe(0);
    engine.dispose();
  });

  it("reconcileCurrentDriver() は現ドライバーが ineligible になったら次の eligible へ繰り上げる", () => {
    let ineligible = new Set<number>();
    const engine = new LocalEngine(threeConfig);
    engine.setIneligibleProvider(() => ineligible);
    engine.start();
    expect(engine.aggregate.session.currentIndex).toBe(0);

    // Alice(0) を対象外にしてから調停 → Bob(1) へ繰り上がる
    ineligible = new Set([0]);
    engine.reconcileCurrentDriver();
    expect(engine.aggregate.session.currentIndex).toBe(1);
    engine.dispose();
  });

  it("reconcileCurrentDriver() は現ドライバーが eligible のままなら何もしない", () => {
    const engine = new LocalEngine(threeConfig);
    engine.setIneligibleProvider(() => new Set([2])); // Charlie のみ対象外、現ドライバー Alice は対象
    engine.start();
    engine.reconcileCurrentDriver();
    expect(engine.aggregate.session.currentIndex).toBe(0);
    expect(engine.aggregate.session.totalSwitches).toBe(0);
    engine.dispose();
  });
});
