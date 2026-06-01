/**
 * ソロモードのロスター（参加者・ルーム）構築のテスト
 * 項目4: ソロ複数メンバーで全員分の Participant を生成し、現ドライバーの
 * ハイライト（表示名一致）と members[1..n] の改名/skip を成立させる。
 */

import { describe, it, expect } from "vitest";
import { initialAggregate } from "@tdd-mob/core";
import type { SessionConfig } from "@tdd-mob/core";
import { buildSoloRoom, soloMemberId } from "../../src/solo/roster.js";

const config: SessionConfig = {
  language: "TypeScript",
  difficulty: "easy",
  members: ["Alice", "Bob"],
  intervalMinutes: 5,
};

/** 空のロスター差分（renames/skips/proxies） */
const emptyOverrides = () => ({
  renames: {} as Record<string, string>,
  skips: new Set<string>(),
  proxies: [] as { participantId: string; displayName: string }[],
});

/** テスト用に currentIndex と差分を指定して soloRoom を組み立てる */
function build(currentIndex = 0, overrides = emptyOverrides()) {
  const agg = initialAggregate(config);
  return buildSoloRoom({
    config,
    engineSession: { ...agg.session, currentIndex },
    clock: agg.clock,
    createdAt: 0,
    overrides,
    problem: null,
  });
}

describe("buildSoloRoom（項目4）", () => {
  it("config.members 全員分の Participant を生成する（members[0]=host, 残りは editor）", () => {
    const room = build();
    expect(room.participants).toHaveLength(2);
    expect(room.participants[0]).toMatchObject({
      participantId: "solo",
      displayName: "Alice",
      role: "host",
    });
    expect(room.participants[1]).toMatchObject({
      participantId: soloMemberId(1),
      displayName: "Bob",
      role: "editor",
    });
  });

  it("現ドライバーが Bob（currentIndex=1）のとき rotation[currentIndex] が Bob と一致し、同名の Participant が存在する", () => {
    const room = build(1);
    expect(room.session.rotation[room.session.currentIndex]).toBe("Bob");
    // RosterPanel は表示名で現ドライバーを判定するため、participant の displayName と一致が必須
    expect(room.participants.some((p) => p.displayName === "Bob")).toBe(true);
  });

  it("members[1] に安定した participantId が付き、改名差分が表示名と rotation に反映される", () => {
    const id = soloMemberId(1);
    const ov = emptyOverrides();
    ov.renames[id] = "Bobby";
    const room = build(1, ov);
    const bob = room.participants.find((p) => p.participantId === id);
    expect(bob?.displayName).toBe("Bobby");
    expect(room.session.rotation[1]).toBe("Bobby");
  });

  it("members[1] を skip すると driverEligible=false になる", () => {
    const id = soloMemberId(1);
    const ov = emptyOverrides();
    ov.skips.add(id);
    const room = build(0, ov);
    const bob = room.participants.find((p) => p.participantId === id);
    expect(bob?.driverEligible).toBe(false);
    // host は対象のまま
    expect(room.participants.find((p) => p.participantId === "solo")?.driverEligible).toBe(true);
  });

  it("代理追加後も不変条件 rotation.length === driverCounts.length を保つ", () => {
    const ov = emptyOverrides();
    ov.proxies.push({ participantId: "px-1", displayName: "Carol" });
    const room = build(0, ov);
    expect(room.session.rotation.length).toBe(room.session.driverCounts.length);
    expect(room.session.rotation).toContain("Carol");
    expect(room.participants).toHaveLength(3);
    expect(room.participants[2]).toMatchObject({
      participantId: "px-1",
      displayName: "Carol",
      isPlaceholder: true,
    });
  });
});

describe("soloMemberId（項目4）", () => {
  it("index 0 はホスト 'solo'、それ以降は index ベースの安定 ID を返す", () => {
    expect(soloMemberId(0)).toBe("solo");
    expect(soloMemberId(1)).toBe("solo-member-1");
    expect(soloMemberId(2)).toBe("solo-member-2");
  });
});
