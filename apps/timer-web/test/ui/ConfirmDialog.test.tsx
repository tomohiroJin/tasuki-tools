/**
 * ConfirmDialog の最初のフォーカスとボタンの役割（#316 PR 3）
 * 取り消せない操作の確認なので、開いた直後のフォーカスは安全側（取り消し）にある。
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { ConfirmDialog } from "../../src/ui/components/ConfirmDialog.js";

function renderDialog(confirmIntent: "danger" | "primary") {
  return render(
    <ConfirmDialog
      open
      title="確認"
      confirmLabel="実行する"
      cancelLabel="やめる"
      confirmIntent={confirmIntent}
      onConfirm={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
}

describe("ConfirmDialog", () => {
  it("開いた直後のフォーカスは取り消しにある", () => {
    // Given
    // When
    renderDialog("danger");
    // Then
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "やめる" }));
  });

  it("取り消しは副、確定は意図が danger なら朱の枠・primary なら主の役割を持つ（主は並びの最後）", () => {
    // Given
    // When
    const { unmount } = renderDialog("danger");
    // Then
    expect(screen.getByRole("button", { name: "やめる" }).className).toBe("ui-button ui-button--secondary");
    expect(screen.getByRole("button", { name: "実行する" }).className).toBe("ui-button ui-button--danger");
    expect(screen.getByRole("button", { name: "実行する" }).previousElementSibling).toBe(screen.getByRole("button", { name: "やめる" }));
    unmount();

    // When
    renderDialog("primary");
    // Then
    expect(screen.getByRole("button", { name: "実行する" }).className).toBe("ui-button");
  });
});
