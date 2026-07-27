/**
 * 自分でルームから抜ける（host-spof-relaxation G5・T033）
 *
 * 開始後は自己退出が可能になった（G3・FR-079）。自分の操作なので確認は課さないが、
 * 他人向けの破壊的操作（RosterPanel の「退出させる」）とは配置を分ける。
 * 誤タップで他人を巻き込む事故と、自分が抜ける操作は性質が違う。
 *
 * 要件: FR-078, FR-079, US3
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { SelfDriverToggle } from "../../src/ui/components/SelfDriverToggle.js";

const base = {
  inRotation: true,
  isSkipping: false,
  canLeave: true,
  displayName: "Alice",
  participantId: "p1",
};

describe("SelfDriverToggle: ルームから抜ける", () => {
  it("ルームから抜けるボタンが出る", () => {
    render(<SelfDriverToggle {...base} onLeaveRoom={vi.fn()} />);

    expect(screen.getByRole("button", { name: "ルームから抜ける" })).toBeTruthy();
  });

  it("押すと onLeaveRoom が自分の participantId で発火する（確認は課さない）", () => {
    const onLeaveRoom = vi.fn();
    render(<SelfDriverToggle {...base} onLeaveRoom={onLeaveRoom} />);

    fireEvent.click(screen.getByRole("button", { name: "ルームから抜ける" }));

    expect(onLeaveRoom).toHaveBeenCalledWith("p1");
  });

  it("ローテーション外（見学中）でもルームから抜けられる", () => {
    // 見学バナー側の分岐にも導線が要る。見学者が抜けられないと部屋に取り残される。
    render(<SelfDriverToggle {...base} inRotation={false} onLeaveRoom={vi.fn()} />);

    expect(screen.getByRole("button", { name: "ルームから抜ける" })).toBeTruthy();
  });

  it("ハンドラが無ければ出さない（ソロ等の非対応コンシューマ）", () => {
    render(<SelfDriverToggle {...base} />);

    expect(screen.queryByRole("button", { name: "ルームから抜ける" })).toBeNull();
  });

  it("列から外れる（rotation の出入り）とは別のボタンである", () => {
    render(<SelfDriverToggle {...base} onLeaveRoom={vi.fn()} onLeave={vi.fn()} />);

    expect(screen.getByRole("button", { name: "列から外れる" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "ルームから抜ける" })).toBeTruthy();
  });
});
