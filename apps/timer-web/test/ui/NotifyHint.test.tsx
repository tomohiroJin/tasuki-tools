import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { NotifyHint } from "../../src/ui/components/NotifyHint.js";

describe("NotifyHint", () => {
  it("案内文と閉じるボタンを表示し、閉じると案内が消える", () => {
    // Given
    const onDismiss = vi.fn();
    render(<NotifyHint onDismiss={onDismiss} />);
    expect(screen.getByText(/交代を音で知らせ/)).toBeTruthy();
    // When
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    // Then
    expect(onDismiss).toHaveBeenCalled();
  });
});
