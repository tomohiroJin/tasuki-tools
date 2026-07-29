/**
 * 管理エンドポイント純粋ロジックのテスト
 * /status・/admin/rooms のレポート生成とルーティング
 */

import { describe, it, expect } from "vitest";
import { buildAdminReport, handleAdminHttp } from "../src/application/admin.js";
import type { Room, Participant } from "@tdd-mob/core";

/**
 * テスト用の最小 Room を構築する。
 * @param code ルームコード
 * @param online オンライン人数（presence="online"）
 * @param total 参加者総数（残りは presence="offline"）
 * @param hasDriver ドライバーローテーションを持つか（session.rotation の有無）
 */
function room(code: string, online: number, total: number, hasDriver: boolean): Room {
  const participants: Participant[] = Array.from({ length: total }, (_, i) => ({
    participantId: `${code}-p${i}`,
    connId: i < online ? `${code}-conn${i}` : null,
    displayName: `${code}-member${i}`,
    role: i === 0 ? "host" : "editor",
    presence: i < online ? "online" : "offline",
    hasAiKey: false,
    joinedAt: 1000 + i,
  }));
  return {
    code,
    createdAt: 1000,
    hostParticipantId: `${code}-p0`,
    config: {
      language: "TypeScript",
      difficulty: "easy",
      members: participants.map((p) => p.displayName),
      intervalMinutes: 5,
    },
    problem: null,
    session: {
      rotation: hasDriver ? ["A"] : [],
      currentIndex: 0,
      isPaused: false,
      driverCounts: hasDriver ? [0] : [],
      totalSwitches: 0,
    },
    clock: {
      running: false,
      intervalSeconds: 300,
      anchorServerTime: 0,
      secondsLeftAtAnchor: 300,
      accumulatedElapsedMs: 0,
      runningSince: null,
    },
    phase: "setup",
    participants,
    sessionRecords: [],
    handoffNote: "",
    onBreak: false,
  };
}

/**
 * @requirements v2.2 Phase 3a R3-2, R3-3
 */
describe("buildAdminReport", () => {
  it("アクティブルーム数・累計回収数・各ルーム要約", () => {
    // Given
    const rooms = [room("AA", 1, 2, true), room("BB", 0, 1, false)];
    const totalReclaimed = 5;

    // When
    const rep = buildAdminReport(rooms, totalReclaimed);

    // Then
    expect(rep.activeRooms).toBe(2);
    expect(rep.totalReclaimed).toBe(5);
    const aa = rep.rooms.find((r) => r.code === "AA")!;
    expect(aa.participants).toBe(2);
    expect(aa.online).toBe(1);
    expect(aa.hasDriver).toBe(true);
    expect(aa.createdAt).toBe(1000);
  });
});

describe("AI 生成カウンタ", () => {
  it("aiGeneration が渡されればレポートに含まれ、未指定なら省略される", () => {
    // Given（aiGeneration 引数の有無をそれぞれ試す）
    // When
    const withAi = buildAdminReport([], 0, { today: 3, total: 42 });
    // Then
    expect(withAi.aiGeneration).toEqual({ today: 3, total: 42 });

    // When
    const without = buildAdminReport([], 0);
    // Then
    expect(without.aiGeneration).toBeUndefined();
  });
});

/**
 * @requirements v2.2 Phase 3a R4-1
 */
describe("handleAdminHttp", () => {
  const getReport = () => buildAdminReport([room("AA", 0, 1, false)], 3);
  const deps = { adminToken: "secret", getReport };

  it("ADMIN_TOKEN 未設定なら管理ルートでも null（存在を隠す）", () => {
    expect(handleAdminHttp("GET", "/status", {}, { adminToken: undefined, getReport })).toBeNull();
  });
  it("非管理パスは null", () => {
    expect(handleAdminHttp("GET", "/ws", { "x-admin-token": "secret" }, deps)).toBeNull();
  });
  it("トークン不一致は 401", () => {
    expect(handleAdminHttp("GET", "/status", { "x-admin-token": "wrong" }, deps)?.status).toBe(401);
  });
  it("トークン無しは 401", () => {
    expect(handleAdminHttp("GET", "/admin/rooms", {}, deps)?.status).toBe(401);
  });
  it("/status は要約のみ（rooms 配列なし）", () => {
    // Given（有効なトークンで /status を対象にする）
    // When
    const r = handleAdminHttp("GET", "/status", { "x-admin-token": "secret" }, deps)!;

    // Then
    expect(r.status).toBe(200);
    const b = JSON.parse(r.body);
    expect(b.activeRooms).toBe(1);
    expect(b.totalReclaimed).toBe(3);
    expect(b.rooms).toBeUndefined();
  });
  it("/admin/rooms は rooms 配列を含む", () => {
    // Given（有効なトークンで /admin/rooms を対象にする）
    // When
    const r = handleAdminHttp("GET", "/admin/rooms", { "x-admin-token": "secret" }, deps)!;
    // Then
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body).rooms.length).toBe(1);
  });
  it("GET 以外は null", () => {
    expect(handleAdminHttp("POST", "/status", { "x-admin-token": "secret" }, deps)).toBeNull();
  });
  it("クエリ文字列付きでも /status と認識", () => {
    expect(handleAdminHttp("GET", "/status?x=1", { "x-admin-token": "secret" }, deps)?.status).toBe(200);
  });
  it("/status レスポンスに aiGeneration が含まれる（report にあるとき）", () => {
    // Given
    const getReportWithAi = () =>
      buildAdminReport([room("AA", 0, 1, false)], 3, { today: 5, total: 12 });

    // When
    const r = handleAdminHttp("GET", "/status", { "x-admin-token": "secret" }, {
      adminToken: "secret",
      getReport: getReportWithAi,
    })!;

    // Then
    expect(r.status).toBe(200);
    const b = JSON.parse(r.body);
    expect(b.aiGeneration).toEqual({ today: 5, total: 12 });
    expect(b.rooms).toBeUndefined();
  });
});
