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

  it("難易度・言語バッジが表示される（課題シート型）", () => {
    render(
      <ProblemEditor
        problem={baseProblem}
        difficulty="easy"
        language="TypeScript"
        onEdit={noop}
        onCopy={noop}
        onRegenerate={noop}
        onPaste={noop}
      />,
    );
    expect(screen.getByText("初級")).toBeTruthy();
    expect(screen.getByText("TypeScript")).toBeTruthy();
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
    const regenBtn = screen.getByRole("button", { name: /別のお題|やり直|再生成/i });
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

  it("持ち込み（custom）のとき持ち込みバッジが表示される", () => {
    render(
      <ProblemEditor
        problem={{ ...baseProblem, source: "custom" }}
        onEdit={noop}
        onCopy={noop}
        onRegenerate={noop}
        onPaste={noop}
      />,
    );
    expect(screen.getByText(/持ち込み/)).toBeTruthy();
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

  // ─── お題編集 UI（onEdit 発火）─────────────────────────────────────────────
  it("編集モードでタイトルを変更すると onEdit が title patch で呼ばれる（FR-038）", () => {
    const onEdit = vi.fn();
    render(
      <ProblemEditor
        problem={baseProblem}
        onEdit={onEdit}
        onCopy={noop}
        onRegenerate={noop}
        onPaste={noop}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /内容を編集/ }));
    const titleInput = screen.getByLabelText("お題タイトル");
    fireEvent.change(titleInput, { target: { value: "新タイトル" } });
    fireEvent.blur(titleInput);
    expect(onEdit).toHaveBeenCalledWith({ title: "新タイトル" });
  });

  it("編集モードで要件を変更すると onEdit が requirements 配列 patch で呼ばれる（FR-038）", () => {
    const onEdit = vi.fn();
    render(
      <ProblemEditor
        problem={baseProblem}
        onEdit={onEdit}
        onCopy={noop}
        onRegenerate={noop}
        onPaste={noop}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /内容を編集/ }));
    const reqInput = screen.getByLabelText(/要件/);
    fireEvent.change(reqInput, { target: { value: "条件A\n条件B\n条件C" } });
    fireEvent.blur(reqInput);
    expect(onEdit).toHaveBeenCalledWith({
      requirements: ["条件A", "条件B", "条件C"],
    });
  });

  // ─── 詳細の折りたたみ（S2: ロビー縦長の解消）─────────────────────────────
  it("既定では詳細（要件・例示テスト・ヒント）が折りたたまれ表示されない", () => {
    render(
      <ProblemEditor
        problem={baseProblem}
        onEdit={noop}
        onCopy={noop}
        onRegenerate={noop}
        onPaste={noop}
      />,
    );
    // タイトル・説明は常時表示
    expect(screen.getByText("FizzBuzz")).toBeTruthy();
    expect(screen.getByText(/3の倍数でFizz/)).toBeTruthy();
    // 詳細（例示テスト・要件・ヒント）は既定で非表示
    expect(screen.queryByText(/expect\(fizzbuzz/)).toBeNull();
    expect(screen.queryByText("3の倍数はFizz")).toBeNull();
    expect(screen.queryByText(/剰余を使う/)).toBeNull();
  });

  it("「詳細を表示」トグルで詳細が開き、もう一度押すと閉じる", () => {
    render(
      <ProblemEditor
        problem={baseProblem}
        onEdit={noop}
        onCopy={noop}
        onRegenerate={noop}
        onPaste={noop}
      />,
    );
    const toggle = screen.getByRole("button", { name: /詳細を表示|詳細を隠す/ });
    // 開く
    fireEvent.click(toggle);
    expect(screen.getByText(/expect\(fizzbuzz/)).toBeTruthy();
    expect(screen.getByText("3の倍数はFizz")).toBeTruthy();
    // 閉じる
    fireEvent.click(screen.getByRole("button", { name: /詳細を表示|詳細を隠す/ }));
    expect(screen.queryByText(/expect\(fizzbuzz/)).toBeNull();
  });

  it("canEdit=false（観覧者）では編集ボタンを表示しない（FR-055）", () => {
    render(
      <ProblemEditor
        problem={baseProblem}
        canEdit={false}
        onEdit={noop}
        onCopy={noop}
        onRegenerate={noop}
        onPaste={noop}
      />,
    );
    expect(screen.queryByRole("button", { name: /内容を編集/ })).toBeNull();
    // コピーは全員可（FR-013）
    expect(screen.getByRole("button", { name: /コピー/ })).toBeTruthy();
  });
});
