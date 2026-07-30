/**
 * ProblemEditor コンポーネントのテスト
 * @requirements FR-009, FR-012, FR-013, FR-038, FR-039, FR-040, FR-041, US3
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
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

describe("ProblemEditor", () => {
  const noop = vi.fn();

  it("お題のタイトル・説明が表示される", () => {
    // Given（baseProblem をそのまま使う）
    // When
    render(
      <ProblemEditor
        problem={baseProblem}
        onEdit={noop}
        onCopy={noop}
        onRegenerate={noop}
        onPaste={noop}
      />,
    );
    // Then
    expect(screen.getByText("FizzBuzz")).toBeTruthy();
    expect(screen.getByText(/3の倍数でFizz/)).toBeTruthy();
  });

  it("難易度・言語バッジが表示される（課題シート型）", () => {
    // Given
    const difficulty = "easy";
    const language = "TypeScript";
    // When
    render(
      <ProblemEditor
        problem={baseProblem}
        difficulty={difficulty}
        language={language}
        onEdit={noop}
        onCopy={noop}
        onRegenerate={noop}
        onPaste={noop}
      />,
    );
    // Then
    expect(screen.getByText("初級")).toBeTruthy();
    expect(screen.getByText("TypeScript")).toBeTruthy();
  });

  it("コピーボタンを押すとお題がコピーされる", () => {
    // Given
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
    // When（onCopy を直接呼べるようなコピーボタンがあることを確認）
    const copyBtn = screen.getByRole("button", { name: /コピー|copy/i });
    fireEvent.click(copyBtn);
    // Then
    expect(onCopy).toHaveBeenCalled();
  });

  it("やり直しボタンを押すと別のお題への差し替えが要求される", () => {
    // Given
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
    // When
    const regenBtn = screen.getByRole("button", { name: /別のお題|やり直|再生成/i });
    fireEvent.click(regenBtn);
    // Then
    expect(onRegenerate).toHaveBeenCalledOnce();
  });

  it("持ち込みボタンを押すと持ち込みへの切替が要求される", () => {
    // Given
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
    // When
    const pasteBtn = screen.getByRole("button", { name: /持ち込|paste|貼り付け/i });
    fireEvent.click(pasteBtn);
    // Then
    expect(onPaste).toHaveBeenCalledOnce();
  });

  it("持ち込み（custom）のとき持ち込みバッジが表示される", () => {
    // Given
    const problem: Problem = { ...baseProblem, source: "custom" };
    // When
    render(
      <ProblemEditor
        problem={problem}
        onEdit={noop}
        onCopy={noop}
        onRegenerate={noop}
        onPaste={noop}
      />,
    );
    // Then
    expect(screen.getByText(/持ち込み/)).toBeTruthy();
  });

  it("edited=true のとき編集済みバッジが表示される", () => {
    // Given
    const problem: Problem = { ...baseProblem, edited: true };
    // When
    render(
      <ProblemEditor
        problem={problem}
        onEdit={noop}
        onCopy={noop}
        onRegenerate={noop}
        onPaste={noop}
      />,
    );
    // Then
    expect(screen.getByText(/編集済|edited/i)).toBeTruthy();
  });

  // ─── お題編集 UI（onEdit 発火）─────────────────────────────────────────────
  it("編集モードでタイトルを変更して確定するとタイトルの変更が伝わる", () => {
    // Given
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
    // When
    fireEvent.click(screen.getByRole("button", { name: /内容を編集/ }));
    const titleInput = screen.getByLabelText("お題タイトル");
    fireEvent.change(titleInput, { target: { value: "新タイトル" } });
    fireEvent.blur(titleInput);
    // Then
    expect(onEdit).toHaveBeenCalledWith({ title: "新タイトル" });
  });

  it("編集モードで要件を変更して確定すると要件の配列が伝わる", () => {
    // Given
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
    // When
    fireEvent.click(screen.getByRole("button", { name: /内容を編集/ }));
    const reqInput = screen.getByLabelText(/要件/);
    fireEvent.change(reqInput, { target: { value: "条件A\n条件B\n条件C" } });
    fireEvent.blur(reqInput);
    // Then
    expect(onEdit).toHaveBeenCalledWith({
      requirements: ["条件A", "条件B", "条件C"],
    });
  });

  // ─── 詳細の折りたたみ（S2: ロビー縦長の解消）─────────────────────────────
  it("既定では詳細（要件・例示テスト・ヒント）まで表示される", () => {
    // Given（非 compact＝ロビーでは詳細を既定で表示する。お題をしっかり見せる）
    // When
    render(
      <ProblemEditor
        problem={baseProblem}
        onEdit={noop}
        onCopy={noop}
        onRegenerate={noop}
        onPaste={noop}
      />,
    );
    // Then（タイトル・説明は常時表示）
    expect(screen.getByText("FizzBuzz")).toBeTruthy();
    expect(screen.getByText(/3の倍数でFizz/)).toBeTruthy();
    expect(screen.getByText(/expect\(fizzbuzz/)).toBeTruthy();
    expect(screen.getByText("3の倍数はFizz")).toBeTruthy();
    expect(screen.getByText(/剰余を使う/)).toBeTruthy();
  });

  it("「詳細を隠す/表示」トグルで詳細を開閉できる", () => {
    // Given（非 compact は既定で開いている）
    render(
      <ProblemEditor
        problem={baseProblem}
        onEdit={noop}
        onCopy={noop}
        onRegenerate={noop}
        onPaste={noop}
      />,
    );
    expect(screen.getByText(/expect\(fizzbuzz/)).toBeTruthy();
    // When（閉じる）
    fireEvent.click(screen.getByRole("button", { name: /詳細を表示|詳細を隠す/ }));
    // Then
    expect(screen.queryByText(/expect\(fizzbuzz/)).toBeNull();
    // When（再び開く）
    fireEvent.click(screen.getByRole("button", { name: /詳細を表示|詳細を隠す/ }));
    // Then
    expect(screen.getByText(/expect\(fizzbuzz/)).toBeTruthy();
  });

  it("canEdit=false（観覧者）では編集ボタンを表示せずコピーのみ表示する", () => {
    // Given
    const canEdit = false;
    // When
    render(
      <ProblemEditor
        problem={baseProblem}
        canEdit={canEdit}
        onEdit={noop}
        onCopy={noop}
        onRegenerate={noop}
        onPaste={noop}
      />,
    );
    // Then（コピーは全員可）
    expect(screen.queryByRole("button", { name: /内容を編集/ })).toBeNull();
    expect(screen.getByRole("button", { name: /コピー/ })).toBeTruthy();
  });
});

// ─── 出題元ラベル ─────────────────────────────────────────────────────────────

const mkProblem = (over: Partial<Problem> = {}): Problem => ({
  title: "テストお題",
  description: "説明",
  requirements: ["r1", "r2", "r3"],
  exampleTest: "test('x', () => {})",
  hints: ["h1"],
  ...over,
});

const baseProps = {
  canEdit: true,
  difficulty: "easy" as const,
  language: "TypeScript",
  onEdit: vi.fn(),
  onCopy: vi.fn(),
  onRegenerate: vi.fn(),
  onPaste: vi.fn(),
};

describe("ProblemEditor 出題元ラベル", () => {
  beforeEach(() => vi.clearAllMocks());

  it("source=ai は「AI 生成」ラベルを出す", () => {
    render(<ProblemEditor {...baseProps} problem={mkProblem({ source: "ai" })} />);
    expect(screen.getByText("AI 生成")).toBeTruthy();
  });
  it("source=fallback は「定型」ラベルを出す", () => {
    render(<ProblemEditor {...baseProps} problem={mkProblem({ source: "fallback" })} />);
    expect(screen.getByText("定型")).toBeTruthy();
  });
  it("source 無し（undefined）も「定型」ラベルを出す", () => {
    render(<ProblemEditor {...baseProps} problem={mkProblem()} />);
    expect(screen.getByText("定型")).toBeTruthy();
  });
  it("source=custom は「持ち込み」ラベルを出す", () => {
    render(<ProblemEditor {...baseProps} problem={mkProblem({ source: "custom" })} />);
    expect(screen.getByText("持ち込み")).toBeTruthy();
  });
});

describe("ProblemEditor 生成中表示", () => {
  beforeEach(() => vi.clearAllMocks());

  it("generating 時はボタンが「生成中…」で disabled・カードが aria-busy", () => {
    // Given
    const problem = mkProblem({ source: "ai" });
    // When
    render(<ProblemEditor {...baseProps} problem={problem} generating />);
    // Then
    const btn = screen.getByRole("button", { name: /生成中/ });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("group", { name: "お題" }).getAttribute("aria-busy")).toBe("true");
  });
  it("generating でない時は「別のお題にする」ボタン（有効）", () => {
    // Given
    const problem = mkProblem({ source: "ai" });
    // When
    render(<ProblemEditor {...baseProps} problem={problem} />);
    // Then
    const btn = screen.getByRole("button", { name: "別のお題にする" });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });
});
