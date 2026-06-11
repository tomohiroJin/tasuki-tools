/**
 * History（端末ローカル記録の履歴ビュー）のテスト
 * v2.3 #5: 完了記録は IndexedDB に保存されているが閲覧画面が無かった。
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

describe("History（履歴ビュー）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteRecord.mockResolvedValue(undefined);
  });

  it("保存済み記録のお題タイトル・言語・所要時間・交代回数・日時を表示する", async () => {
    mockLoadRecords.mockResolvedValue([baseRecord]);
    render(<History onBack={vi.fn()} />);

    // お題タイトル
    expect(await screen.findByText("FizzBuzz")).toBeTruthy();
    // 言語
    expect(screen.getByText(/TypeScript/)).toBeTruthy();
    // 所要時間（305 秒 = 5分05秒 / 05:05 のいずれか）
    expect(screen.getByText(/5分05秒|05:05/)).toBeTruthy();
    // 交代回数
    expect(screen.getByText(/4回/)).toBeTruthy();
    // 日時（年が含まれる）
    expect(screen.getByText(/2026/)).toBeTruthy();
  });

  it("記録が空のとき空状態の案内を表示する", async () => {
    mockLoadRecords.mockResolvedValue([]);
    render(<History onBack={vi.fn()} />);

    expect(await screen.findByText(/記録がありません|まだ記録がありません/)).toBeTruthy();
  });

  it("削除ボタン押下で deleteRecord(id) が呼ばれ一覧から消える", async () => {
    mockLoadRecords.mockResolvedValue([baseRecord]);
    render(<History onBack={vi.fn()} />);

    expect(await screen.findByText("FizzBuzz")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /削除/ }));

    expect(mockDeleteRecord).toHaveBeenCalledWith("rec-1");
    await waitFor(() => {
      expect(screen.queryByText("FizzBuzz")).toBeNull();
    });
  });

  it("「戻る」で onBack が呼ばれる", async () => {
    mockLoadRecords.mockResolvedValue([baseRecord]);
    const onBack = vi.fn();
    render(<History onBack={onBack} />);

    expect(await screen.findByText("FizzBuzz")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /戻る/ }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
