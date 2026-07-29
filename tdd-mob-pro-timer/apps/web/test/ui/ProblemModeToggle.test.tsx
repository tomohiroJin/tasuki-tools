import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { ProblemModeToggle } from "../../src/ui/components/ProblemModeToggle.js";

describe("ProblemModeToggle", () => {
  it("enabled=true なら「お題あり」が選択状態", () => {
    render(<ProblemModeToggle enabled onChange={vi.fn()} />);
    expect(screen.getByRole("radio", { name: "お題あり" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "お題なし" }).getAttribute("aria-checked")).toBe("false");
  });

  it("「お題なし」を押すとお題機能が無効になる", () => {
    // Given
    const onChange = vi.fn();
    render(<ProblemModeToggle enabled onChange={onChange} />);
    // When
    fireEvent.click(screen.getByRole("radio", { name: "お題なし" }));
    // Then
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("「お題あり」を押すとお題機能が有効になる", () => {
    // Given
    const onChange = vi.fn();
    render(<ProblemModeToggle enabled={false} onChange={onChange} />);
    // When
    fireEvent.click(screen.getByRole("radio", { name: "お題あり" }));
    // Then
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
