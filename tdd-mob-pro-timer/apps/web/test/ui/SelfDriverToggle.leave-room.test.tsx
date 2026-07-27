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

// ─── 自ら見学に回る（G6・T044・FR-083/073b） ─────────────────────────────────
// 実機検証で判明: 役割を viewer にする経路がアプリ全体に存在せず、
// G5 で作った見学者向けの提示（拒否理由・進行に戻る）が一度も発動しなかった。
// 見学者へ降りる導線がなければ、見学者向けに定めた要件はすべて空文になる。

describe("SelfDriverToggle: 見学に回る", () => {
  it("開始後は「見学に回る」が出る", () => {
    render(<SelfDriverToggle {...base} started onSelfRoleChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "見学に回る" })).toBeTruthy();
  });

  it("押すと自分の役割を viewer へ変える要求が出る", () => {
    const onSelfRoleChange = vi.fn();
    render(<SelfDriverToggle {...base} started onSelfRoleChange={onSelfRoleChange} />);

    fireEvent.click(screen.getByRole("button", { name: "見学に回る" }));

    expect(onSelfRoleChange).toHaveBeenCalledWith("viewer");
  });

  it("開始前は出さない（開始前の役割変更は主催者の担当・FR-066）", () => {
    render(<SelfDriverToggle {...base} started={false} onSelfRoleChange={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "見学に回る" })).toBeNull();
  });

  it("ハンドラが無ければ出さない", () => {
    render(<SelfDriverToggle {...base} started />);

    expect(screen.queryByRole("button", { name: "見学に回る" })).toBeNull();
  });

  it("「列から外れる」（ローテーションの出入り）とは別のボタンである", () => {
    render(<SelfDriverToggle {...base} started onSelfRoleChange={vi.fn()} onLeave={vi.fn()} />);

    expect(screen.getByRole("button", { name: "列から外れる" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "見学に回る" })).toBeTruthy();
  });

  it("ローテーション外（見学バナー）でも見学に回れる", () => {
    render(<SelfDriverToggle {...base} inRotation={false} started onSelfRoleChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "見学に回る" })).toBeTruthy();
  });
});

// ─── 実行できない自己退出は提示しない（G6・T049・FR-080） ─────────────────────
// 実機検証で判明: 唯一の実在編集者が「ルームから抜ける」を押すと LAST_MANAGER で拒否される。
// 押せるボタンを出しておいて拒否するのは FR-080（実行できる操作のみ提示）に反する。
// 判定は @tdd-mob/core の canRemoveParticipant に問い、web 側に規則を複製しない。

describe("SelfDriverToggle: 退出できないときは押せない（FR-080）", () => {
  it("不変条件を破る場合は「ルームから抜ける」を無効化する", () => {
    render(<SelfDriverToggle {...base} onLeaveRoom={vi.fn()} canLeaveRoom={false} />);

    expect(screen.getByRole("button", { name: "ルームから抜ける" })).toHaveProperty("disabled", true);
  });

  it("無効なときは理由を title で伝える", () => {
    render(<SelfDriverToggle {...base} onLeaveRoom={vi.fn()} canLeaveRoom={false} />);

    expect(screen.getByRole("button", { name: "ルームから抜ける" }).getAttribute("title")).toMatch(/進行できる人/);
  });

  it("押しても onLeaveRoom は発火しない", () => {
    const onLeaveRoom = vi.fn();
    render(<SelfDriverToggle {...base} onLeaveRoom={onLeaveRoom} canLeaveRoom={false} />);

    fireEvent.click(screen.getByRole("button", { name: "ルームから抜ける" }));

    expect(onLeaveRoom).not.toHaveBeenCalled();
  });

  it("既定（未指定）では従来どおり押せる", () => {
    render(<SelfDriverToggle {...base} onLeaveRoom={vi.fn()} />);

    expect(screen.getByRole("button", { name: "ルームから抜ける" })).toHaveProperty("disabled", false);
  });
});

// ─── 見学に回れないときは押せない（レビュー指摘・FR-080 の対称性） ────────────
// 自己退出は canLeaveRoom で無効化しているのに、自己降格だけ押してから拒否されるのは
// 非対称。最後の実在編集者が見学に回ると進行できる人が居なくなるため canDemote で拒否される。

describe("SelfDriverToggle: 見学に回れないときは押せない（FR-080）", () => {
  it("不変条件を破る場合は「見学に回る」を無効化する", () => {
    render(<SelfDriverToggle {...base} started onSelfRoleChange={vi.fn()} canSpectate={false} />);

    expect(screen.getByRole("button", { name: "見学に回る" })).toHaveProperty("disabled", true);
  });

  it("無効なときは理由を title で伝える", () => {
    render(<SelfDriverToggle {...base} started onSelfRoleChange={vi.fn()} canSpectate={false} />);

    expect(screen.getByRole("button", { name: "見学に回る" }).getAttribute("title")).toMatch(/進行できる人/);
  });

  it("押しても onSelfRoleChange は発火しない", () => {
    const onSelfRoleChange = vi.fn();
    render(<SelfDriverToggle {...base} started onSelfRoleChange={onSelfRoleChange} canSpectate={false} />);

    fireEvent.click(screen.getByRole("button", { name: "見学に回る" }));

    expect(onSelfRoleChange).not.toHaveBeenCalled();
  });

  it("既定（未指定）では従来どおり押せる", () => {
    render(<SelfDriverToggle {...base} started onSelfRoleChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "見学に回る" })).toHaveProperty("disabled", false);
  });
});
