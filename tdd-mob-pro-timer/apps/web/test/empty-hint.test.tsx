/**
 * EmptyHint コンポーネントのテスト（v2.2 R5-2）
 * 空状態/初回の控えめな案内。calm UI・role=note で SR にも伝える。
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { EmptyHint } from "../src/ui/components/EmptyHint.js";

describe("EmptyHint（R5-2）", () => {
  it("メッセージを表示し role=note でSRに伝える", () => {
    render(<EmptyHint>まだあなただけです</EmptyHint>);
    expect(screen.getByText("まだあなただけです")).toBeInTheDocument();
    expect(screen.getByRole("note")).toBeInTheDocument();
  });
});
