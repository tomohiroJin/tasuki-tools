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

  it("BreakStarted/BreakEnded は集約を変えない", () => {
    for (const command of ["break.start", "break.end"] as const) {
      const result = decide({ command }, baseAgg, NOW);
      if (result.isOk()) {
        const next = evolve(baseAgg, result.value[0]!, NOW);
        expect(next).toEqual(baseAgg);
      }
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
