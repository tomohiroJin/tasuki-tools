/**
 * v2 新コマンドの結合テスト
 * T028/T029: FR-041,045,048,052,057 (US3,5,9,10)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { makeHandlers } from "../src/application/handlers.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import type { RoomCodeGen } from "../src/ports/code-gen.js";
import type { Broadcaster } from "../src/ports/broadcaster.js";
import type { Room, ServerMsg } from "@tdd-mob/core";

class FakeCodeGen implements RoomCodeGen {
  private _counter = 0;
  generate(): string { return `V2ROOM${String(++this._counter).padStart(2, "0")}`; }
  generateParticipantId(): string { return `pid-v2-${++this._counter}`; }
  generateResumeToken(): string { return `rt-v2-${++this._counter}`; }
}

class SpyBroadcaster implements Broadcaster {
  readonly sent: Array<{ connId: string; msg: ServerMsg }> = [];
  readonly snapshotRooms: Room[] = [];
  broadcastSnapshot(code: string, room: Room): void { this.snapshotRooms.push(room); }
  sendTo(connId: string, msg: ServerMsg): void { this.sent.push({ connId, msg }); }
  broadcastSignal(code: string): void { void code; }
}

function getLatestSnapshot(spy: SpyBroadcaster): Room | undefined {
  return spy.snapshotRooms[spy.snapshotRooms.length - 1];
}

describe("v2 コマンドの結合テスト（T028/T029）", () => {
  let store: InMemoryRoomStore;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;
  let roomCode: string;
  const hostConn = "host-conn";

  beforeEach(async () => {
    store = new InMemoryRoomStore();
    broadcaster = new SpyBroadcaster();
    handlers = makeHandlers({
      store,
      clock: new FakeClock(1000000),
      broadcaster,
      codeGen: new FakeCodeGen(),
    });

    const result = await handlers.handleCommand(hostConn, {
      command: "room.create",
      displayName: "Host",
    });
    if (result.isOk()) roomCode = result.value.code;
    broadcaster.snapshotRooms.length = 0;
    broadcaster.sent.length = 0;
  });

  // ─── session.abort ────────────────────────────────────────────────────────

  it("session.abort で phase が celebration になり記録は追加されない（FR-020/045）", async () => {
    await handlers.handleCommand(hostConn, { command: "session.abort" });
    const room = getLatestSnapshot(broadcaster);
    expect(room?.phase).toBe("celebration");
    // 記録は生成されない（FR-020: 中断は記録しない）
    expect(room?.sessionRecords).toHaveLength(0);
  });

  // ─── participant.addProxy ─────────────────────────────────────────────────

  it("participant.addProxy でプレースホルダーが参加者一覧に追加される（FR-047）", async () => {
    await handlers.handleCommand(hostConn, {
      command: "participant.addProxy",
      displayName: "Dave（代理）",
      participantId: "proxy-dave",
    });
    const room = getLatestSnapshot(broadcaster);
    const proxy = room?.participants.find((p) => p.displayName === "Dave（代理）");
    expect(proxy).toBeTruthy();
    expect(proxy?.isPlaceholder).toBe(true);
    expect(proxy?.connId).toBeNull();
  });

  it("participant.addProxy で代理参加者が rotation とドライバー対象に含まれる（FR-047）", async () => {
    await handlers.handleCommand(hostConn, {
      command: "participant.addProxy",
      displayName: "Dave",
      participantId: "proxy-dave2",
    });
    const room = getLatestSnapshot(broadcaster);
    // rotation に Dave が含まれる（ドライバーローテーション参加）
    expect(room?.session.rotation).toContain("Dave");
    // 不変条件: rotation.length === driverCounts.length
    expect(room?.session.rotation.length).toBe(room?.session.driverCounts.length);
  });

  // ─── participant.rename ───────────────────────────────────────────────────

  it("host が自分の名前を変更すると snapshot に反映される（FR-048）", async () => {
    // host の participantId を取得
    const room = store.get(roomCode);
    const hostParticipant = room?.participants.find((p) => p.connId === hostConn);
    expect(hostParticipant).toBeTruthy();

    await handlers.handleCommand(hostConn, {
      command: "participant.rename",
      participantId: hostParticipant!.participantId,
      displayName: "NewHostName",
    });

    const updated = getLatestSnapshot(broadcaster);
    const renamed = updated?.participants.find((p) => p.participantId === hostParticipant!.participantId);
    expect(renamed?.displayName).toBe("NewHostName");
  });

  it("participant.rename で rotation 内の旧名も新名に更新される（FR-048）", async () => {
    const room = store.get(roomCode);
    const hostParticipant = room?.participants.find((p) => p.connId === hostConn);
    const oldName = hostParticipant!.displayName;
    // rotation に旧名が入っていることを前提確認
    expect(room?.session.rotation).toContain(oldName);

    await handlers.handleCommand(hostConn, {
      command: "participant.rename",
      participantId: hostParticipant!.participantId,
      displayName: "RenamedDriver",
    });

    const updated = getLatestSnapshot(broadcaster);
    // rotation も新名に更新される（旧名は消える）
    expect(updated?.session.rotation).toContain("RenamedDriver");
    expect(updated?.session.rotation).not.toContain(oldName);
  });

  it("既存の他メンバー名への rename は DuplicateName で拒否される（FR-048）", async () => {
    // 代理メンバー Dave を追加し rotation=["Host","Dave"] にする
    await handlers.handleCommand(hostConn, {
      command: "participant.addProxy",
      displayName: "Dave",
      participantId: "proxy-dup",
    });
    const room = store.get(roomCode);
    const hostParticipant = room?.participants.find((p) => p.connId === hostConn);
    broadcaster.snapshotRooms.length = 0;

    // Host を既存の Dave へ改名 → rotation 一意性が壊れるため拒否
    const result = await handlers.handleCommand(hostConn, {
      command: "participant.rename",
      participantId: hostParticipant!.participantId,
      displayName: "Dave",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error).toBe("DuplicateName");
    // 名前は変わらず rotation 一意性は保たれる
    const after = store.get(roomCode);
    expect(after?.session.rotation).toEqual(["Host", "Dave"]);
  });

  it("自分の現在名と同一への rename は許可される（no-op 相当）", async () => {
    const room = store.get(roomCode);
    const hostParticipant = room?.participants.find((p) => p.connId === hostConn);
    const sameName = hostParticipant!.displayName;
    broadcaster.snapshotRooms.length = 0;

    const result = await handlers.handleCommand(hostConn, {
      command: "participant.rename",
      participantId: hostParticipant!.participantId,
      displayName: sameName,
    });

    expect(result.isOk()).toBe(true);
    const updated = getLatestSnapshot(broadcaster);
    const self = updated?.participants.find(
      (p) => p.participantId === hostParticipant!.participantId,
    );
    expect(self?.displayName).toBe(sameName);
  });

  // ─── driver.skip / driver.resume ─────────────────────────────────────────

  it("driver.skip で参加者の driverEligible が false になる（FR-051）", async () => {
    const room = store.get(roomCode);
    const hostParticipant = room?.participants.find((p) => p.connId === hostConn);

    await handlers.handleCommand(hostConn, {
      command: "driver.skip",
      participantId: hostParticipant!.participantId,
    });

    const updated = getLatestSnapshot(broadcaster);
    const skipped = updated?.participants.find((p) => p.participantId === hostParticipant!.participantId);
    expect(skipped?.driverEligible).toBe(false);
  });

  it("driver.resume で参加者の driverEligible が true に戻る（FR-051）", async () => {
    const room = store.get(roomCode);
    const hostParticipant = room?.participants.find((p) => p.connId === hostConn);

    // まず skip
    await handlers.handleCommand(hostConn, {
      command: "driver.skip",
      participantId: hostParticipant!.participantId,
    });
    broadcaster.snapshotRooms.length = 0;

    // resume
    await handlers.handleCommand(hostConn, {
      command: "driver.resume",
      participantId: hostParticipant!.participantId,
    });

    const updated = getLatestSnapshot(broadcaster);
    const resumed = updated?.participants.find((p) => p.participantId === hostParticipant!.participantId);
    expect(resumed?.driverEligible).toBe(true);
  });

  // ─── problem.edit ─────────────────────────────────────────────────────────

  it("problem.edit でルームの problem フィールドが更新される（FR-038/041）", async () => {
    // まずお題を設定
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
    broadcaster.snapshotRooms.length = 0;

    await handlers.handleCommand(hostConn, {
      command: "problem.edit",
      patch: { title: "新タイトル" },
    });

    const updated = getLatestSnapshot(broadcaster);
    expect(updated?.problem?.title).toBe("新タイトル");
    expect(updated?.problem?.edited).toBe(true);
    // 他のフィールドは変更されない
    expect(updated?.problem?.description).toBe("旧説明");
  });

  // ─── problem.mode.set ────────────────────────────────────────────────────

  it("problem.mode.set で Room の problemMode が更新される（FR-042/043）", async () => {
    await handlers.handleCommand(hostConn, {
      command: "problem.mode.set",
      mode: "ai",
    });

    const updated = getLatestSnapshot(broadcaster);
    expect(updated?.problemMode).toBe("ai");
  });

  // ─── snapshot 全員反映の確認 ─────────────────────────────────────────────

  it("v2 コマンド実行後に broadcastSnapshot が呼ばれる（FR-041）", async () => {
    const before = broadcaster.snapshotRooms.length;
    await handlers.handleCommand(hostConn, { command: "session.abort" });
    expect(broadcaster.snapshotRooms.length).toBeGreaterThan(before);
  });
});

// ─── participant.rename の認可（FR-046/048）────────────────────────────────

describe("participant.rename の認可（FR-046/048）", () => {
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
    handlers = makeHandlers({
      store,
      clock: new FakeClock(1000000),
      broadcaster,
      codeGen: new FakeCodeGen(),
    });

    const created = await handlers.handleCommand(hostConn, {
      command: "room.create",
      displayName: "Host",
    });
    if (created.isOk()) {
      roomCode = created.value.code;
      hostPid = created.value.participantId;
    }

    // viewer として参加（新規参加者は viewer 既定）
    const joined = await handlers.handleCommand(viewerConn, {
      command: "room.join",
      code: roomCode,
      displayName: "Viewer",
      hasAiKey: false,
    });
    if (joined.isOk()) viewerPid = joined.value.participantId;

    broadcaster.snapshotRooms.length = 0;
    broadcaster.sent.length = 0;
  });

  it("viewer が他人を rename しようとすると UNAUTHORIZED で拒否される", async () => {
    const result = await handlers.handleCommand(viewerConn, {
      command: "participant.rename",
      participantId: hostPid, // 他人（host）を改名しようとする
      displayName: "Hijacked",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error).toBe("UNAUTHORIZED");
    // snapshot は発行されず、host 名は変わらない
    const room = store.get(roomCode);
    const host = room?.participants.find((p) => p.participantId === hostPid);
    expect(host?.displayName).toBe("Host");
  });

  it("viewer が自分自身を rename するのは許可される", async () => {
    const result = await handlers.handleCommand(viewerConn, {
      command: "participant.rename",
      participantId: viewerPid, // 本人
      displayName: "ViewerNew",
    });

    expect(result.isOk()).toBe(true);
    const updated = getLatestSnapshot(broadcaster);
    const self = updated?.participants.find((p) => p.participantId === viewerPid);
    expect(self?.displayName).toBe("ViewerNew");
  });

  it("host は他人（viewer）を rename できる", async () => {
    const result = await handlers.handleCommand(hostConn, {
      command: "participant.rename",
      participantId: viewerPid, // 他人
      displayName: "RenamedByHost",
    });

    expect(result.isOk()).toBe(true);
    const updated = getLatestSnapshot(broadcaster);
    const target = updated?.participants.find((p) => p.participantId === viewerPid);
    expect(target?.displayName).toBe("RenamedByHost");
  });
});

// ─── T032/T033: room-not-found のテスト ──────────────────────────────────────

describe("room-not-found 応答（T032/T033）", () => {
  let store: InMemoryRoomStore;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;

  beforeEach(() => {
    store = new InMemoryRoomStore();
    broadcaster = new SpyBroadcaster();
    handlers = makeHandlers({
      store,
      clock: new FakeClock(1000000),
      broadcaster,
      codeGen: new FakeCodeGen(),
    });
  });

  it("存在しないルームコードで join すると error{code:ROOM_NOT_FOUND} を返す（FR-007/059）", async () => {
    await handlers.handleCommand("guest-conn", {
      command: "room.join",
      code: "INVALID",
      displayName: "Guest",
      hasAiKey: false,
    });

    const error = broadcaster.sent.find((s) => s.msg.type === "error");
    expect(error).toBeTruthy();
    if (error?.msg.type === "error") {
      expect(error.msg.code).toBe("ROOM_NOT_FOUND");
    }
  });
});
