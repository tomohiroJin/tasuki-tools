/**
 * 自分でルームから抜ける（T033・FR-079）
 *
 * 自分の操作なので確認は課さないが、他人向けの破壊的操作（RosterPanel の「退出させる」）
 * とは配置を分ける。誤タップで他人を巻き込む事故と、自分が抜ける操作は性質が違う。
 *
 * @requirements FR-078, FR-079, US3
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

/**
 * @requirements FR-078, FR-079, US3
 */
describe("SelfDriverToggle: ルームから抜ける", () => {
  it("ルームから抜けるボタンが出る", () => {
    render(<SelfDriverToggle {...base} onLeaveRoom={vi.fn()} />);

    expect(screen.getByRole("button", { name: "ルームから抜ける" })).toBeTruthy();
  });

  it("押すと自分が部屋から退出する（確認は課さない）", () => {
    // Given
    const onLeaveRoom = vi.fn();
    render(<SelfDriverToggle {...base} onLeaveRoom={onLeaveRoom} />);
    // When
    fireEvent.click(screen.getByRole("button", { name: "ルームから抜ける" }));
    // Then
    expect(onLeaveRoom).toHaveBeenCalledWith("p1");
  });

  it("ローテーション外でもルームから抜けられる", () => {
    // 輪の外を表すバナー側の分岐にも導線が要る。抜けられないと部屋に取り残される。
    render(<SelfDriverToggle {...base} inRotation={false} onLeaveRoom={vi.fn()} />);

    expect(screen.getByRole("button", { name: "ルームから抜ける" })).toBeTruthy();
  });

  it("ハンドラが無ければ出さない（ソロ等の非対応コンシューマ）", () => {
    render(<SelfDriverToggle {...base} />);

    expect(screen.queryByRole("button", { name: "ルームから抜ける" })).toBeNull();
  });

  it("列から外れる（rotation の出入り）とは別のボタンである", () => {
    // Given（base をそのまま使う）
    // When
    render(<SelfDriverToggle {...base} onLeaveRoom={vi.fn()} onLeave={vi.fn()} />);
    // Then
    expect(screen.getByRole("button", { name: "列から外れる" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "ルームから抜ける" })).toBeTruthy();
  });
});

/**
 * かつてここには「自ら見学に回る」（`role.set` の自己対象）と、その不変条件
 * （編集者以上が1名以上残る）による無効化のテストがあった。
 * #95 S3 で役割そのものが消え、進行から外れる導線は一時離脱／列から外れるに一本化された。
 *
 * 自己退出の無効化（`canLeaveRoom`）も、支えていた不変条件ごと消えたため落とした
 * （誰が抜けても「進行できる人がいなくなる」という状態が起こらない）。
 */

/**
 * @requirements FR-078, FR-079
 */
describe("SelfDriverToggle: ルームから抜ける導線は常に押せる", () => {
  it("かつて無効化していた条件が無くなり、いつでも押して退出できる", () => {
    // Given
    const onLeaveRoom = vi.fn();
    render(<SelfDriverToggle {...base} onLeaveRoom={onLeaveRoom} />);
    // When
    fireEvent.click(screen.getByRole("button", { name: "ルームから抜ける" }));
    // Then
    expect(screen.getByRole("button", { name: "ルームから抜ける" })).toHaveProperty("disabled", false);
    expect(onLeaveRoom).toHaveBeenCalledWith("p1");
  });
});
