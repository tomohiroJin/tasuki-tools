/**
 * 完成記録の永続化ポリシーのテスト。
 * 完成（complete）のみ記録を保存し、中断（abort）では保存しない。
 */

import { describe, it, expect, vi } from "vitest";
import { persistRecordIfComplete } from "../../src/records/persist.js";
import type { CompletionRecord } from "@tasuki/timer-core";

const rec: CompletionRecord = {
  id: "rec-1",
  problemTitle: "FizzBuzz",
  language: "TypeScript",
  difficulty: "easy",
  elapsedSeconds: 300,
  members: ["Alice", "Bob"],
  totalSwitches: 2,
  completedAt: 1000000,
};

/**
 * @requirements FR-020
 */
describe("persistRecordIfComplete", () => {
  it("完成（complete）かつ記録ありなら記録が1回だけ永続化される", async () => {
    // Given
    const saver = vi.fn().mockResolvedValue(undefined);
    // When
    await persistRecordIfComplete("complete", rec, saver);
    // Then
    expect(saver).toHaveBeenCalledTimes(1);
    expect(saver).toHaveBeenCalledWith(rec);
  });

  it("中断（abort）では記録を永続化しない（達成として記録しない）", async () => {
    // Given
    const saver = vi.fn().mockResolvedValue(undefined);
    // When
    await persistRecordIfComplete("abort", rec, saver);
    // Then
    expect(saver).not.toHaveBeenCalled();
  });

  it("完成でも記録が null なら永続化しない", async () => {
    // Given
    const saver = vi.fn().mockResolvedValue(undefined);
    // When
    await persistRecordIfComplete("complete", null, saver);
    // Then
    expect(saver).not.toHaveBeenCalled();
  });
});
