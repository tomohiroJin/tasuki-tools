/**
 * Summary（締めくくり）画面のテスト
 * @requirements FR-020, FR-021, FR-044, US5
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

describe("Summary", () => {
  const noop = vi.fn();

  it("完成（endType=complete）では達成を示すタイトルを表示する", () => {
    // When
    render(
      <Summary
        endType="complete"
        record={baseRecord}
        onNewSession={noop}
        onSaveRecord={noop}
      />,
    );
    // Then（見出しで達成を示す。計器ラベル "Session Complete" とも併記されるため heading を特定する）
    expect(screen.getByRole("heading", { name: /完了|完成/ })).toBeTruthy();
  });

  it("中断（endType=abort）では中断を示すタイトルを表示し「完了」と区別される", () => {
    // When
    render(
      <Summary
        endType="abort"
        record={null}
        onNewSession={noop}
        onSaveRecord={noop}
      />,
    );
    // Then
    expect(screen.getByText(/中断|終了/i)).toBeTruthy();
    // 「完了！」などの達成表現が出ないこと
    expect(screen.queryByText(/完了！|Complete!/i)).toBeNull();
  });

  it("完成のとき記録保存ボタンを表示する", () => {
    // When
    render(
      <Summary
        endType="complete"
        record={baseRecord}
        onNewSession={noop}
        onSaveRecord={noop}
      />,
    );
    // Then
    expect(screen.getByRole("button", { name: /保存|save/i })).toBeTruthy();
  });

  it("中断のとき記録保存ボタンを表示しない（中断は記録なし）", () => {
    // When
    render(
      <Summary
        endType="abort"
        record={null}
        onNewSession={noop}
        onSaveRecord={noop}
      />,
    );
    // Then
    expect(screen.queryByRole("button", { name: /保存|save/i })).toBeNull();
  });

  /**
   * @requirements S1
   */
  describe("達成演出", () => {
    it("完成のとき達成バナー（aria-label=達成）を表示する", () => {
      // When
      render(
        <Summary
          endType="complete"
          record={baseRecord}
          onNewSession={noop}
          onSaveRecord={noop}
        />,
      );
      // Then
      expect(screen.getByLabelText("達成")).toBeTruthy();
    });

    it("中断のとき達成バナーを表示しない（達成として扱わない）", () => {
      // When
      render(
        <Summary
          endType="abort"
          record={null}
          onNewSession={noop}
          onSaveRecord={noop}
        />,
      );
      // Then
      expect(screen.queryByLabelText("達成")).toBeNull();
    });
  });

  /**
   * 振り返り: 個人別ドライバー回数・周回数
   * @requirements C3
   */
  describe("振り返り情報", () => {
    it("完成のとき個人別ドライバー回数と周回数を表示する", () => {
      // When
      render(
        <Summary
          endType="complete"
          record={{ ...baseRecord, members: ["Alice", "Bob"], driverCounts: [2, 1], rounds: 1 }}
          onNewSession={noop}
          onSaveRecord={noop}
        />,
      );
      // Then
      expect(screen.getByText("Alice")).toBeTruthy(); // 各メンバー名と回数
      expect(screen.getByText("Bob")).toBeTruthy();
      expect(screen.getByText("1周")).toBeTruthy(); // 周回数（値「1周」）
    });
  });

  it("次の行動（新規セッション）への導線を提示する", () => {
    // When
    render(
      <Summary
        endType="complete"
        record={baseRecord}
        onNewSession={noop}
        onSaveRecord={noop}
      />,
    );
    // Then
    expect(screen.getByRole("button", { name: /新しい|new.*session|セッション/i })).toBeTruthy();
  });
});
