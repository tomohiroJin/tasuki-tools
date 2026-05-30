/**
 * 記録の入出力テスト
 * T028: FR-029, SC-008
 */

import { describe, it, expect } from "vitest";
import {
  exportRecords,
  importRecords,
} from "../../src/records/io.js";
import type { CompletionRecord } from "@tdd-mob/core";

const sampleRecord: CompletionRecord = {
  id: "test-id-001",
  problemTitle: "FizzBuzz",
  language: "TypeScript",
  difficulty: "easy",
  elapsedSeconds: 1200,
  members: ["Alice", "Bob", "Charlie"],
  totalSwitches: 4,
  completedAt: 1700000000000,
};

describe("exportRecords / importRecords: 往復で欠落なし（SC-008）", () => {
  it("1件の記録を書き出して読み込むと同じ内容になる", () => {
    const exported = exportRecords([sampleRecord]);
    const imported = importRecords(exported);

    expect(imported.isOk()).toBe(true);
    if (imported.isOk()) {
      expect(imported.value).toHaveLength(1);
      expect(imported.value[0]).toEqual(sampleRecord);
    }
  });

  it("複数件の記録を往復で復元できる", () => {
    const records: CompletionRecord[] = [
      sampleRecord,
      {
        ...sampleRecord,
        id: "test-id-002",
        problemTitle: "Palindrome",
        completedAt: 1700000001000,
      },
    ];

    const exported = exportRecords(records);
    const imported = importRecords(exported);

    expect(imported.isOk()).toBe(true);
    if (imported.isOk()) {
      expect(imported.value).toHaveLength(2);
      expect(imported.value[0]).toEqual(records[0]);
      expect(imported.value[1]).toEqual(records[1]);
    }
  });

  it("空の配列を往復できる", () => {
    const exported = exportRecords([]);
    const imported = importRecords(exported);
    expect(imported.isOk()).toBe(true);
    if (imported.isOk()) {
      expect(imported.value).toHaveLength(0);
    }
  });

  it("不正な JSON は Err を返す", () => {
    const imported = importRecords("{ invalid json");
    expect(imported.isErr()).toBe(true);
  });

  it("スキーマ不正なデータは Err を返す", () => {
    const imported = importRecords(
      JSON.stringify({ records: [{ id: 123 }] }),
    );
    expect(imported.isErr()).toBe(true);
  });

  it("roomId は省略可能で往復しても消えない", () => {
    const withRoomId: CompletionRecord = {
      ...sampleRecord,
      roomId: "room-abc",
    };
    const exported = exportRecords([withRoomId]);
    const imported = importRecords(exported);
    expect(imported.isOk()).toBe(true);
    if (imported.isOk()) {
      expect(imported.value[0]?.roomId).toBe("room-abc");
    }
  });
});
