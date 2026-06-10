/**
 * ホスト用パスフレーズパネル（R4-2・v2.2 Phase 3b）のコンポーネントテスト。
 * 未保護＝入力＋設定、保護中＝設定中表示＋解除（空文字で解除）の振る舞いを検証する。
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PassphrasePanel } from "../../src/ui/components/PassphrasePanel.js";

describe("PassphrasePanel", () => {
  it("未保護なら入力＋設定ボタンを出し、設定で onSet(passphrase) を呼ぶ", async () => {
    const onSet = vi.fn();
    render(<PassphrasePanel protectedNow={false} onSet={onSet} />);
    await userEvent.type(screen.getByLabelText(/パスフレーズ/), "secret");
    await userEvent.click(screen.getByRole("button", { name: /設定/ }));
    expect(onSet).toHaveBeenCalledWith("secret");
  });

  it("保護中なら設定中表示と解除ボタンを出し、解除で onSet('') を呼ぶ", async () => {
    const onSet = vi.fn();
    render(<PassphrasePanel protectedNow={true} onSet={onSet} />);
    expect(screen.getByText(/設定中|保護/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /解除/ }));
    expect(onSet).toHaveBeenCalledWith("");
  });
});
