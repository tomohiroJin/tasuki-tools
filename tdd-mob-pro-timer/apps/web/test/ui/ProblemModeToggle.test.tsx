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

  it("「お題なし」を押すと onChange(false) が呼ばれる", () => {
    const onChange = vi.fn();
    render(<ProblemModeToggle enabled onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "お題なし" }));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("「お題あり」を押すと onChange(true) が呼ばれる", () => {
    const onChange = vi.fn();
    render(<ProblemModeToggle enabled={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "お題あり" }));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
