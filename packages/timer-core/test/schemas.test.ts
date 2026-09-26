/**
 * CommandSchema の境界バリデーションのテスト
 */

import { describe, it, expect } from "vitest";
import * as v from "valibot";
import { CommandSchema, ServerMsgSchema } from "../src/index.js";
// RoomSchema は公開契約に載せない（取り込むのがテストだけのため。#220）。
import { RoomSchema } from "../src/schemas.js";

/**
 * 必須項目だけの最小 Room オブジェクト。
 *
 * 参加者スキーマは単体で公開していない（#220・SC-039③）ため、参加者の形を見る検査も
 * この Room を通して行う。
 */
function baseRoom(): Record<string, unknown> {
  return {
    code: "ROOM-1",
    createdAt: 0,
    config: {
      // `members` は #294 で落とした項目。旧サーバーの形として残してある（下の #294 の describe）
      members: ["A", "B", "C"],
      intervalMinutes: 5,
    },
    session: {
      rotation: ["A", "B", "C"],
      currentIndex: 0,
      isPaused: false,
      driverCounts: [0, 0, 0],
      totalSwitches: 0,
      // #276 D7: seats は rotation と同じ順・同じ長さ（この Room の主題は
      // seats/nextIndex 自体ではないため、輪と揃った最小値を置く）。
      seats: [
        { id: "A", displayName: "A", isProxy: false, skipReason: null },
        { id: "B", displayName: "B", isProxy: false, skipReason: null },
        { id: "C", displayName: "C", isProxy: false, skipReason: null },
      ],
      nextIndex: 1,
    },
    clock: {
      running: false,
      intervalSeconds: 300,
      anchorServerTime: 0,
      secondsLeftAtAnchor: 300,
      accumulatedElapsedMs: 0,
      runningSince: null,
    },
    phase: "ready",
    participants: [
      {
        participantId: "p1",
        displayName: "A",
        presence: "online",
        joinedAt: 1,
      },
    ],
    sessionRecords: [],
    handoffNote: "",
    onBreak: false,
  };
}

/**
 * 役割とホストの廃止（#95 S3）で落とした wire 契約の残骸が復活していないことを固定する。
 *
 * @requirements #95
 */
describe("役割とホストの廃止", () => {
  it("役割とホストのコマンドは受理しない", () => {
    // Given（廃止したコマンドの入力）
    const roleSet = { command: "role.set", participantId: "p1", role: "viewer" };
    const hostTransfer = { command: "host.transfer", participantId: "p1" };
    // When（variant のどの枝にも当たらないので境界で落ちるはず）
    const roleSetResult = v.safeParse(CommandSchema, roleSet);
    const hostTransferResult = v.safeParse(CommandSchema, hostTransfer);
    // Then
    expect(roleSetResult.success).toBe(false);
    expect(hostTransferResult.success).toBe(false);
  });

  // #95 S4b で wire から `connId` を落とした（多接続では「接続 1 本」が嘘になる）。
  // `role` と同じ形で、**古い snapshot が今でもパースできること**を固定する ——
  // 参加者スキーマは `v.object`（余剰キーを黙って捨てる）なので、
  // 「拒否する」ではなく「通り、キーが残らない」が正しい期待である。
  it("connId を含む旧形式の snapshot はパースでき、そのキーは残らない", () => {
    // Given（S4a まで wire に載っていた connId を持つ参加者）
    const room = baseRoom();
    const withConnId = (room["participants"] as Array<Record<string, unknown>>).map((p) => ({
      ...p,
      connId: "c1",
    }));

    // When
    const parsed = v.safeParse(RoomSchema, { ...room, participants: withConnId });

    // Then
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(Object.keys(parsed.output.participants[0]!)).not.toContain("connId");
    }
  });

  it("参加者のスキーマは role を持たない", () => {
    // Given（role を持つ旧形式の参加者を含む room。参加者の形は snapshot が運ぶ
    // RoomSchema.participants 経由でしか外から観測しないので、検査もそこを通す）
    const room = baseRoom();
    const withRole = (room["participants"] as Array<Record<string, unknown>>).map((p) => ({
      ...p,
      role: "host",
    }));
    // When（参加者スキーマは v.object（余剰キーを黙って捨てる）であり strictObject ではない。
    // そのため「role を含む値を拒否する」という否定形は空振りする（未知キーは
    // 静かに落とされるだけで success は変わらない）。ここでは「role を含む値を
    // パースした結果に role キーが残らないこと」という肯定形で固定する）。
    const parsed = v.safeParse(RoomSchema, { ...room, participants: withRole });
    const parsedWithoutRole = v.safeParse(RoomSchema, room);
    // Then
    expect(parsed.success).toBe(true);
    expect(parsed.success && "role" in parsed.output.participants[0]!).toBe(false);
    expect(parsedWithoutRole.success).toBe(true);
  });
});

/**
 * timer のお題を撤去した（#91 PR 3・spec §5.2 / §6）。
 *
 * お題はルームの共有資産（`@tasuki/topic-core`）になり、timer の wire から落ちた。
 * ここで守るのは、**配布中の窓で古い相手が送ってくる形**を境界がどう扱うかである ——
 *
 * - 窓 2（新しい画面 × 旧いサーバー）: お題を載せた旧い snapshot も通り、お題は出力に残らない
 * - 窓 3（古い画面 × 新しいサーバー）: 古い画面のお題の設定は出力から落ち、
 *   お題のコマンドは境界で拒む（サーバーの応答の実測は `apps/tasuki-sync/test/live-ws.room-ops.test.ts`）
 *
 * @requirements #91
 */
describe("timer のお題を撤去した", () => {
  it("お題を載せた旧いサーバーの snapshot も通り、お題は出力に残らない", () => {
    // Given: 旧いサーバーが送っていた形（お題の 4 項目と、設定の言語・難易度）
    const room = baseRoom();
    const legacy = {
      ...room,
      config: { ...(room["config"] as Record<string, unknown>), language: "TypeScript", difficulty: "easy" },
      problem: null,
      problemMode: "fallback",
      aiUnlocked: false,
      problemGeneration: { active: false, degraded: false },
    };
    // When
    const parsed = v.safeParse(RoomSchema, legacy);
    // Then
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      for (const key of ["problem", "problemMode", "aiUnlocked", "problemGeneration"]) {
        expect(key in parsed.output, key).toBe(false);
      }
      expect("language" in parsed.output.config).toBe(false);
      expect("difficulty" in parsed.output.config).toBe(false);
    }
  });

  it("古い画面が config.set に言語・難易度を載せても受理し、その 2 つは出力に残らない", () => {
    // Given: 古い画面の形（かつて上限を超えると拒んでいた長さも含める。もう境界の関心ではない）
    const command = {
      command: "config.set",
      config: { intervalMinutes: 5, language: "x".repeat(100_000), difficulty: "easy" },
    };
    // When
    const parsed = v.safeParse(CommandSchema, command);
    // Then
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.output.command === "config.set") {
      expect(parsed.output.config).toEqual({ intervalMinutes: 5 });
    }
  });

  it("お題のコマンドは境界で拒む", () => {
    // Given: 古い timer が送っていたお題のコマンド
    const legacyCommands = [
      { command: "problem.request", requestId: "r1" },
      {
        command: "problem.submit",
        requestId: "r1",
        problem: { title: "t", description: "d", requirements: [], exampleTest: "e", hints: [] },
        usedFallback: true,
      },
      { command: "problem.edit", patch: { title: "t" } },
      { command: "problem.mode.set", mode: "ai" },
      { command: "ai.unlock", key: "k" },
    ];
    // When
    const accepted = legacyCommands.filter((c) => v.safeParse(CommandSchema, c).success);
    // Then
    expect(accepted).toEqual([]);
  });
});

describe("RoomSchema の後方互換（未知の項目を落とさず受ける）", () => {
  // かつてここには `startedAt` の 3 本（省略／null／数値）があった。#95 S4a で
  // 書き手も読み手も無くなり項目ごと落としたため、3 本のうち「省略できる」は
  // 項目が無い以上つねに真、「null」「数値」は**もう契約に無い値**を見ていた。
  //
  // **落ちた性質は 1 つだけ拾い直す** —— 「その項目を載せた古い snapshot が今も通る」。
  // これは `v.object` が非 strict であることに依存しており、strict 化すると赤くなる
  // （＝古いクライアント／古い記録を壊す変更が検出できる）。
  it("契約から外れた項目（旧 startedAt）が載っていてもパースできる", () => {
    // Given: S4a 以前のサーバーが送っていた形
    const legacy = { ...baseRoom(), startedAt: 1234567890 };
    // When
    const result = v.safeParse(RoomSchema, legacy);
    // Then
    expect(result.success).toBe(true);
  });
});

// ─── signal: "notice"（Issue #22 G4・FR-077） ─────────────────────────────────
// 破壊的操作の実行者を全員に伝えるためのシグナル。サーバーは「意味」だけを運び、
// 日本語の文言化は UI 側が行う（plan.md「API / インターフェース契約」1）。

/**
 * @requirements FR-077
 */
describe("ServerMsgSchema signal: notice（実行者の通知）", () => {
  /** 妥当な notice メッセージの雛形。各テストで一部だけを差し替える。 */
  const base = {
    type: "signal",
    signal: "notice",
    action: "session-aborted",
    actorName: "Alice",
    actorParticipantId: "pid-1",
  };

  it("4つの action すべてが受理される", () => {
    // Given（対象は下記4種の action）
    // When / Then
    for (const action of [
      "participant-removed",
      "session-aborted",
      "session-reset",
      "session-completed",
    ]) {
      const result = v.safeParse(ServerMsgSchema, { ...base, action });
      expect(result.success, `action=${action}`).toBe(true);
    }
  });

  it("規定外の action は failure", () => {
    const result = v.safeParse(ServerMsgSchema, { ...base, action: "session-paused" });
    expect(result.success).toBe(false);
  });

  it("actorName が欠けていると failure（誰が実行したか分からない通知は無意味）", () => {
    // Given
    const { actorName: _omitted, ...withoutActorName } = base;
    // When
    const result = v.safeParse(ServerMsgSchema, withoutActorName);
    // Then
    expect(result.success).toBe(false);
  });

  it("actorParticipantId が欠けていると failure（同名参加者を区別できない）", () => {
    // Given
    const { actorParticipantId: _omitted, ...withoutActorId } = base;
    // When
    const result = v.safeParse(ServerMsgSchema, withoutActorId);
    // Then
    expect(result.success).toBe(false);
  });

  it("target 系は任意（participant-removed 以外では省略される）", () => {
    const result = v.safeParse(ServerMsgSchema, base);
    expect(result.success).toBe(true);
  });

  it("participant-removed では target 系を伴って受理される", () => {
    // Given
    const message = {
      ...base,
      action: "participant-removed",
      targetName: "Bob",
      targetParticipantId: "pid-2",
    };
    // When
    const result = v.safeParse(ServerMsgSchema, message);
    // Then
    expect(result.success).toBe(true);
  });

  it("既存の signal（switch）は引き続き受理される（variant への追加で壊さない）", () => {
    // Given
    const message = {
      type: "signal",
      signal: "switch",
      nextDriverName: "Bob",
    };
    // When
    const result = v.safeParse(ServerMsgSchema, message);
    // Then
    expect(result.success).toBe(true);
  });
});

// ─── RoomSchema の seats / nextIndex（#276 D7） ────────────────────────────

/** 最小の妥当な wire ルーム。seats / nextIndex を持つ。 */
function validRoom() {
  return {
    code: "mob-a1b2c3d4",
    createdAt: 0,
    config: { intervalMinutes: 5 },
    session: {
      rotation: ["p_alice"],
      currentIndex: 0,
      isPaused: false,
      driverCounts: [0],
      totalSwitches: 0,
      seats: [{ id: "p_alice", displayName: "アリス", isProxy: false, skipReason: null }],
      // 型推論だけだと number に固定され、後段の「null を取れる」テストが代入できない
      // （型検査が拾う。テストの造作なので product 側の型は変えない）。
      nextIndex: 0 as number | null,
    },
    clock: {
      running: false,
      intervalSeconds: 300,
      anchorServerTime: 0,
      secondsLeftAtAnchor: 300,
      accumulatedElapsedMs: 0,
      runningSince: null,
    },
    phase: "ready",
    participants: [],
    sessionRecords: [],
    handoffNote: "",
    onBreak: false,
  };
}

describe("RoomSchema の seats / nextIndex（#276 D7）", () => {
  it("揃っていれば通る（対照実行）", () => {
    expect(v.safeParse(RoomSchema, validRoom()).success).toBe(true);
  });

  it("seats が欠けたら落ちる", () => {
    const room = validRoom();
    delete (room.session as Record<string, unknown>).seats;
    expect(v.safeParse(RoomSchema, room).success).toBe(false);
  });

  it("nextIndex が欠けたら落ちる", () => {
    const room = validRoom();
    delete (room.session as Record<string, unknown>).nextIndex;
    expect(v.safeParse(RoomSchema, room).success).toBe(false);
  });

  it("nextIndex は null を取れる（全席が不適格・D6）", () => {
    const room = validRoom();
    room.session.nextIndex = null;
    expect(v.safeParse(RoomSchema, room).success).toBe(true);
  });

  it("skipReason は 3 語と null だけを受ける", () => {
    const room = validRoom();
    room.session.seats[0]!.skipReason = "見送り" as never;
    expect(v.safeParse(RoomSchema, room).success).toBe(false);
  });

  // #276 D2: displayName は nonEmptyString ではなく v.string()。名簿から引けない
  // 席は空文字になりうる（設計 §3.3 の縮退）ため、ここで弾くと**名前が引けない席が
  // あるだけで snapshot 全体が落ちる**。いまはコメントだけが守っている性質を固定する。
  it("seats の displayName は空文字を許す（名簿から引けない席の縮退）", () => {
    const room = validRoom();
    room.session.seats[0]!.displayName = "";
    expect(v.safeParse(RoomSchema, room).success).toBe(true);
  });
});

/**
 * 完成記録の形（#91・spec T9 / §6）。
 *
 * `topicTitle` は `nonEmptyString` にしない —— お題なしで完了した記録は `null` を持ち、
 * 1 件の値で snapshot 全体が落ちる型の欠陥は #276 D2 で直している。
 *
 * 旧い形（`problemTitle` だけ）が**落ちる**ことも固定する。配布中の窓 2（新しい timer の web ×
 * 旧い同期サーバー）で、完成記録を持つルームの snapshot は丸ごと検証に落ちる —— spec §6 が
 * 受容した窓の実在を、ここが契約として持つ。
 *
 * @requirements #91 E17
 */
describe("RoomSchema: 完成記録はお題のタイトルを持つ", () => {
  /** 完成記録の最小の新しい形。 */
  function aRecord(overrides: Record<string, unknown> = {}) {
    return {
      id: "r1",
      topicTitle: "FizzBuzz" as string | null,
      elapsedSeconds: 60,
      members: ["アリス"],
      totalSwitches: 1,
      completedAt: 1,
      ...overrides,
    };
  }

  it("Given topicTitle が null の記録を持つ snapshot / When 検証する / Then 通る", () => {
    // Given
    const room = { ...validRoom(), sessionRecords: [aRecord({ topicTitle: null })] };
    // When
    const parsed = v.safeParse(RoomSchema, room);
    // Then
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.output.sessionRecords[0]?.topicTitle).toBeNull();
  });

  it("Given 旧い形（problemTitle だけ）の記録を持つ snapshot / When 検証する / Then 落ちる", () => {
    // Given: 旧い同期サーバーが送る形（配布中の窓 2）
    const { topicTitle: _dropped, ...withoutTopic } = aRecord();
    const legacy = { ...withoutTopic, problemTitle: "FizzBuzz", language: "TypeScript", difficulty: "easy" };
    const room = { ...validRoom(), sessionRecords: [legacy] };
    // When
    const parsed = v.safeParse(RoomSchema, room);
    // Then
    expect(parsed.success).toBe(false);
  });
});

/**
 * `config.members` を wire から落とした（#294）。
 *
 * かつて `SessionConfig` は「サーバー側の設定＋ローテーション順の表示名（`members`）」
 * だった。表示名の読み手は席（`session.seats`）へ移り、**画面の読み手は 0 件**になった。
 *
 * この契約で守るのは 2 つである ——
 *
 * 1. **新しいサーバー（項目を持たない）の snapshot が通る**
 * 2. **旧サーバー（項目を持つ）の snapshot も通る。** `deploy.sh timer` は画面を先に
 *    配るので「新しい画面 × 旧サーバー」の窓は順序では避けられない（#276 の実測）。
 *    ここで落とすと、その窓のあいだ画面が丸ごと「最新ではありません」へ倒れる
 *
 * ⚠ **ついでに 1 つの失敗経路が消えた。** `members` の要素は `nonEmptyString` だったため、
 * 名簿から引けない席の空文字が 1 つ載るだけで **snapshot 全体が棄却**されていた
 * （`docs/adr/0005`・`apps/timer-web/test/ui/App.sync-stale.test.tsx`）。
 * 席の `displayName` は #276 D2 で `v.string()` にしてあり、同じ縮退を受け止める。
 */
describe("RoomSchema: config.members を落とした（#294）", () => {
  it("members を持たない config の snapshot が通る", () => {
    // Given: 新しいサーバーが送る形
    const room = baseRoom();
    delete (room.config as Record<string, unknown>).members;
    // When
    const parsed = v.safeParse(RoomSchema, room);
    // Then
    expect(parsed.success).toBe(true);
  });

  it("members を持つ config の snapshot も通る（旧サーバー・配布の窓）", () => {
    // Given: この項目をまだ送るサーバーの形（対照実行）
    const room = baseRoom();
    // When
    const parsed = v.safeParse(RoomSchema, room);
    // Then: 通り、かつ**画面には渡らない**（契約から落ちた項目は出力に残らない）
    expect(parsed.success).toBe(true);
    if (parsed.success) expect("members" in parsed.output.config).toBe(false);
  });

  it("旧サーバーが空文字の members を載せても、snapshot は棄却されない", () => {
    // Given: 名簿から引けない席がある旧サーバーの形（かつてはこれで全体が落ちた）
    const room = baseRoom();
    (room.config as Record<string, unknown>).members = [""];
    // When
    const parsed = v.safeParse(RoomSchema, room);
    // Then
    expect(parsed.success).toBe(true);
  });

  it("config.set に members を載せても、境界を越えた先には残らない", () => {
    // Given: 旧い画面（または細工した接続）が送る形
    const command = {
      command: "config.set",
      config: { intervalMinutes: 5, members: ["X"] },
    };
    // When
    const parsed = v.safeParse(CommandSchema, command);
    // Then: コマンド自体は受理し、`members` だけがパーサで落ちる。
    // **`build-domain-command.ts` の取り除きが不要になった根拠がこれである**
    // （輪の出入りは member.add/remove/move・addProxy・participant.remove だけが担う・D6b）。
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.output.command === "config.set") {
      expect("members" in parsed.output.config).toBe(false);
    }
  });
});
