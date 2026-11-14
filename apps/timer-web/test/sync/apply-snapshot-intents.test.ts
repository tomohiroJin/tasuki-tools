/**
 * applySnapshotIntents が、意図ごとに対応する受け皿を呼ぶことを固定する（#595）。
 *
 * 判断は `decideSnapshotIntents`（`snapshot-intents.test.ts`）が持ち、ここは
 * 「意図 → 受け皿」の対応と、**配列の順に実行すること**だけを見る。
 */
import { describe, it, expect } from "vitest";
import { applySnapshotIntents, type SnapshotIntentSinks } from "../../src/sync/apply-snapshot-intents.js";
import { aRecord } from "../support/room-view.js";

function recordingSinks(): { sinks: SnapshotIntentSinks; calls: string[] } {
  const calls: string[] = [];
  const sinks: SnapshotIntentSinks = {
    saveResume: (identity) => calls.push(`saveResume:${identity.code}`),
    clearCompletion: () => calls.push("clearCompletion"),
    setScreen: (screen) => calls.push(`setScreen:${screen}`),
    setEnd: (endType) => calls.push(`setEnd:${endType}`),
    persistCompletion: (record) => calls.push(`persistCompletion:${record.id}`),
  };
  return { sinks, calls };
}

describe("applySnapshotIntents", () => {
  it("意図を配列の順に、対応する受け皿へ渡す", () => {
    const { sinks, calls } = recordingSinks();
    const record = aRecord();
    applySnapshotIntents(
      [
        {
          kind: "save-resume",
          identity: { code: "ABCD", participantId: "p1", resumeToken: "t", displayName: "A" },
        },
        { kind: "clear-completion" },
        { kind: "set-screen", screen: "lobby" },
        { kind: "set-end", endType: "abort" },
        { kind: "persist-completion", record },
      ],
      sinks,
    );
    expect(calls).toEqual([
      "saveResume:ABCD",
      "clearCompletion",
      "setScreen:lobby",
      "setEnd:abort",
      `persistCompletion:${record.id}`,
    ]);
  });

  it("意図が空なら何も呼ばない", () => {
    const { sinks, calls } = recordingSinks();
    applySnapshotIntents([], sinks);
    expect(calls).toEqual([]);
  });
});
