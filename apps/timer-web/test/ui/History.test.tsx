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
  problemTitle: "FizzBuzz",
  language: "TypeScript",
  difficulty: "easy",
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

  it("保存済み記録のお題タイトル・言語・所要時間・交代回数・日時を表示する", async () => {
    // Given
    mockLoadRecords.mockResolvedValue([baseRecord]);
    // When
    render(<History onBack={vi.fn()} />);
    // Then
    expect(await screen.findByText("FizzBuzz")).toBeTruthy(); // お題タイトル
    expect(screen.getByText(/TypeScript/)).toBeTruthy(); // 言語
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
