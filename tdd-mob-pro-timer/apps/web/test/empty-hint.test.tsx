/**
 * EmptyHint コンポーネントのテスト。
 * 空状態/初回の控えめな案内。calm UI・role=note で SR にも伝える。
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { EmptyHint } from "../src/ui/components/EmptyHint.js";

/**
 * @requirements v2.2 R5-2
 */
describe("EmptyHint", () => {
  it("メッセージを表示し role=note でSRに伝える", () => {
    // Given（子要素として渡す文言）
    // When
    render(<EmptyHint>まだあなただけです</EmptyHint>);
    // Then
    expect(screen.getByText("まだあなただけです")).toBeInTheDocument();
    expect(screen.getByRole("note")).toBeInTheDocument();
  });
});
