/**
 * v2 新コマンドの結合テスト
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { makeHandlers } from "../src/application/handlers.js";
import { makeTestHandlers } from "./support/room-builder.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";

/**
 * @requirements FR-041, FR-045, FR-048, FR-052, FR-057, US3, US5, US9, US10
 */
describe("v2 コマンドの結合テスト", () => {
  let store: InMemoryRoomStore;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;
  let roomCode: string;
  const hostConn = "host-conn";

  beforeEach(async () => {
    store = new InMemoryRoomStore();
    broadcaster = new SpyBroadcaster();
    handlers = makeTestHandlers({
      store,
      clock: new FakeClock(1000000),
      broadcaster,
      codeGen: new FakeCodeGen(),
    });

    await handlers.handleCommand(hostConn, {
      command: "room.create",
      displayName: "Host",
    });
    roomCode = broadcaster.createdFor(hostConn).code;
    broadcaster.snapshots.length = 0;
    broadcaster.sent.length = 0;
  });

  // ─── session.abort ────────────────────────────────────────────────────────

  it("session.abort で phase が celebration になり記録は追加されない", async () => {
    // Given（session.abort コマンドを対象にする。引数はない）
    // When
    await handlers.handleCommand(hostConn, { command: "session.abort" });
    // Then
    const room = broadcaster.latestSnapshot();
    expect(room?.phase).toBe("celebration");
    // 記録は生成されない（FR-020: 中断は記録しない）
    expect(room?.sessionRecords).toHaveLength(0);
  });

  // ─── participant.addProxy ─────────────────────────────────────────────────

  it("participant.addProxy でプレースホルダーが参加者一覧に追加される", async () => {
    // Given
    const command = {
      command: "participant.addProxy",
      displayName: "Dave（代理）",
      participantId: "proxy-dave",
    } as const;
    // When
    await handlers.handleCommand(hostConn, command);
    // Then
    const room = broadcaster.latestSnapshot();
    const proxy = room?.participants.find((p) => p.displayName === "Dave（代理）");
    expect(proxy).toBeTruthy();
    expect(proxy?.isPlaceholder).toBe(true);
    expect(proxy?.connId).toBeNull();
  });

  it("代理参加者の participantId はサーバー生成され、client 供給のIDを無視する（セキュリティ）", async () => {
    // Given（client が任意の participantId＝既存IDとの衝突を狙った値を供給する）
    const command = {
      command: "participant.addProxy",
      displayName: "なりすまし代理",
      participantId: "ATTACKER-SUPPLIED-ID",
    } as const;
    // When
    await handlers.handleCommand(hostConn, command);
    // Then
    const room = broadcaster.latestSnapshot();
    const proxy = room?.participants.find((p) => p.displayName === "なりすまし代理");
    expect(proxy).toBeTruthy();
    // 代理の participantId はサーバー生成され、供給値を採用しない（信頼境界外を無視）
    expect(proxy?.participantId).not.toBe("ATTACKER-SUPPLIED-ID");
    // participantId は全参加者で一意（衝突による状態破壊なし）
    const ids = room!.participants.map((p) => p.participantId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("participant.addProxy で代理参加者が rotation とドライバー対象に含まれる", async () => {
    // Given
    const command = {
      command: "participant.addProxy",
      displayName: "Dave",
      participantId: "proxy-dave2",
    } as const;
    // When
    await handlers.handleCommand(hostConn, command);
    // Then（rotation は参加者IDの配列・D6b。Dave の ID が含まれる＝ドライバーローテーション参加）
    const room = broadcaster.latestSnapshot();
    const dave = room?.participants.find((p) => p.displayName === "Dave");
    expect(room?.session.rotation).toContain(dave!.participantId);
    // 不変条件: rotation.length === driverCounts.length
    expect(room?.session.rotation.length).toBe(room?.session.driverCounts.length);
  });

  // ─── participant.rename ───────────────────────────────────────────────────

  it("host が自分の名前を変更すると snapshot に反映される", async () => {
    // Given
    const room = store.get(roomCode);
    const hostParticipant = room?.participants.find((p) => p.connId === hostConn);
    expect(hostParticipant).toBeTruthy();

    // When
    await handlers.handleCommand(hostConn, {
      command: "participant.rename",
      participantId: hostParticipant!.participantId,
      displayName: "NewHostName",
    });

    // Then
    const updated = broadcaster.latestSnapshot();
    const renamed = updated?.participants.find((p) => p.participantId === hostParticipant!.participantId);
    expect(renamed?.displayName).toBe("NewHostName");
  });

  it("participant.rename しても rotation は動かない（識別子で持つため・D6b）", async () => {
    // Given（rotation に本人の ID が入っていることを前提確認）
    const room = store.get(roomCode);
    const hostParticipant = room?.participants.find((p) => p.connId === hostConn);
    const before = [...room!.session.rotation];
    expect(before).toContain(hostParticipant!.participantId);

    // When
    await handlers.handleCommand(hostConn, {
      command: "participant.rename",
      participantId: hostParticipant!.participantId,
      displayName: "RenamedDriver",
    });

    // Then
    const updated = broadcaster.latestSnapshot();
    // 改名しても ID は変わらないので rotation は一切書き換わらない
    // （旧名で位置を引く処理が無くなり、同名の取り違えが原理的に起きない）
    expect(updated?.session.rotation).toEqual(before);
    // 表示名ミラーである config.members には新名が載る
    expect(updated?.config.members).toContain("RenamedDriver");
  });

  it("既存の他メンバー名への rename は DuplicateName で拒否される", async () => {
    // Given（代理メンバー Dave を追加し rotation=["Host","Dave"] にする）
    await handlers.handleCommand(hostConn, {
      command: "participant.addProxy",
      displayName: "Dave",
      participantId: "proxy-dup",
    });
    const room = store.get(roomCode);
    const hostParticipant = room?.participants.find((p) => p.connId === hostConn);
    broadcaster.snapshots.length = 0;

    // When（Host を既存の Dave へ改名 → rotation 一意性が壊れるため拒否されるはず）
    await handlers.handleCommand(hostConn, {
      command: "participant.rename",
      participantId: hostParticipant!.participantId,
      displayName: "Dave",
    });

    // Then
    expect(broadcaster.errorsTo(hostConn).at(-1)?.code).toBe("DuplicateName");
    // 名前は変わらず表示名の一意性は保たれる
    const after = store.get(roomCode);
    expect(after?.participants.map((p) => p.displayName)).toEqual(["Host", "Dave"]);
  });

  it("既存の表示名と重複する代理は追加できない（D6b で移設した検査）", async () => {
    // Given（rotation が参加者IDの配列になった時点で、core 側の rotation ベースの重複検査は
    // 「絶対に一致しない」死んだ検査になっていた。実機検証で発見しサーバー層へ移設した）
    const room = store.get(roomCode);
    const hostName = room!.participants.find((p) => p.connId === hostConn)!.displayName;

    // When
    await handlers.handleCommand(hostConn, {
      command: "participant.addProxy", displayName: hostName, participantId: "proxy-dup-name",
    });

    // Then
    expect(broadcaster.errorsTo(hostConn).at(-1)?.code).toBe("DuplicateName");
    // 輪の長さも参加者も増えない。
    const after = store.get(roomCode);
    expect(after?.participants.filter((p) => p.displayName === hostName)).toHaveLength(1);
  });

  it("大文字小文字だけが違う名前の代理も追加できない", async () => {
    // Given
    await handlers.handleCommand(hostConn, {
      command: "participant.addProxy", displayName: "Dave", participantId: "proxy-case-1",
    });

    // When
    await handlers.handleCommand(hostConn, {
      command: "participant.addProxy", displayName: "dave", participantId: "proxy-case-2",
    });

    // Then
    expect(broadcaster.errorsTo(hostConn).at(-1)?.code).toBe("DuplicateName");
  });

  it("輪の外に居る参加者の名前へも改名できない", async () => {
    // Given（検査対象が rotation から participants へ移ったことで、輪に並んでいない在室者の
    // 名前も衝突として扱えるようになった。旧実装は rotation しか見ておらず素通りしていた）
    const joined = await handlers.handleCommand("guest-conn", {
      command: "room.join", code: roomCode, displayName: "Spectator", hasAiKey: false,
    });
    joined._unsafeUnwrap();
    const room = store.get(roomCode);
    const hostParticipant = room?.participants.find((p) => p.connId === hostConn);
    const spectator = room?.participants.find((p) => p.connId === "guest-conn");
    // 前提: 見学者は輪に居ない。
    expect(room?.session.rotation).not.toContain(spectator!.participantId);

    // When
    await handlers.handleCommand(hostConn, {
      command: "participant.rename",
      participantId: hostParticipant!.participantId,
      displayName: "Spectator",
    });

    // Then
    expect(broadcaster.errorsTo(hostConn).at(-1)?.code).toBe("DuplicateName");
  });

  it("大文字小文字だけが違う名前への改名も拒否される（表示上は識別できないため）", async () => {
    // Given
    await handlers.handleCommand(hostConn, {
      command: "participant.addProxy", displayName: "Dave", participantId: "proxy-case",
    });
    const room = store.get(roomCode);
    const hostParticipant = room?.participants.find((p) => p.connId === hostConn);

    // When
    await handlers.handleCommand(hostConn, {
      command: "participant.rename",
      participantId: hostParticipant!.participantId,
      displayName: "dave",
    });

    // Then
    expect(broadcaster.errorsTo(hostConn).at(-1)?.code).toBe("DuplicateName");
  });

  it("自分の現在名と同一への rename は許可される（no-op 相当）", async () => {
    // Given
    const room = store.get(roomCode);
    const hostParticipant = room?.participants.find((p) => p.connId === hostConn);
    const sameName = hostParticipant!.displayName;
    broadcaster.snapshots.length = 0;

    // When
    const result = await handlers.handleCommand(hostConn, {
      command: "participant.rename",
      participantId: hostParticipant!.participantId,
      displayName: sameName,
    });

    // Then
    result._unsafeUnwrap();
    const updated = broadcaster.latestSnapshot();
    const self = updated?.participants.find(
      (p) => p.participantId === hostParticipant!.participantId,
    );
    expect(self?.displayName).toBe(sameName);
  });

  // ─── driver.skip / driver.resume ─────────────────────────────────────────

  it("driver.skip で参加者の driverEligible が false になる", async () => {
    // Given
    const room = store.get(roomCode);
    const hostParticipant = room?.participants.find((p) => p.connId === hostConn);

    // When
    await handlers.handleCommand(hostConn, {
      command: "driver.skip",
      participantId: hostParticipant!.participantId,
    });

    // Then
    const updated = broadcaster.latestSnapshot();
    const skipped = updated?.participants.find((p) => p.participantId === hostParticipant!.participantId);
    expect(skipped?.driverEligible).toBe(false);
  });

  it("driver.resume で参加者の driverEligible が true に戻る", async () => {
    // Given（まず skip）
    const room = store.get(roomCode);
    const hostParticipant = room?.participants.find((p) => p.connId === hostConn);
    await handlers.handleCommand(hostConn, {
      command: "driver.skip",
      participantId: hostParticipant!.participantId,
    });
    broadcaster.snapshots.length = 0;

    // When
    await handlers.handleCommand(hostConn, {
      command: "driver.resume",
      participantId: hostParticipant!.participantId,
    });

    // Then
    const updated = broadcaster.latestSnapshot();
    const resumed = updated?.participants.find((p) => p.participantId === hostParticipant!.participantId);
    expect(resumed?.driverEligible).toBe(true);
  });

  // ─── problem.edit ─────────────────────────────────────────────────────────

  it("problem.edit でルームの problem フィールドが更新される", async () => {
    // Given（まずお題を設定）
    const initialRoom = store.get(roomCode)!;
    store.put({
      ...initialRoom,
      problem: {
        title: "旧タイトル",
        description: "旧説明",
        requirements: ["要件1"],
        exampleTest: "test",
        hints: [],
      },
    });
    broadcaster.snapshots.length = 0;

    // When
    await handlers.handleCommand(hostConn, {
      command: "problem.edit",
      patch: { title: "新タイトル" },
    });

    // Then
    const updated = broadcaster.latestSnapshot();
    expect(updated?.problem?.title).toBe("新タイトル");
    expect(updated?.problem?.edited).toBe(true);
    // 他のフィールドは変更されない
    expect(updated?.problem?.description).toBe("旧説明");
  });

  // ─── problem.mode.set ────────────────────────────────────────────────────

  it("problem.mode.set で Room の problemMode が更新される", async () => {
    // Given
    const command = { command: "problem.mode.set", mode: "ai" } as const;
    // When
    await handlers.handleCommand(hostConn, command);
    // Then
    const updated = broadcaster.latestSnapshot();
    expect(updated?.problemMode).toBe("ai");
  });

  // ─── snapshot 全員反映の確認 ─────────────────────────────────────────────

  it("v2 コマンド実行後に新しい snapshot が全員へ配信される", async () => {
    // Given（実行前の snapshot 配信件数を基準にする）
    const before = broadcaster.snapshots.length;
    // When
    await handlers.handleCommand(hostConn, { command: "session.abort" });
    // Then
    expect(broadcaster.snapshots.length).toBeGreaterThan(before);
  });
});

// ─── participant.rename の認可 ──────────────────────────────────────────────

/**
 * @requirements FR-046, FR-048
 */
describe("participant.rename の認可", () => {
  let store: InMemoryRoomStore;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;
  let roomCode: string;
  let hostPid: string;
  let viewerPid: string;
  const hostConn = "host-conn";
  const viewerConn = "viewer-conn";

  beforeEach(async () => {
    store = new InMemoryRoomStore();
    broadcaster = new SpyBroadcaster();
    handlers = makeTestHandlers({
      store,
      clock: new FakeClock(1000000),
      broadcaster,
      codeGen: new FakeCodeGen(),
    });

    await handlers.handleCommand(hostConn, {
      command: "room.create",
      displayName: "Host",
    });
    roomCode = broadcaster.createdFor(hostConn).code;
    hostPid = broadcaster.createdFor(hostConn).participantId;

    // viewer として参加（新規参加者は viewer 既定）
    await handlers.handleCommand(viewerConn, {
      command: "room.join",
      code: roomCode,
      displayName: "Viewer",
      hasAiKey: false,
    });
    viewerPid = broadcaster.joinedFor(viewerConn).participantId;

    broadcaster.snapshots.length = 0;
    broadcaster.sent.length = 0;
  });

  it("viewer が他人を rename しようとすると UNAUTHORIZED で拒否される", async () => {
    // Given（他人＝host を改名しようとする）
    const command = {
      command: "participant.rename",
      participantId: hostPid,
      displayName: "Hijacked",
    } as const;
    // When
    await handlers.handleCommand(viewerConn, command);

    // Then（snapshot は発行されず、host 名は変わらない）
    expect(broadcaster.errorsTo(viewerConn).at(-1)?.code).toBe("UNAUTHORIZED");
    const room = store.get(roomCode);
    const host = room?.participants.find((p) => p.participantId === hostPid);
    expect(host?.displayName).toBe("Host");
  });

  it("viewer が自分自身を rename するのは許可される", async () => {
    // Given（本人を改名する）
    const command = {
      command: "participant.rename",
      participantId: viewerPid,
      displayName: "ViewerNew",
    } as const;
    // When
    const result = await handlers.handleCommand(viewerConn, command);

    // Then
    result._unsafeUnwrap();
    const updated = broadcaster.latestSnapshot();
    const self = updated?.participants.find((p) => p.participantId === viewerPid);
    expect(self?.displayName).toBe("ViewerNew");
  });

  it("host は他人（viewer）を rename できる", async () => {
    // Given
    const command = {
      command: "participant.rename",
      participantId: viewerPid,
      displayName: "RenamedByHost",
    } as const;
    // When
    const result = await handlers.handleCommand(hostConn, command);

    // Then
    result._unsafeUnwrap();
    const updated = broadcaster.latestSnapshot();
    const target = updated?.participants.find((p) => p.participantId === viewerPid);
    expect(target?.displayName).toBe("RenamedByHost");
  });

  it("存在しない participantId への rename は PARTICIPANT_NOT_FOUND で拒否される", async () => {
    // Given
    const command = {
      command: "participant.rename",
      participantId: "no-such-participant",
      displayName: "Ghost",
    } as const;
    // When
    await handlers.handleCommand(hostConn, command);

    // Then
    expect(broadcaster.errorsTo(hostConn).at(-1)?.code).toBe("PARTICIPANT_NOT_FOUND");
    // snapshot は発行されない（誰の名前も変わらない）
    expect(broadcaster.latestSnapshot()).toBeUndefined();
  });
});

// ─── room-not-found のテスト ────────────────────────────────────────────────

/**
 * @requirements FR-007, FR-059
 */
describe("room-not-found 応答", () => {
  let store: InMemoryRoomStore;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;

  beforeEach(() => {
    store = new InMemoryRoomStore();
    broadcaster = new SpyBroadcaster();
    handlers = makeTestHandlers({
      store,
      clock: new FakeClock(1000000),
      broadcaster,
      codeGen: new FakeCodeGen(),
    });
  });

  it("存在しないルームコードで join すると error{code:ROOM_NOT_FOUND} を返す", async () => {
    // Given
    const command = {
      command: "room.join",
      code: "INVALID",
      displayName: "Guest",
      hasAiKey: false,
    } as const;
    // When
    await handlers.handleCommand("guest-conn", command);

    // Then
    const error = broadcaster.sent.find((s) => s.msg.type === "error");
    expect(error).toBeTruthy();
    if (error?.msg.type === "error") {
      expect(error.msg.code).toBe("ROOM_NOT_FOUND");
    }
  });
});
