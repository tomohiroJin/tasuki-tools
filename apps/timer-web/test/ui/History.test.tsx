/**
 * History（端末ローカル記録の履歴ビュー）のテスト
 * 完了記録は IndexedDB に保存されているが閲覧画面が無かった。
 * loadRecords/deleteRecord をモックし、表示・空状態・削除・戻る導線を検証する。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// indexeddb はモックして実 DB に触れない（既存 web テストの流儀）。
vi.mock("../../src/records/indexeddb.js", () => ({
  loadRecords: vi.fn(),
  deleteRecord: vi.fn(),
}));

import { History } from "../../src/ui/History.js";
import { loadRecords, deleteRecord } from "../../src/records/indexeddb.js";

const mockLoadRecords = vi.mocked(loadRecords);
const mockDeleteRecord = vi.mocked(deleteRecord);

const baseRecord = {
  id: "rec-1",
  topicTitle: "FizzBuzz" as string | null,
  elapsedSeconds: 305,
  members: ["Alice", "Bob"],
  totalSwitches: 4,
  completedAt: new Date("2026-06-01T10:30:00").getTime(),
};

/**
 * @requirements v2.3 #5
 */
describe("History（履歴ビュー）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteRecord.mockResolvedValue(undefined);
  });

  it("保存済み記録のお題タイトル・所要時間・交代回数・日時を表示する", async () => {
    // Given
    mockLoadRecords.mockResolvedValue([baseRecord]);
    // When
    render(<History onBack={vi.fn()} />);
    // Then
    expect(await screen.findByText("FizzBuzz")).toBeTruthy(); // お題タイトル
    expect(screen.getByText(/5分05秒|05:05/)).toBeTruthy(); // 所要時間（305 秒 = 5分05秒 / 05:05 のいずれか）
    expect(screen.getByText(/4回/)).toBeTruthy(); // 交代回数
    expect(screen.getByText(/2026/)).toBeTruthy(); // 日時（年が含まれる）
  });

  it("記録が空のとき空状態の案内を表示する", async () => {
    // Given
    mockLoadRecords.mockResolvedValue([]);
    // When
    render(<History onBack={vi.fn()} />);
    // Then
    expect(await screen.findByText(/記録がありません|まだ記録がありません/)).toBeTruthy();
  });

  it("削除ボタンを押すと該当記録が削除され一覧から消える", async () => {
    // Given
    mockLoadRecords.mockResolvedValue([baseRecord]);
    render(<History onBack={vi.fn()} />);
    expect(await screen.findByText("FizzBuzz")).toBeTruthy();
    // When
    fireEvent.click(screen.getByRole("button", { name: /削除/ }));
    // Then
    expect(mockDeleteRecord).toHaveBeenCalledWith("rec-1");
    await waitFor(() => {
      expect(screen.queryByText("FizzBuzz")).toBeNull();
    });
  });

  it("「戻る」を押すと呼び出し元へ戻る", async () => {
    // Given
    mockLoadRecords.mockResolvedValue([baseRecord]);
    const onBack = vi.fn();
    render(<History onBack={onBack} />);
    expect(await screen.findByText("FizzBuzz")).toBeTruthy();
    // When
    fireEvent.click(screen.getByRole("button", { name: /戻る/ }));
    // Then
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

/**
 * @requirements #91 E23（お題なしの記録は「お題なし」と出し、削除を完了日時で区別できる名前で示す）
 */
describe("History: お題なしの記録と削除ボタンの名前", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteRecord.mockResolvedValue(undefined);
  });

  it("Given お題なしの記録 / When 履歴を描く / Then 見出しに『お題なし』、削除ボタンの名前に完了日時が入る", async () => {
    // Given
    const completedAt = new Date("2026-06-01T10:30:00").getTime();
    mockLoadRecords.mockResolvedValue([{ ...baseRecord, topicTitle: null, completedAt }]);
    // When
    render(<History onBack={vi.fn()} />);
    // Then
    expect(await screen.findByText("お題なし")).toBeTruthy();
    const when = new Date(completedAt).toLocaleString("ja-JP");
    expect(screen.getByRole("button", { name: `${when} に完了した「お題なし」の記録を削除` })).toBeTruthy();
  });

  it("Given 同じタイトルの記録が 2 件 / When 履歴を描く / Then 2 つの削除ボタンの名前が違う", async () => {
    // Given
    mockLoadRecords.mockResolvedValue([
      { ...baseRecord, id: "r1", completedAt: new Date("2026-06-01T10:30:00").getTime() },
      { ...baseRecord, id: "r2", completedAt: new Date("2026-06-02T11:45:00").getTime() },
    ]);
    // When
    render(<History onBack={vi.fn()} />);
    await screen.findAllByText("FizzBuzz");
    // Then
    const names = screen.getAllByRole("button", { name: /の記録を削除/ }).map((b) => b.getAttribute("aria-label"));
    expect(names).toHaveLength(2);
    expect(new Set(names).size).toBe(2);
  });

  it("Given 言語と難易度を持つ旧い記録 / When 履歴を描く / Then 言語と難易度は出さない", async () => {
    // Given: 読み込みで畳まれていても、旧い項目が残った値が渡ってきた場合
    mockLoadRecords.mockResolvedValue([{ ...baseRecord, language: "Go", difficulty: "hard" } as typeof baseRecord]);
    // When
    render(<History onBack={vi.fn()} />);
    await screen.findByText("FizzBuzz");
    // Then
    expect(screen.queryByText(/Go/)).toBeNull();
    expect(screen.queryByText(/hard/)).toBeNull();
  });
});
