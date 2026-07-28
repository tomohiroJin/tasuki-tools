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
  it("rotation 外のときバナーと加入 CTA を目立たせる", () => {
    render(<SelfDriverToggle {...base} inRotation={false} />);
    // Issue #22（T048）で文言を分けた。ここは「ローテーション外（役割は編集者のまま）」であり、
    // 役割が見学者である状態（SpectatorSelfActions の「あなたは見学者です」）とは別物。
    // 以前はどちらも「あなたは見学中です」で、進行の操作ができるのか読み分けられなかった。
    expect(screen.getByText(/ドライバーの輪の外/)).toBeTruthy();
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
