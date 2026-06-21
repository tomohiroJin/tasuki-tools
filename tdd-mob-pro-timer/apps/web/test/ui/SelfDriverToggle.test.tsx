import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { SelfDriverToggle } from "../../src/ui/components/SelfDriverToggle.js";

const base = {
  isSkipping: false,
  canLeave: true,
  displayName: "Bob",
  participantId: "p1",
  onJoin: vi.fn(),
  onLeave: vi.fn(),
  onSkip: vi.fn(),
  onResume: vi.fn(),
};

describe("SelfDriverToggle 見学者バナー", () => {
  it("rotation 外のとき見学中バナーと加入 CTA を目立たせる", () => {
    render(<SelfDriverToggle {...base} inRotation={false} />);
    // 見学中の見出しが表示される
    expect(screen.getByText(/見学中/)).toBeTruthy();
    // ドライバーに加わるボタンがアクセシブルな名前で存在する
    expect(screen.getByRole("button", { name: "ドライバーに加わる" })).toBeTruthy();
    // バナーに交代の輪の誘導文が表示される
    expect(screen.getByText(/交代の輪/)).toBeTruthy();
  });

  it("rotation 内のときは従来のトグル（誘導文なし）", () => {
    render(<SelfDriverToggle {...base} inRotation />);
    // 交代の輪の誘導文は表示されない
    expect(screen.queryByText(/交代の輪/)).toBeNull();
  });
});
