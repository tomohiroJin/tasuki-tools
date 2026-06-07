/**
 * 完成記録の永続化ポリシーのテスト（FR-020）
 * 完成（complete）のみ記録を保存し、中断（abort）では保存しない。
 */

import { describe, it, expect, vi } from "vitest";
import { persistRecordIfComplete } from "../../src/records/persist.js";
import type { CompletionRecord } from "@tdd-mob/core";

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

describe("persistRecordIfComplete（FR-020）", () => {
  it("完成（complete）かつ記録ありなら saver を記録付きで1回呼ぶ", async () => {
    const saver = vi.fn().mockResolvedValue(undefined);
    await persistRecordIfComplete("complete", rec, saver);
    expect(saver).toHaveBeenCalledTimes(1);
    expect(saver).toHaveBeenCalledWith(rec);
  });

  it("中断（abort）では saver を呼ばない（達成として記録しない）", async () => {
    const saver = vi.fn().mockResolvedValue(undefined);
    await persistRecordIfComplete("abort", rec, saver);
    expect(saver).not.toHaveBeenCalled();
  });

  it("完成でも記録が null なら saver を呼ばない", async () => {
    const saver = vi.fn().mockResolvedValue(undefined);
    await persistRecordIfComplete("complete", null, saver);
    expect(saver).not.toHaveBeenCalled();
  });
});
