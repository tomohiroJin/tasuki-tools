/**
 * rotation（参加者IDの配列・D6b）→ 表示用ビューへの写像。
 * 同定は識別子、表示は名前という一方向の流れを守るための境界。
 */

import { describe, it, expect } from "vitest";
import { rotationMembers } from "../../src/ui/rotation-names.js";
import type { Participant } from "@tdd-mob/core";

const p = (participantId: string, displayName: string): Participant => ({
  participantId,
  connId: "c",
  displayName,
  role: "editor",
  presence: "online",
  hasAiKey: false,
  joinedAt: 1000,
});

describe("rotationMembers", () => {
  it("rotation の順序どおりに識別子と表示名を対にして返す", () => {
    const participants = [p("p2", "Bob"), p("p1", "Alice")];
    expect(rotationMembers(["p1", "p2"], participants)).toEqual([
      { participantId: "p1", displayName: "Alice" },
      { participantId: "p2", displayName: "Bob" },
    ]);
  });

  it("同名が並んでも識別子で区別できる（React の key に使えることを保証する）", () => {
    // 表示名だけの配列にすると key が衝突し、同名の行が取り違えられる。
    const members = rotationMembers(["p1", "p2"], [p("p1", "Bob"), p("p2", "Bob")]);
    expect(members.map((m) => m.displayName)).toEqual(["Bob", "Bob"]);
    expect(members.map((m) => m.participantId)).toEqual(["p1", "p2"]);
  });

  it("participants に居ない ID は表示名が空になる（枠は落とさない）", () => {
    // 枠を落とすと currentIndex や driverCounts と長さがずれるため、詰めてはいけない。
    const members = rotationMembers(["p1", "ghost"], [p("p1", "Alice")]);
    expect(members).toHaveLength(2);
    expect(members[1]).toEqual({ participantId: "ghost", displayName: "" });
  });

  it("参加者の並び順には依存しない（rotation が唯一の順序の源）", () => {
    const shuffled = [p("p3", "Carol"), p("p1", "Alice"), p("p2", "Bob")];
    expect(rotationMembers(["p2", "p3", "p1"], shuffled).map((m) => m.displayName)).toEqual([
      "Bob",
      "Carol",
      "Alice",
    ]);
  });
});
