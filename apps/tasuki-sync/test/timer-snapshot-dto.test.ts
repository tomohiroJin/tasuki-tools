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
import { TOOL_HUB } from "../src/application/hub-handlers.js";

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

    // Then: 一覧からは消えるが、ローテーションの状態は保たれる（R7）。
    // 残ることを見るのは**席の表示名**である（#294 で `config.members` が落ちた）。
    expect(room.participants.map((p) => p.participantId)).not.toContain("p_alice");
    expect(room.session.seats.map((s) => s.displayName)).toContain("アリス");
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

  it("席はローテーション順の表示名として解決される", () => {
    const room = buildTimerSnapshotRoom(membership, timer);
    expect(room.session.seats.map((s) => s.displayName)).toEqual(["アリス", "同席のカルロス"]);
  });

  it("wire の config は保管している設定そのもので、表示名を持たない", () => {
    // Given: 名簿と timer の状態（表示名は名簿の側にだけある）
    // When: snapshot を組む
    const room = buildTimerSnapshotRoom(membership, timer);
    // Then: 合成で足す項目はもう無い（名簿由来の値が config へ混ざらない）
    expect(room.config).toEqual(timer.config);
    expect("members" in room.config).toBe(false);
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

describe("seats の skipReason（#276 D3 / D4）", () => {
  /** 名簿と timer を組み、seats を返す。 */
  function seatsOf(args: {
    connections: Map<string, string | null>; // アリスの接続（ツール名は TOOL_TIMER / TOOL_HUB）
    eligible?: boolean; // アリスの席の eligible
  }) {
    const m: MembershipRoom = {
      ...membership,
      participants: [{ ...membership.participants[0]!, connections: args.connections }],
    };
    const t: TimerState = {
      ...timer,
      session: {
        ...timer.session,
        rotation: [
          { kind: "member", participantId: "p_alice", eligible: args.eligible ?? true },
        ],
        driverCounts: [0],
      },
    };
    return buildTimerSnapshotRoom(m, t).session.seats;
  }

  it("timer に在席していれば番が回る", () => {
    expect(seatsOf({ connections: new Map([["c1", TOOL_TIMER]]) })[0]!.skipReason).toBe(null);
  });

  it("接続が 1 本も無ければ disconnected", () => {
    expect(seatsOf({ connections: new Map() })[0]!.skipReason).toBe("disconnected");
  });

  it("接続はあるが timer に居なければ away", () => {
    expect(seatsOf({ connections: new Map([["c1", TOOL_HUB]]) })[0]!.skipReason).toBe("away");
  });

  it("一時離脱は在席より優先される（D3）", () => {
    // timer に在席していても、本人が一時離脱していれば stood-down と言う。
    expect(
      seatsOf({ connections: new Map([["c1", TOOL_TIMER]]), eligible: false })[0]!.skipReason,
    ).toBe("stood-down");
  });

  it("切断していても一時離脱が優先される（D3）", () => {
    expect(seatsOf({ connections: new Map(), eligible: false })[0]!.skipReason).toBe("stood-down");
  });

  it("代理は在席の概念を持たないので番が回る（D4）", () => {
    const seats = buildTimerSnapshotRoom(membership, timer).session.seats;
    const proxy = seats.find((s) => s.isProxy);
    expect(proxy?.skipReason).toBe(null);
  });
});

describe("nextIndex の境界（#276 D6 追補・最終レビュー指摘）", () => {
  /**
   * p_alice（現ドライバー・添字 0）と p_bob（添字 1）の 2 席の輪を組み、
   * `nextIndex` を返す。
   *
   * **判定力を持たせるため、正しい実装と素朴な `(currentIndex + 1) % len` の
   * どちらでも同じ値になる組み合わせは避けている**（この 3 件のいずれも、
   * 素朴な計算では異なる値を返すか、素朴な計算では区別できない「次は現ドライバー」を
   * 区別できていない）。
   */
  function nextIndexOf(args: { aliceEligible?: boolean; bobEligible?: boolean }) {
    const m: MembershipRoom = {
      ...membership,
      participants: [
        membership.participants[0]!, // p_alice: timer に在席
        { ...membership.participants[1]!, connections: new Map([["c2", TOOL_TIMER]]) }, // p_bob: timer に在席
      ],
    };
    const t: TimerState = {
      ...timer,
      session: {
        ...timer.session,
        rotation: [
          { kind: "member", participantId: "p_alice", eligible: args.aliceEligible ?? true },
          { kind: "member", participantId: "p_bob", eligible: args.bobEligible ?? true },
        ],
        currentIndex: 0,
        driverCounts: [0, 0],
      },
    };
    return buildTimerSnapshotRoom(m, t).session.nextIndex;
  }

  it("全席が不適格なら null", () => {
    expect(nextIndexOf({ aliceEligible: false, bobEligible: false })).toBeNull();
  });

  it("適格が現ドライバーの席だけ（席は2つ以上）なら null（今回直した境界）", () => {
    // ボブが一時離脱（stood-down）で、適格なのはアリス（現ドライバー・添字 0）だけになる。
    // 素朴な実装（(currentIndex + 1) % len）はここで 1 を返すため、この境界を検出する。
    expect(nextIndexOf({ bobEligible: false })).toBeNull();
  });

  it("適格な他の席があれば、その添字を返す（通常系）", () => {
    expect(nextIndexOf({})).toBe(1);
  });
});
