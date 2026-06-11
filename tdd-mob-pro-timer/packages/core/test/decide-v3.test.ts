/**
 * decide / evolve の v3.0 追加コマンドのテスト（§16）
 * 引き継ぎノート・休憩・config トグル（ナビゲーター/強い交代通知/休憩間隔）。
 */

import { describe, it, expect } from "vitest";
import { decide } from "../src/decide.js";
import { evolve } from "../src/evolve.js";
import { initialAggregate } from "../src/aggregate.js";
import type { SessionConfig } from "../src/aggregate.js";

const baseConfig: SessionConfig = {
  language: "TypeScript",
  difficulty: "easy",
  members: ["Alice", "Bob", "Charlie"],
  intervalMinutes: 5,
};
const baseAgg = initialAggregate(baseConfig);
const NOW = 1_000_000;

describe("decide: handoff.note.set（§9.1）", () => {
  it("HandoffNoteSet イベントを text 付きで発行する", () => {
    const result = decide({ command: "handoff.note.set", text: "次はバリデーション" }, baseAgg, NOW);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value[0]).toMatchObject({ type: "HandoffNoteSet", text: "次はバリデーション" });
    }
  });

  it("evolve では集約(session+clock)を変えない（Room レベルの状態のため）", () => {
    const result = decide({ command: "handoff.note.set", text: "メモ" }, baseAgg, NOW);
    if (result.isOk()) {
      const next = evolve(baseAgg, result.value[0]!, NOW);
      expect(next.session).toEqual(baseAgg.session);
      expect(next.clock).toEqual(baseAgg.clock);
    }
  });
});

describe("decide: break.start / break.end（§9.1）", () => {
  it("break.start は BreakStarted を発行する", () => {
    const result = decide({ command: "break.start" }, baseAgg, NOW);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value[0]?.type).toBe("BreakStarted");
  });

  it("break.end は BreakEnded を発行する", () => {
    const result = decide({ command: "break.end" }, baseAgg, NOW);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value[0]?.type).toBe("BreakEnded");
  });

  // v2.3 #2b: 休憩は集約のタイマーを停止/再開するようになった（旧仕様では集約不変だった）。
  it("BreakStarted は走行中タイマーを停止し残量を凍結する", () => {
    const started = evolve(baseAgg, { type: "SessionStarted", now: NOW }, NOW);
    const result = decide({ command: "break.start" }, started, NOW + 60_000);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const next = evolve(started, result.value[0]!, NOW + 60_000);
      expect(next.clock.running).toBe(false);
      // 5分=300秒から1分経過 → 240秒で凍結
      expect(next.clock.secondsLeftAtAnchor).toBeCloseTo(240, 0);
    }
  });

  it("BreakEnded は凍結残量から走行を再開する", () => {
    const started = evolve(baseAgg, { type: "SessionStarted", now: NOW }, NOW);
    const onBreak = evolve(started, { type: "BreakStarted", now: NOW + 60_000 }, NOW + 60_000);
    const result = decide({ command: "break.end" }, onBreak, NOW + 300_000);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const next = evolve(onBreak, result.value[0]!, NOW + 300_000);
      expect(next.clock.running).toBe(true);
      expect(next.clock.runningSince).toBe(NOW + 300_000);
      // 凍結値240を維持（休憩中の経過は消費しない）
      expect(next.clock.secondsLeftAtAnchor).toBeCloseTo(240, 0);
    }
  });
});

describe("decide: config.set の v3.0 トグル（§16）", () => {
  it("navigatorEnabled / assertiveSwitch / breakEveryRotations を検証済み config に載せる", () => {
    const result = decide(
      {
        command: "config.set",
        config: { navigatorEnabled: true, assertiveSwitch: true, breakEveryRotations: 4 },
      },
      baseAgg,
      NOW,
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value[0]).toMatchObject({
        type: "ConfigSet",
        config: { navigatorEnabled: true, assertiveSwitch: true, breakEveryRotations: 4 },
      });
    }
  });

  it("指定しないトグルは config に含めない（未指定は現状維持）", () => {
    const result = decide({ command: "config.set", config: { navigatorEnabled: true } }, baseAgg, NOW);
    if (result.isOk()) {
      const event = result.value[0];
      expect(event?.type).toBe("ConfigSet");
      if (event?.type === "ConfigSet") {
        expect(event.config).not.toHaveProperty("assertiveSwitch");
        expect(event.config).not.toHaveProperty("breakEveryRotations");
      }
    }
  });
});
