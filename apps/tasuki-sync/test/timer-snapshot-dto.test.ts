/**
 * timer のスナップショット DTO（wire の同形性）。
 *
 * **この 1 本が「wire を変えていない」ことの錨である**（#95 S4a）。名簿（room-core）と
 * timer の状態（timer-core）を合成して組んだ `snapshot.room` が、S4a 以前と同じ形
 * （`RoomSchema`）であることを固定する。ここが緑であることと、`apps/timer-web` の
 * テストを 1 行も書き換えずに通せることが、振る舞いを変えていない証拠になる。
 */

import { describe, expect, it } from "bun:test";
import * as v from "valibot";
// RoomSchema は公開契約に載せない（取り込むのがテストだけのため。#220）。
// `error-code-coverage.test.ts` と同じくサブパスから取る。
import { RoomSchema } from "@tasuki/timer-core/schemas";
import type { Room as MembershipRoom } from "@tasuki/room-core";
import { buildTimerSnapshotRoom } from "../src/application/timer-snapshot-dto";
import type { TimerState } from "@tasuki/timer-core";

const membership: MembershipRoom = {
  code: "mob-a1b2c3d4",
  createdAt: 500,
  participants: [
    { id: "p_alice", displayName: "アリス", connId: "c1", presence: "online", joinedAt: 1000 },
    { id: "p_bob", displayName: "ボブ", connId: null, presence: "offline", joinedAt: 1100 },
  ],
};

const timer: TimerState = {
  code: "mob-a1b2c3d4",
  createdAt: 500,
  config: { language: "TypeScript", difficulty: "easy", intervalMinutes: 5 },
  problem: null,
  session: {
    rotation: [
      { kind: "member", participantId: "p_alice", eligible: true },
      { kind: "proxy", id: "p_proxy1", label: "同席のカルロス", eligible: true },
    ],
    currentIndex: 0,
    isPaused: false,
    driverCounts: [0, 0],
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

describe("timer のスナップショット DTO（wire の同形性）", () => {
  it("組み立てた room が RoomSchema を通る", () => {
    const room = buildTimerSnapshotRoom(membership, timer);
    expect(v.safeParse(RoomSchema, room).success).toBe(true);
  });

  it("名簿の参加者が wire の participants に写る", () => {
    // Given: 名簿に 2 人、ローテーションに 1 人と代理 1 席
    // When
    const room = buildTimerSnapshotRoom(membership, timer);
    // Then
    expect(room.participants.map((p) => p.participantId)).toEqual(["p_alice", "p_bob", "p_proxy1"]);
    expect(room.participants[0]).toMatchObject({ displayName: "アリス", presence: "online", hasAiKey: false });
  });

  it("代理はローテーションから合成され、isPlaceholder が立つ", () => {
    // Given: 代理は名簿に居らず、輪の上の席としてだけ存在する
    // When
    const room = buildTimerSnapshotRoom(membership, timer);
    // Then
    const proxy = room.participants.find((p) => p.participantId === "p_proxy1");
    expect(proxy).toMatchObject({
      displayName: "同席のカルロス",
      isPlaceholder: true,
      presence: "offline",
      connId: null,
      driverEligible: true,
    });
  });

  it("rotation は参加者 ID の配列として出る（代理は自分の ID）", () => {
    const room = buildTimerSnapshotRoom(membership, timer);
    expect(room.session.rotation).toEqual(["p_alice", "p_proxy1"]);
  });

  it("config.members はローテーションの表示名として解決される", () => {
    const room = buildTimerSnapshotRoom(membership, timer);
    expect(room.config.members).toEqual(["アリス", "同席のカルロス"]);
  });

  it("見送り中のエントリは driverEligible=false として出る", () => {
    // Given: アリスの席が見送り中（eligible=false）
    const skipped: TimerState = {
      ...timer,
      session: {
        ...timer.session,
        rotation: [{ kind: "member", participantId: "p_alice", eligible: false }],
        driverCounts: [0],
      },
    };
    // When
    const room = buildTimerSnapshotRoom(membership, skipped);
    // Then
    const alice = room.participants.find((p) => p.participantId === "p_alice");
    expect(alice?.driverEligible).toBe(false);
  });

  it("AI 鍵の持ち主は hasAiKey=true として出る", () => {
    const room = buildTimerSnapshotRoom(membership, { ...timer, aiKeyHolders: ["p_bob"] });
    expect(room.participants.find((p) => p.participantId === "p_bob")?.hasAiKey).toBe(true);
  });
});
