/**
 * 端末（IndexedDB）に保存された完成記録を、いまの形へ畳む（#91・spec §5.5）。
 *
 * IndexedDB の記録は端末に残り続けるので、#91 PR 3 より前の形（`problemTitle`・
 * `language`・`difficulty`）と新しい形（`topicTitle`・null 可）が混ざって並ぶ。
 */
import { describe, it, expect } from "vitest";
import { normalizeStoredRecord } from "../../src/records/stored-record.js";

/** 新しい形の最小の記録。 */
function aStored(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: "a", topicTitle: "FizzBuzz", elapsedSeconds: 1, members: [], totalSwitches: 0, completedAt: 1, ...overrides };
}

/**
 * @requirements #91 E18（旧い形の記録は、お題名を記録のお題のタイトルとして出す）
 */
describe("端末に保存された記録を読む", () => {
  it("Given 旧い形（problemTitle・language・difficulty） / When 読む / Then topicTitle に畳まれる", () => {
    // Given
    const raw = { id: "a", problemTitle: "FizzBuzz", language: "Go", difficulty: "easy", elapsedSeconds: 1, members: [], totalSwitches: 0, completedAt: 1 };
    // When
    const record = normalizeStoredRecord(raw);
    // Then
    expect(record?.topicTitle).toBe("FizzBuzz");
    expect(record).not.toHaveProperty("problemTitle");
    expect(record).not.toHaveProperty("language");
    expect(record).not.toHaveProperty("difficulty");
  });

  it("Given 新しい形で topicTitle が null / When 読む / Then null のまま（旧い形と取り違えない）", () => {
    // Given: 旧い項目も混ざっている（null を「無い」と取り違えると problemTitle を拾ってしまう）
    const raw = aStored({ topicTitle: null, problemTitle: "旧いお題" });
    // When
    const record = normalizeStoredRecord(raw);
    // Then
    expect(record).not.toBeNull();
    expect(record?.topicTitle).toBeNull();
  });

  it("Given 新しい形でタイトルあり / When 読む / Then 項目がそのまま写る", () => {
    // Given
    const raw = aStored({ roomId: "R1", driverCounts: [1, 2], rounds: 1, members: ["あや", "ボブ"] });
    // When
    const record = normalizeStoredRecord(raw);
    // Then
    expect(record).toEqual({
      id: "a", roomId: "R1", topicTitle: "FizzBuzz", elapsedSeconds: 1, members: ["あや", "ボブ"],
      totalSwitches: 0, completedAt: 1, driverCounts: [1, 2], rounds: 1,
    });
  });

  it.each([
    ["id", { id: undefined }],
    ["completedAt", { completedAt: "昨日" }],
    ["elapsedSeconds", { elapsedSeconds: undefined }],
    ["totalSwitches", { totalSwitches: null }],
    ["members", { members: "あや" }],
  ])("Given 必須の項目（%s）が欠けた値 / When 読む / Then null（一覧から外す）", (_name, broken) => {
    // Given
    const raw = aStored(broken);
    // When
    const record = normalizeStoredRecord(raw);
    // Then
    expect(record).toBeNull();
  });

  it.each([[null], [undefined], ["文字列"], [42]])("Given オブジェクトでない値（%s） / When 読む / Then null", (raw) => {
    expect(normalizeStoredRecord(raw)).toBeNull();
  });
});
