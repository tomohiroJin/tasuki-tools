/**
 * 席（サーバーが組む交代の輪の1枠・#276 D2）→ 表示用ビューへの写像。
 * 同定は識別子、表示は名前という一方向の流れを守るための境界。
 */

import { describe, it, expect } from "vitest";
import { rotationMembers } from "../../src/ui/rotation-names.js";
import type { Seat, SeatSkipReason } from "@tasuki/timer-core";
import type { LabelParticipant } from "../../src/ui/participant-label.js";

const seat = (id: string, displayName: string, skipReason: SeatSkipReason | null = null): Seat => ({
  id,
  displayName,
  isProxy: false,
  skipReason,
});

const p = (participantId: string, displayName: string): LabelParticipant => ({
  participantId,
  displayName,
});

describe("rotationMembers", () => {
  it("seats の順序どおりに識別子と表示名を対にして返す", () => {
    // Given
    const seats = [seat("p1", "Alice"), seat("p2", "Bob")];
    // When / Then
    expect(rotationMembers(seats, [])).toEqual([
      { participantId: "p1", displayName: "Alice", label: "Alice", skipReason: null },
      { participantId: "p2", displayName: "Bob", label: "Bob", skipReason: null },
    ]);
  });

  it("代理（isProxy）でも表示名と呼び名を組む", () => {
    // Given
    const proxy = { id: "proxy-1", displayName: "モブ太郎", isProxy: true, skipReason: null } satisfies Seat;
    // When / Then
    expect(rotationMembers([proxy], [])).toEqual([
      { participantId: "proxy-1", displayName: "モブ太郎", label: "モブ太郎", skipReason: null },
    ]);
  });
});

describe("呼び名（#276 D9）", () => {
  it("離席者どうしが同名なら、どちらにも識別子が付く", () => {
    const members = rotationMembers(
      [seat("a-1111", "Bob", "away"), seat("b-2222", "Bob", "away")],
      [],
    );
    expect(members[0]!.label).toBe("Bob（ID: 1111）");
    expect(members[1]!.label).toBe("Bob（ID: 2222）");
  });

  it("片方だけ在席でも、どちらにも識別子が付く", () => {
    const members = rotationMembers(
      [seat("a-1111", "Bob"), seat("b-2222", "Bob", "away")],
      [p("a-1111", "Bob")],
    );
    expect(members[0]!.label).toBe("Bob（ID: 1111）");
    expect(members[1]!.label).toBe("Bob（ID: 2222）");
  });

  it("輪の外の見学者と同名でも識別子が付く（退行防止・§3.4）", () => {
    // 見学者は seats に居ない。participants を見ないと取りこぼす。
    const members = rotationMembers(
      [seat("a-1111", "Bob")],
      [p("a-1111", "Bob"), p("z-9999", "Bob")],
    );
    expect(members[0]!.label).toBe("Bob（ID: 1111）");
  });

  it("同名が居なければ識別子を付けない", () => {
    const members = rotationMembers([seat("a-1111", "アリス")], []);
    expect(members[0]!.label).toBe("アリス");
  });

  it("理由をそのまま持つ", () => {
    const members = rotationMembers([seat("a-1111", "Bob", "disconnected")], []);
    expect(members[0]!.skipReason).toBe("disconnected");
  });
});
