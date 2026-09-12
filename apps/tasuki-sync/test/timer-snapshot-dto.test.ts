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
import { TOOL_TIMER } from "../src/application/tool-id.js";

const membership: MembershipRoom = {
  code: "mob-a1b2c3d4",
  createdAt: 500,
  participants: [
    {
      id: "p_alice",
      displayName: "アリス",
      connections: new Map([["c1", TOOL_TIMER]]),
      joinedAt: 1000,
    },
    { id: "p_bob", displayName: "ボブ", connections: new Map(), joinedAt: 1100 },
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

describe("timer の参加者一覧は在席で絞る（#95 S5a）", () => {
  /** 選択画面（ハブ）に居る人。接続はあるが、どのツールも宣言していない。 */
  const atHub = { id: "p_hub", displayName: "ハブの人", connections: new Map([["c9", null]]), joinedAt: 1200 };

  it("Given 選択画面だけに居る人 / When snapshot を組む / Then timer の一覧に出ない", () => {
    // Given（準備）: 名簿には居るが、宣言しているのはハブだけ
    const withHub: MembershipRoom = {
      ...membership,
      participants: [...membership.participants, atHub],
    };

    // When（操作）
    const room = buildTimerSnapshotRoom(withHub, timer);

    // Then: 名簿からは消えていない（在室のまま）。消えるのは timer の一覧からだけ
    expect(room.participants.map((p) => p.participantId)).not.toContain("p_hub");
    expect(withHub.participants).toHaveLength(3);
  });

  it("Given 接続を 1 本も持たない人 / When snapshot を組む / Then 一覧に残る（offline のまま）", () => {
    // Given（準備）: 回線が切れた人は「timer から離れた」のではなく「どこに居るか分からない」。
    //               S4b までと同じく offline として一覧に残す —— 消すと退出したように見える
    // When（操作）
    const room = buildTimerSnapshotRoom(membership, timer);

    // Then
    const bob = room.participants.find((p) => p.participantId === "p_bob");
    expect(bob).toBeDefined();
    expect(bob?.presence).toBe("offline");
  });

  it("Given 輪に席を持つ人が選択画面へ戻った / When snapshot を組む / Then 輪の表示名は残る", () => {
    // Given（準備）: アリスは輪に席を持ったままハブへ移る
    const movedToHub: MembershipRoom = {
      ...membership,
      participants: [
        { ...membership.participants[0]!, connections: new Map([["c1", null]]) },
        ...membership.participants.slice(1),
      ],
    };

    // When（操作）
    const room = buildTimerSnapshotRoom(movedToHub, timer);

    // Then: 一覧からは消えるが、ローテーションの状態は保たれる（R7）
    expect(room.participants.map((p) => p.participantId)).not.toContain("p_alice");
    expect(room.config.members).toContain("アリス");
  });
});

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

  // #95 S4b・裁定 1。**多接続では「接続 1 本」が wire に載せられない。**
  // 読み手は S4a 時点で製品コードに 0 件（テストの造作にだけ現れていた）。
  it("wire の参加者に connId を載せない（多接続では嘘になる）", () => {
    // Given: 名簿と timer の状態（このファイルの前提）
    // When
    const room = buildTimerSnapshotRoom(membership, timer);

    // Then
    for (const p of room.participants) {
      expect(Object.keys(p)).not.toContain("connId");
    }
  });

  // presence は接続の集まりからの導出である（D14）。**接続を 2 本持つ人も online 1 つ**で、
  // wire には本数が出ない（出す必要のある読み手が居ない）。
  it("接続を 2 本持つ人の presence は online で、本数は wire に出ない", () => {
    // Given: アリスが 2 本繋いでいる
    const twoTabs: MembershipRoom = {
      ...membership,
      participants: [
        {
          ...membership.participants[0]!,
          connections: new Map([
            ["c1", TOOL_TIMER],
            ["c2", TOOL_TIMER],
          ]),
        },
        ...membership.participants.slice(1),
      ],
    };

    // When
    const room = buildTimerSnapshotRoom(twoTabs, timer);

    // Then
    expect(room.participants[0]).toMatchObject({ participantId: "p_alice", presence: "online" });
    expect(JSON.stringify(room.participants[0])).not.toContain("c2");
  });
});
