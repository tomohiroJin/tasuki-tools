/**
 * 管理エンドポイント純粋ロジックのテスト
 * /status・/admin/rooms のレポート生成とルーティング
 */

import { describe, it, expect } from "bun:test";
import { buildAdminReport, handleAdminHttp } from "../src/application/admin.js";
import type { Room as MembershipRoom, Participant as MembershipParticipant } from "@tasuki/room-core";
import type { TimerState } from "@tasuki/timer-core";

/**
 * テスト用の最小の名簿ルーム（`@tasuki/room-core` の `Room`）を構築する。
 * @param code ルームコード
 * @param online オンライン人数（presence="online"）
 * @param total 参加者総数（残りは presence="offline"）
 */
function membershipRoom(code: string, online: number, total: number): MembershipRoom {
  const participants: MembershipParticipant[] = Array.from({ length: total }, (_, i) => ({
    id: `${code}-p${i}`,
    connId: i < online ? `${code}-conn${i}` : null,
    displayName: `${code}-member${i}`,
    presence: i < online ? "online" : "offline",
    joinedAt: 1000 + i,
  }));
  return { code, createdAt: 1000, participants };
}

/** テスト用の最小 TimerState を構築する（hasDriver は session.rotation の有無）。 */
function timerState(code: string, hasDriver: boolean): TimerState {
  return {
    code,
    createdAt: 1000,
    config: {
      language: "TypeScript",
      difficulty: "easy",
      intervalMinutes: 5,
    },
    problem: null,
    session: {
      rotation: hasDriver ? [{ kind: "member", participantId: `${code}-p0`, eligible: true }] : [],
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
    sessionRecords: [],
    handoffNote: "",
    onBreak: false,
    aiKeyHolders: [],
  };
}

/** `code → TimerState` の Map を組み立てる（timer 状態を持たないルームは含めない）。 */
function timerStates(...states: TimerState[]): Map<string, TimerState> {
  return new Map(states.map((s) => [s.code, s]));
}

/**
 * @requirements v2.2 Phase 3a R3-2, R3-3 / #95 S4a（名簿と timer 状態の合成）
 */
describe("buildAdminReport", () => {
  it("アクティブルーム数・累計回収数・各ルーム要約", () => {
    // Given
    const rooms = [membershipRoom("AA", 1, 2), membershipRoom("BB", 0, 1)];
    const timers = timerStates(timerState("AA", true), timerState("BB", false));
    const totalReclaimed = 5;

    // When
    const rep = buildAdminReport(rooms, timers, totalReclaimed);

    // Then
    expect(rep.activeRooms).toBe(2);
    expect(rep.totalReclaimed).toBe(5);
    const aa = rep.rooms.find((r) => r.code === "AA")!;
    expect(aa.participants).toBe(2);
    expect(aa.online).toBe(1);
    expect(aa.hasDriver).toBe(true);
    expect(aa.createdAt).toBe(1000);
  });

  it("poker のルームも数える（S2 の申し送りの解消）", () => {
    // Given: 名簿に timer 由来 1 件・poker 由来（timer 状態を持たない）1 件
    const rooms = [membershipRoom("TT", 1, 1), membershipRoom("PK", 1, 1)];
    const timers = timerStates(timerState("TT", true));

    // When
    const rep = buildAdminReport(rooms, timers, 0);

    // Then
    expect(rep.activeRooms).toBe(2);
    expect(rep.rooms.map((r) => r.code).sort()).toEqual(["PK", "TT"]);
  });

  it("timer 状態が無いルームは hasDriver=false で出る（participants/online は名簿から出る）", () => {
    // Given: poker だけのルーム（timer 状態なし）
    const rooms = [membershipRoom("PK", 1, 2)];
    const timers = timerStates(); // 空

    // When
    const rep = buildAdminReport(rooms, timers, 0);

    // Then
    const pk = rep.rooms.find((r) => r.code === "PK")!;
    expect(pk.hasDriver).toBe(false);
    expect(pk.participants).toBe(2);
    expect(pk.online).toBe(1);
    expect(pk.createdAt).toBe(1000);
  });

  it("activeRooms は名簿の件数と一致する（poker だけのルームが枠を食っていることが分かる）", () => {
    // Given: 名簿に poker だけのルームが 1 件（timer 状態は無い）
    const rooms = [membershipRoom("PK", 0, 1)];
    const timers = timerStates();

    // When
    const rep = buildAdminReport(rooms, timers, 0);

    // Then
    expect(rep.activeRooms).toBe(rooms.length);
    expect(rep.activeRooms).toBe(1);
  });
});

describe("AI 生成カウンタ", () => {
  it("aiGeneration が渡されればレポートに含まれ、未指定なら省略される", () => {
    // Given（aiGeneration 引数の有無をそれぞれ試す）
    // When
    const withAi = buildAdminReport([], timerStates(), 0, { today: 3, total: 42 });
    // Then
    expect(withAi.aiGeneration).toEqual({ today: 3, total: 42 });

    // When
    const without = buildAdminReport([], timerStates(), 0);
    // Then
    expect(without.aiGeneration).toBeUndefined();
  });
});

/**
 * @requirements v2.2 Phase 3a R4-1
 */
describe("handleAdminHttp", () => {
  const getReport = () => buildAdminReport([membershipRoom("AA", 0, 1)], timerStates(), 3);
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
      buildAdminReport([membershipRoom("AA", 0, 1)], timerStates(), 3, { today: 5, total: 12 });

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
