import { describe, expect, it } from "vitest";
import { definitionOf, expand, plannedStepCount, roundsOf, scenarioTotalSec, totalPlannedSec } from "../src/index.js";

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

const lt = {
  title: "LT",
  rounds: 3,
  steps: [
    { name: "発表", durationSec: 300, onTimeout: "advance" as const },
    { name: "入れ替え", durationSec: 60, onTimeout: "advance" as const },
  ],
};

describe("シナリオの回数", () => {
  it("回数 3 の LT 会を展開すると 6 区切りになり、回と通しの ID を持つ", () => {
    expect(expand(lt).map((s) => [s.id, s.name, s.round])).toEqual([
      ["s-1", "発表", 1],
      ["s-2", "入れ替え", 1],
      ["s-3", "発表", 2],
      ["s-4", "入れ替え", 2],
      ["s-5", "発表", 3],
      ["s-6", "入れ替え", 3],
    ]);
    expect(scenarioTotalSec(lt)).toBe(1080);
    expect(plannedStepCount(lt)).toBe(6);
  });

  it("回数を省略した入力は回数 1 と同じ展開になる", () => {
    expect(expand(input)).toEqual(expand({ ...input, rounds: 1 }));
    expect(expand(input).every((s) => s.round === 1)).toBe(true);
    expect(roundsOf(lt)).toBe(3);
    expect(roundsOf({})).toBe(1);
    expect(scenarioTotalSec(input)).toBe(780);
    expect(plannedStepCount(input)).toBe(3);
  });

  it("definitionOf は 1 回目だけと回数を返し、回数 1 では回数のキーを持たない", () => {
    const def = definitionOf({ title: lt.title, rounds: 3, steps: expand(lt) });
    expect(def.steps).toEqual(lt.steps);
    expect(def.rounds).toBe(3);
    expect(def.title).toBe("LT");
    const one = definitionOf({ title: "会", rounds: 1, steps: expand(input) });
    expect("rounds" in one).toBe(false);
    expect(one.steps).toEqual(input.steps);
  });
});
