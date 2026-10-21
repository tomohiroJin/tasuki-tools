import { describe, expect, it } from "vitest";
import { expand, totalPlannedSec } from "../src/index.js";

const input = {
  title: "会",
  steps: [
    { name: "a", durationSec: 300, onTimeout: "wait" as const },
    { name: "b", durationSec: 420, onTimeout: "advance" as const },
    { name: "c", durationSec: 60, onTimeout: "wait" as const },
  ],
};

describe("シナリオの展開", () => {
  it("ID が s-1 から振られ、初期値が入る", () => {
    const steps = expand(input);
    expect(steps.map((s) => s.id)).toEqual(["s-1", "s-2", "s-3"]);
    for (const s of steps) {
      expect(s.skipped).toBe(false);
      expect(s.extensionSec).toBe(0);
      expect(s.spentMs).toBeNull();
    }
    expect(steps[1]).toMatchObject({ name: "b", durationSec: 420, onTimeout: "advance" });
  });

  it("予定の合計秒を返す", () => {
    expect(totalPlannedSec(expand(input))).toBe(780);
  });

  it("予定の合計秒は、展開前の入力のステップからも数えられる（画面の分の合計と同じ数え方）", () => {
    expect(totalPlannedSec(input.steps)).toBe(780);
  });
});
