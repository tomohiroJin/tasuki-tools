import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AiUnlockPanel } from "../../src/ui/components/AiUnlockPanel.js";

describe("AiUnlockPanel", () => {
  it("未解錠時はテキストリンクのみ表示し、入力欄は隠れている", () => {
    render(<AiUnlockPanel unlocked={false} aiMode={false} onUnlock={vi.fn()} onModeSet={vi.fn()} />);
    expect(screen.getByRole("button", { name: "AI でお題を生成する（合言葉が必要）" })).toBeTruthy();
    // 展開前は入力欄を出さない（控えめ表示）
    expect(screen.queryByLabelText("AI 生成の合言葉")).toBeNull();
  });

  it("リンクをクリックすると入力欄が開き、合言葉を入力して解錠すると入力値が送られる", () => {
    // Given
    const onUnlock = vi.fn();
    render(<AiUnlockPanel unlocked={false} aiMode={false} onUnlock={onUnlock} onModeSet={vi.fn()} />);
    // When
    fireEvent.click(screen.getByRole("button", { name: "AI でお題を生成する（合言葉が必要）" }));
    const input = screen.getByLabelText("AI 生成の合言葉");
    fireEvent.change(input, { target: { value: "himitsu" } });
    fireEvent.click(screen.getByRole("button", { name: "解錠" }));
    // Then
    expect(onUnlock).toHaveBeenCalledWith("himitsu");
    // 送信後は平文を画面状態に残さない
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("展開後に閉じるとテキストリンクへ戻る", () => {
    // Given
    render(<AiUnlockPanel unlocked={false} aiMode={false} onUnlock={vi.fn()} onModeSet={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "AI でお題を生成する（合言葉が必要）" }));
    // When
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    // Then
    expect(screen.getByRole("button", { name: "AI でお題を生成する（合言葉が必要）" })).toBeTruthy();
    expect(screen.queryByLabelText("AI 生成の合言葉")).toBeNull();
  });

  it("展開後は Enter キーでも入力値が送られる", () => {
    // Given
    const onUnlock = vi.fn();
    render(<AiUnlockPanel unlocked={false} aiMode={false} onUnlock={onUnlock} onModeSet={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "AI でお題を生成する（合言葉が必要）" }));
    const input = screen.getByLabelText("AI 生成の合言葉");
    fireEvent.change(input, { target: { value: "himitsu" } });
    // When
    fireEvent.keyDown(input, { key: "Enter" });
    // Then
    expect(onUnlock).toHaveBeenCalledWith("himitsu");
  });

  it("解錠済み・AI モード時は有効表示を出し、OFF トグルを押すと定型に戻る", () => {
    // Given
    const onModeSet = vi.fn();
    render(<AiUnlockPanel unlocked={true} aiMode={true} onUnlock={vi.fn()} onModeSet={onModeSet} />);
    expect(screen.getByText(/AI 生成: 有効/)).toBeTruthy();
    // When
    fireEvent.click(screen.getByRole("button", { name: "定型に戻す" }));
    // Then
    expect(onModeSet).toHaveBeenCalledWith("fallback");
  });

  it("解錠済み・定型モード時はトグルを押すと AI 生成に切り替わる", () => {
    // Given
    const onModeSet = vi.fn();
    render(<AiUnlockPanel unlocked={true} aiMode={false} onUnlock={vi.fn()} onModeSet={onModeSet} />);
    // When
    fireEvent.click(screen.getByRole("button", { name: "AI 生成を使う" }));
    // Then
    expect(onModeSet).toHaveBeenCalledWith("ai");
  });
});
