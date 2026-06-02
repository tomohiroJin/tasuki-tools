/**
 * Summary（締めくくり）画面のテスト
 * T047/T048: FR-020,021,044 (US5)
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { Summary } from "../../src/ui/Summary.js";

const baseRecord = {
  id: "rec-1",
  problemTitle: "FizzBuzz",
  language: "TypeScript",
  difficulty: "easy",
  elapsedSeconds: 300,
  members: ["Alice", "Bob"],
  totalSwitches: 2,
  completedAt: 1000000,
};

describe("Summary（T047/T048）", () => {
  const noop = vi.fn();

  it("完成（endType=complete）では達成を示すタイトルを表示する（FR-044）", () => {
    render(
      <Summary
        endType="complete"
        record={baseRecord}
        onNewSession={noop}
        onSaveRecord={noop}
      />,
    );
    expect(screen.getByText(/完了|Complete|完成/i)).toBeTruthy();
  });

  it("中断（endType=abort）では中断を示すタイトルを表示し「完了」と区別される（FR-020/044）", () => {
    render(
      <Summary
        endType="abort"
        record={null}
        onNewSession={noop}
        onSaveRecord={noop}
      />,
    );
    expect(screen.getByText(/中断|終了/i)).toBeTruthy();
    // 「完了！」などの達成表現が出ないこと
    expect(screen.queryByText(/完了！|Complete!/i)).toBeNull();
  });

  it("完成のとき記録保存ボタンを表示する（FR-020）", () => {
    render(
      <Summary
        endType="complete"
        record={baseRecord}
        onNewSession={noop}
        onSaveRecord={noop}
      />,
    );
    expect(screen.getByRole("button", { name: /保存|save/i })).toBeTruthy();
  });

  it("中断のとき記録保存ボタンを表示しない（FR-020: 中断は記録なし）", () => {
    render(
      <Summary
        endType="abort"
        record={null}
        onNewSession={noop}
        onSaveRecord={noop}
      />,
    );
    expect(screen.queryByRole("button", { name: /保存|save/i })).toBeNull();
  });

  // ─── 達成演出（S1: 完成時のみ祝祭バナー）─────────────────────────────────
  it("完成のとき達成バナー（aria-label=達成）を表示する", () => {
    render(
      <Summary
        endType="complete"
        record={baseRecord}
        onNewSession={noop}
        onSaveRecord={noop}
      />,
    );
    expect(screen.getByLabelText("達成")).toBeTruthy();
  });

  it("中断のとき達成バナーを表示しない（達成として扱わない）", () => {
    render(
      <Summary
        endType="abort"
        record={null}
        onNewSession={noop}
        onSaveRecord={noop}
      />,
    );
    expect(screen.queryByLabelText("達成")).toBeNull();
  });

  // ─── 振り返り: 個人別ドライバー回数・周回数（UX 再設計 C3）─────────────────
  it("完成のとき個人別ドライバー回数と周回数を表示する", () => {
    render(
      <Summary
        endType="complete"
        record={{ ...baseRecord, members: ["Alice", "Bob"], driverCounts: [2, 1], rounds: 1 }}
        onNewSession={noop}
        onSaveRecord={noop}
      />,
    );
    // 各メンバー名と回数
    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getByText("Bob")).toBeTruthy();
    // 周回数（値「1周」）
    expect(screen.getByText("1周")).toBeTruthy();
  });

  it("次の行動（新規セッション）への導線を提示する（FR-021）", () => {
    render(
      <Summary
        endType="complete"
        record={baseRecord}
        onNewSession={noop}
        onSaveRecord={noop}
      />,
    );
    expect(screen.getByRole("button", { name: /新しい|new.*session|セッション/i })).toBeTruthy();
  });
});
