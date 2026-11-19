/**
 * Summary（締めくくり）画面のテスト
 * @requirements FR-020, FR-021, FR-044, US5
 */

import { afterEach, describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { Summary } from "../../src/ui/Summary.js";

const baseRecord = {
  id: "rec-1",
  topicTitle: "FizzBuzz",
  elapsedSeconds: 300,
  members: ["Alice", "Bob"],
  totalSwitches: 2,
  completedAt: 1000000,
};

describe("Summary", () => {
  const noop = vi.fn();

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("完成時、表示名と担当回数を含む Markdown を利用者の操作でコピーする（#408）", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(
      <Summary
        endType="complete"
        record={{
          ...baseRecord,
          id: "internal-record-id",
          roomId: "internal-room-id",
          topicTitle: "R&D *Buzz*\r\n# 次のお題\r<tag>\u2028`code`\u2029~~test~~\n\\path &amp; &#65; &#x41; https://example.com/a_b（https://example.com/_health？） (https://example.com/__init__(1).py)",
          members: ["A_[1]", "taro_y"],
          driverCounts: [2, 1],
          totalSwitches: 3,
          rounds: 1,
        }}
        onNewSession={noop}
        onSaveRecord={noop}
      />,
    );

    expect(writeText).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Markdown をコピー" }));
    expect(await screen.findByText("コピーしました")).toBeTruthy();
    expect(writeText).toHaveBeenCalledExactlyOnceWith([
      "セッションまとめ",
      "",
      "- お題：R&D \\*Buzz\\* # 次のお題 \\<tag\\> \\`code\\` \\~\\~test\\~\\~ \\\\path \\&amp; \\&#65; \\&#x41; <https://example.com/a_b>（<https://example.com/_health>？） (<https://example.com/__init__(1).py>)",
      "- 所要時間：5分00秒",
      "- 交代回数：3回",
      "- 周回数：1周",
      "- 参加者（2人）",
      "  - 「A\\_\\[1\\]」（担当2回）",
      "  - 「taro_y」（担当1回）",
    ].join("\n"));
  });

  it("コピーに失敗したときは本文を選択でき、再試行の成功で入力欄を閉じる（#408）", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<Summary endType="complete" record={baseRecord} onNewSession={noop} onSaveRecord={noop} />);

    const copyButton = screen.getByRole("button", { name: "Markdown をコピー" });
    expect(screen.queryByRole("textbox", { name: "手動コピー用の Markdown" })).toBeNull();
    fireEvent.click(copyButton);

    expect(await screen.findByText("コピーできませんでした")).toBeTruthy();
    const field = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "手動コピー用の Markdown" });
    expect(field.readOnly).toBe(true);
    expect(field.value).toContain("- お題：FizzBuzz");
    expect(writeText).toHaveBeenCalledExactlyOnceWith(field.value);
    fireEvent.focus(field);
    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe(field.value.length);

    writeText.mockResolvedValueOnce(undefined);
    fireEvent.click(copyButton);
    expect(await screen.findByText("コピーしました")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "手動コピー用の Markdown" })).toBeNull();
  });

  it("完成（endType=complete）では達成を示すタイトルを表示する", () => {
    // Given
    const endType = "complete";
    // When
    render(
      <Summary
        endType={endType}
        record={baseRecord}
        onNewSession={noop}
        onSaveRecord={noop}
      />,
    );
    // Then（見出しで達成を示す。計器ラベル "Session Complete" とも併記されるため heading を特定する）
    expect(screen.getByRole("heading", { name: /完了|完成/ })).toBeTruthy();
  });

  it("中断（endType=abort）では中断を示すタイトルを表示し「完了」と区別される", () => {
    // Given
    const endType = "abort";
    // When
    render(
      <Summary
        endType={endType}
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
    // Given
    const endType = "complete";
    // When
    render(
      <Summary
        endType={endType}
        record={baseRecord}
        onNewSession={noop}
        onSaveRecord={noop}
      />,
    );
    // Then
    expect(screen.getByRole("button", { name: /保存|save/i })).toBeTruthy();
  });

  it("中断のとき記録保存ボタンを表示しない（中断は記録なし）", () => {
    // Given
    const endType = "abort";
    // When
    render(
      <Summary
        endType={endType}
        record={null}
        onNewSession={noop}
        onSaveRecord={noop}
      />,
    );
    // Then
    expect(screen.queryByRole("button", { name: /保存|save/i })).toBeNull();
    expect(screen.queryByRole("button", { name: "Markdown をコピー" })).toBeNull();
  });

  /**
   * @requirements S1
   */
  describe("達成演出", () => {
    it("完成のとき達成バナー（aria-label=達成）を表示する", () => {
      // Given
      const endType = "complete";
      // When
      render(
        <Summary
          endType={endType}
          record={baseRecord}
          onNewSession={noop}
          onSaveRecord={noop}
        />,
      );
      // Then
      expect(screen.getByLabelText("達成")).toBeTruthy();
    });

    it("中断のとき達成バナーを表示しない（達成として扱わない）", () => {
      // Given
      const endType = "abort";
      // When
      render(
        <Summary
          endType={endType}
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
      // Given
      const record = { ...baseRecord, members: ["Alice", "Bob"], driverCounts: [2, 1], rounds: 1 };
      // When
      render(
        <Summary
          endType="complete"
          record={record}
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
    // Given（完成状態・baseRecord をそのまま使う）
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
