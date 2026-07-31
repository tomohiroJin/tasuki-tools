/**
 * ロビーの在席状態のスクリーンリーダー対応（Issue #42）。
 *
 * 在席状態（オンライン/離席/オフライン）は色つきドット（PresenceDot・aria-hidden）のみで
 * 表現されており、スクリーンリーダー利用者には伝わらなかった。セッション画面
 * （RosterPanel.tsx）には presenceLabel() の sr-only テキストが既にあるが、
 * ロビーには無かった（docs/plans/roster-row-unification/spec.md で意図的にスコープ外と
 * された a11y の穴・同 spec.md 218行目）。
 *
 * sr-only は PresenceDot 自体には含めず、RosterPanel と同じく呼び出し元（Lobby.tsx）に
 * 置く。PresenceDot の描画（ドットの色・aria-hidden）は変更しない。
 *
 * @requirements FR-006, FR-007, FR-008
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { Lobby } from "../../src/ui/Lobby.js";
import type { Room, Participant } from "@tdd-mob/core";
import { aRoomView } from "../support/room-view.js";

function p(overrides: Partial<Participant>): Participant {
  return {
    participantId: "x", connId: "c", displayName: "X", role: "editor",
    presence: "online", hasAiKey: false, joinedAt: 1, ...overrides,
  };
}

function makeRoomWithPresences(): Room {
  return aRoomView({
    config: { members: ["Alice"], intervalMinutes: 5 },
    participants: [
      p({ participantId: "host-p", displayName: "Alice", role: "host", presence: "online" }),
      p({ participantId: "bob-p", displayName: "Bob", role: "editor", connId: "c2", presence: "idle" }),
      p({ participantId: "carol-p", displayName: "Carol", role: "viewer", connId: "c3", presence: "offline" }),
    ],
  });
}

const noop = vi.fn();

describe("ロビー: 在席状態の sr-only テキスト", () => {
  it("オンライン/離席/オフラインそれぞれの在席テキストが sr-only として存在する", () => {
    render(<Lobby room={makeRoomWithPresences()} participantId="host-p" onStartSession={noop} />);
    // presenceLabel() のテキストは3状態それぞれ1件ずつ、参加者行内に存在する。
    expect(screen.getByText("オンライン", { selector: ".sr-only" })).toBeTruthy();
    expect(screen.getByText("離席", { selector: ".sr-only" })).toBeTruthy();
    expect(screen.getByText("オフライン", { selector: ".sr-only" })).toBeTruthy();
  });

  it("参加者一覧の <ul> に新規の aria-live は付与されない（読み上げの割り込みを避ける）", () => {
    const { container } = render(
      <Lobby room={makeRoomWithPresences()} participantId="host-p" onStartSession={noop} />,
    );
    const lists = container.querySelectorAll("ul");
    for (const ul of Array.from(lists)) {
      expect(ul.getAttribute("aria-live")).toBeNull();
    }
  });
});
