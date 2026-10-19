import type { ScenarioInput } from "../../src/types.js";

/** KPT のふりかえり（K 5 分・P 7 分・投票 1 分・Try 40 分・予備 7 分）。すべて `wait` */
export const kptInput: ScenarioInput = {
  title: "KPT のふりかえり",
  steps: [
    { name: "Keep", durationSec: 300, onTimeout: "wait" },
    { name: "Problem", durationSec: 420, onTimeout: "wait" },
    { name: "投票", durationSec: 60, onTimeout: "wait" },
    { name: "Try", durationSec: 2400, onTimeout: "wait" },
    { name: "予備", durationSec: 420, onTimeout: "wait" },
  ],
};
