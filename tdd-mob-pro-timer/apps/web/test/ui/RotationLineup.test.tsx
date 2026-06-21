// apps/web/test/ui/RotationLineup.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { RotationLineup } from "../../src/ui/components/RotationLineup.js";

describe("RotationLineup", () => {
  const props = { rotation: ["Alice", "Bob", "Carol"], currentIndex: 0, intervalSeconds: 300, isPaused: false };

  it("番号付きで全員を並べ、現在に「今」次に「次」を出す", () => {
    render(<RotationLineup {...props} selfName="Carol" />);
    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getByText("▶ 今")).toBeTruthy();
    expect(screen.getByText("⟶ 次")).toBeTruthy();
  });

  it("自分が rotation 内なら自分基準サマリを出す", () => {
    render(<RotationLineup {...props} selfName="Carol" />);
    // Carol は 2 手先・約10分後。
    // 自分基準サマリの固有テキストで精密検証（他の要素では出現しない全文）
    expect(screen.getByText("あなた: あと2人・約10分後")).toBeTruthy();
  });

  it("自分が今ドライバーなら「あなたの番です」", () => {
    render(<RotationLineup {...props} currentIndex={2} selfName="Carol" />);
    expect(screen.getByText("あなたの番です")).toBeTruthy();
  });
});
