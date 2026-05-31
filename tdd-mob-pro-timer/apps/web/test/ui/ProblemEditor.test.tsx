/**
 * ProblemEditor コンポーネントのテスト
 * T050/T051: FR-009,012,013,038,039,040,041 (US3)
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { ProblemEditor } from "../../src/ui/components/ProblemEditor.js";
import type { Problem } from "@tdd-mob/core";

const baseProblem: Problem = {
  title: "FizzBuzz",
  description: "3の倍数でFizz",
  requirements: ["3の倍数はFizz", "5の倍数はBuzz"],
  exampleTest: "expect(fizzbuzz(3)).toBe('Fizz')",
  hints: ["剰余を使う"],
  source: "fallback",
  edited: false,
};

describe("ProblemEditor（T050/T051）", () => {
  const noop = vi.fn();

  it("お題のタイトル・説明が表示される（FR-009）", () => {
    render(
      <ProblemEditor
        problem={baseProblem}
        onEdit={noop}
        onCopy={noop}
        onRegenerate={noop}
        onPaste={noop}
      />,
    );
    expect(screen.getByText("FizzBuzz")).toBeTruthy();
    expect(screen.getByText(/3の倍数でFizz/)).toBeTruthy();
  });

  it("出所バッジ（定型）が表示される（FR-015）", () => {
    render(
      <ProblemEditor
        problem={baseProblem}
        onEdit={noop}
        onCopy={noop}
        onRegenerate={noop}
        onPaste={noop}
      />,
    );
    expect(screen.getByText(/定型|fallback|Template/i)).toBeTruthy();
  });

  it("コピーボタンを押すと onCopy が呼ばれる（FR-013）", () => {
    const onCopy = vi.fn();
    render(
      <ProblemEditor
        problem={baseProblem}
        onEdit={onCopy}
        onCopy={onCopy}
        onRegenerate={noop}
        onPaste={noop}
      />,
    );
    // onCopy を直接呼べるようなコピーボタンがあることを確認
    const copyBtn = screen.getByRole("button", { name: /コピー|copy/i });
    fireEvent.click(copyBtn);
    expect(onCopy).toHaveBeenCalled();
  });

  it("やり直しボタンを押すと onRegenerate が呼ばれる（FR-012）", () => {
    const onRegenerate = vi.fn();
    render(
      <ProblemEditor
        problem={baseProblem}
        onEdit={noop}
        onCopy={noop}
        onRegenerate={onRegenerate}
        onPaste={noop}
      />,
    );
    const regenBtn = screen.getByRole("button", { name: /やり直|再生成|regenerate/i });
    fireEvent.click(regenBtn);
    expect(onRegenerate).toHaveBeenCalledOnce();
  });

  it("持ち込みボタンを押すと onPaste が呼ばれる（FR-040）", () => {
    const onPaste = vi.fn();
    render(
      <ProblemEditor
        problem={baseProblem}
        onEdit={noop}
        onCopy={noop}
        onRegenerate={noop}
        onPaste={onPaste}
      />,
    );
    const pasteBtn = screen.getByRole("button", { name: /持ち込|paste|貼り付け/i });
    fireEvent.click(pasteBtn);
    expect(onPaste).toHaveBeenCalledOnce();
  });

  it("AI 由来のとき AI バッジが表示される（FR-015）", () => {
    render(
      <ProblemEditor
        problem={{ ...baseProblem, source: "ai" }}
        onEdit={noop}
        onCopy={noop}
        onRegenerate={noop}
        onPaste={noop}
      />,
    );
    expect(screen.getByText(/AI/i)).toBeTruthy();
  });

  it("edited=true のとき編集済みバッジが表示される（FR-038）", () => {
    render(
      <ProblemEditor
        problem={{ ...baseProblem, edited: true }}
        onEdit={noop}
        onCopy={noop}
        onRegenerate={noop}
        onPaste={noop}
      />,
    );
    expect(screen.getByText(/編集済|edited/i)).toBeTruthy();
  });
});
