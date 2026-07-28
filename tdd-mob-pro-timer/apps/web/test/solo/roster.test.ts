/**
 * ソロモードのロスター（参加者・ルーム）構築のテスト
 * 項目4: ソロ複数メンバーで全員分の Participant を生成し、現ドライバーの
 * ハイライト（表示名一致）と members[1..n] の改名/skip を成立させる。
 */

import { describe, it, expect } from "vitest";
import { initialAggregate } from "@tdd-mob/core";
import type { SessionConfig } from "@tdd-mob/core";
import { buildSoloRoom, soloMemberId, canAddSoloProxy } from "../../src/solo/roster.js";

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
  const agg = initialAggregate(config, config.members.map((_, i) => soloMemberId(i)));
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

  it("現ドライバーが Bob（currentIndex=1）のとき rotation[currentIndex] が Bob の participantId を指す", () => {
    const room = build(1);
    // rotation は参加者IDの配列（D6b）。RosterPanel も識別子で現ドライバーを判定する。
    expect(room.session.rotation[room.session.currentIndex]).toBe(soloMemberId(1));
    expect(room.participants.some((p) => p.participantId === soloMemberId(1))).toBe(true);
  });

  it("members[1] に安定した participantId が付き、改名しても rotation は動かない", () => {
    const id = soloMemberId(1);
    const ov = emptyOverrides();
    ov.renames[id] = "Bobby";
    const room = build(1, ov);
    const bob = room.participants.find((p) => p.participantId === id);
    expect(bob?.displayName).toBe("Bobby");
    // rotation は識別子なので改名の影響を受けない（D6b）。
    expect(room.session.rotation[1]).toBe(id);
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
    expect(room.session.rotation).toContain("px-1");
    expect(room.participants).toHaveLength(3);
    expect(room.participants[2]).toMatchObject({
      participantId: "px-1",
      displayName: "Carol",
      isPlaceholder: true,
    });
  });

  it("renames に現行メンバー以外の古いキーが残っていても現行メンバーの表示名には影響しない", () => {
    // 旧セッションの残骸（存在しない participantId への改名差分）が紛れていても、
    // buildSoloRoom は現行 config.members ＋ proxies のみを参照するので無害であることを保証する。
    const ov = emptyOverrides();
    ov.renames["solo-member-99"] = "Stale";
    ov.renames["ghost"] = "Phantom";
    const room = build(1, ov);
    expect(room.participants).toHaveLength(2);
    expect(room.participants[0]?.displayName).toBe("Alice");
    expect(room.participants[1]?.displayName).toBe("Bob");
    // rotation は識別子なので、そもそも改名差分の値が載ることはない。
    expect(room.session.rotation).toEqual([soloMemberId(0), soloMemberId(1)]);
  });
});

describe("soloMemberId（項目4）", () => {
  it("index 0 はホスト 'solo'、それ以降は index ベースの安定 ID を返す", () => {
    expect(soloMemberId(0)).toBe("solo");
    expect(soloMemberId(1)).toBe("solo-member-1");
    expect(soloMemberId(2)).toBe("solo-member-2");
  });
});

describe("canAddSoloProxy（項目5: ソロ代理追加の重複名チェック）", () => {
  it("既存メンバー名と重複する代理追加は拒否される（大文字小文字無視）", () => {
    // 既定メンバーは ["Alice", "Bob"]。大文字小文字を変えても重複とみなす（共有 decideAddProxy と同基準）
    expect(canAddSoloProxy(config.members, emptyOverrides(), "alice")).toBe(false);
    expect(canAddSoloProxy(config.members, emptyOverrides(), "BOB")).toBe(false);
  });

  it("既存の代理名と重複する代理追加は拒否される", () => {
    const ov = emptyOverrides();
    ov.proxies.push({ participantId: "px-1", displayName: "Carol" });
    expect(canAddSoloProxy(config.members, ov, "carol")).toBe(false);
  });

  it("host 改名後の名前と重複する代理追加も拒否される", () => {
    // host(Alice) を Zoe に改名 → 既存名は ["Zoe", "Bob"]。Zoe との重複を拒否し、解放された Alice は許可
    const ov = emptyOverrides();
    ov.renames["solo"] = "Zoe";
    expect(canAddSoloProxy(config.members, ov, "zoe")).toBe(false);
    expect(canAddSoloProxy(config.members, ov, "Alice")).toBe(true);
  });

  it("空名（空白のみ含む）は拒否される", () => {
    expect(canAddSoloProxy(config.members, emptyOverrides(), "")).toBe(false);
    expect(canAddSoloProxy(config.members, emptyOverrides(), "   ")).toBe(false);
  });

  it("既存名と重複しない一意な代理名は許可される", () => {
    expect(canAddSoloProxy(config.members, emptyOverrides(), "Carol")).toBe(true);
  });
});
