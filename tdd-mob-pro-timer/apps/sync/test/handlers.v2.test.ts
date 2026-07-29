/**
 * v2 新コマンドの結合テスト
 * T028/T029: FR-041,045,048,052,057 (US3,5,9,10)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { makeHandlers } from "../src/application/handlers.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import type { Room } from "@tdd-mob/core";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";

function getLatestSnapshot(spy: SpyBroadcaster): Room | undefined {
  return spy.snapshots.at(-1)?.room;
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
    broadcaster.snapshots.length = 0;
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

  it("代理参加者の participantId はサーバー生成され、client 供給のIDを無視する（セキュリティ）", async () => {
    // client が任意の participantId（既存IDとの衝突を狙った値）を供給しても…
    await handlers.handleCommand(hostConn, {
      command: "participant.addProxy",
      displayName: "なりすまし代理",
      participantId: "ATTACKER-SUPPLIED-ID",
    });
    const room = getLatestSnapshot(broadcaster);
    const proxy = room?.participants.find((p) => p.displayName === "なりすまし代理");
    expect(proxy).toBeTruthy();
    // 代理の participantId はサーバー生成され、供給値を採用しない（信頼境界外を無視）
    expect(proxy?.participantId).not.toBe("ATTACKER-SUPPLIED-ID");
    // participantId は全参加者で一意（衝突による状態破壊なし）
    const ids = room!.participants.map((p) => p.participantId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("participant.addProxy で代理参加者が rotation とドライバー対象に含まれる（FR-047）", async () => {
    await handlers.handleCommand(hostConn, {
      command: "participant.addProxy",
      displayName: "Dave",
      participantId: "proxy-dave2",
    });
    const room = getLatestSnapshot(broadcaster);
    // rotation は参加者IDの配列（D6b）。Dave の ID が含まれる（ドライバーローテーション参加）
    const dave = room?.participants.find((p) => p.displayName === "Dave");
    expect(room?.session.rotation).toContain(dave!.participantId);
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

  it("participant.rename しても rotation は動かない（識別子で持つため・D6b/FR-048）", async () => {
    const room = store.get(roomCode);
    const hostParticipant = room?.participants.find((p) => p.connId === hostConn);
    const before = [...room!.session.rotation];
    // rotation に本人の ID が入っていることを前提確認
    expect(before).toContain(hostParticipant!.participantId);

    await handlers.handleCommand(hostConn, {
      command: "participant.rename",
      participantId: hostParticipant!.participantId,
      displayName: "RenamedDriver",
    });

    const updated = getLatestSnapshot(broadcaster);
    // 改名しても ID は変わらないので rotation は一切書き換わらない
    // （旧名で位置を引く処理が無くなり、同名の取り違えが原理的に起きない）
    expect(updated?.session.rotation).toEqual(before);
    // 表示名ミラーである config.members には新名が載る
    expect(updated?.config.members).toContain("RenamedDriver");
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
    broadcaster.snapshots.length = 0;

    // Host を既存の Dave へ改名 → rotation 一意性が壊れるため拒否
    const result = await handlers.handleCommand(hostConn, {
      command: "participant.rename",
      participantId: hostParticipant!.participantId,
      displayName: "Dave",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error).toBe("DuplicateName");
    // 名前は変わらず表示名の一意性は保たれる
    const after = store.get(roomCode);
    expect(after?.participants.map((p) => p.displayName)).toEqual(["Host", "Dave"]);
  });

  it("既存の表示名と重複する代理は追加できない（D6b で移設した検査）", async () => {
    // rotation が参加者IDの配列になった時点で、core 側の rotation ベースの重複検査は
    // 「絶対に一致しない」死んだ検査になっていた（実機検証で発見）。サーバー層へ移設した。
    const room = store.get(roomCode);
    const hostName = room!.participants.find((p) => p.connId === hostConn)!.displayName;

    const result = await handlers.handleCommand(hostConn, {
      command: "participant.addProxy", displayName: hostName, participantId: "proxy-dup-name",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error).toBe("DuplicateName");
    // 輪の長さも参加者も増えない。
    const after = store.get(roomCode);
    expect(after?.participants.filter((p) => p.displayName === hostName)).toHaveLength(1);
  });

  it("大文字小文字だけが違う名前の代理も追加できない", async () => {
    await handlers.handleCommand(hostConn, {
      command: "participant.addProxy", displayName: "Dave", participantId: "proxy-case-1",
    });

    const result = await handlers.handleCommand(hostConn, {
      command: "participant.addProxy", displayName: "dave", participantId: "proxy-case-2",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error).toBe("DuplicateName");
  });

  it("輪の外に居る参加者の名前へも改名できない（T052 の移設で守られる範囲）", async () => {
    // 検査対象が rotation から participants へ移ったことで、輪に並んでいない在室者の
    // 名前も衝突として扱えるようになった（旧実装は rotation しか見ておらず素通りしていた）。
    const joined = await handlers.handleCommand("guest-conn", {
      command: "room.join", code: roomCode, displayName: "Spectator", hasAiKey: false,
    });
    expect(joined.isOk()).toBe(true);
    const room = store.get(roomCode);
    const hostParticipant = room?.participants.find((p) => p.connId === hostConn);
    const spectator = room?.participants.find((p) => p.connId === "guest-conn");
    // 前提: 見学者は輪に居ない。
    expect(room?.session.rotation).not.toContain(spectator!.participantId);

    const result = await handlers.handleCommand(hostConn, {
      command: "participant.rename",
      participantId: hostParticipant!.participantId,
      displayName: "Spectator",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error).toBe("DuplicateName");
  });

  it("大文字小文字だけが違う名前への改名も拒否される（表示上は識別できないため）", async () => {
    await handlers.handleCommand(hostConn, {
      command: "participant.addProxy", displayName: "Dave", participantId: "proxy-case",
    });
    const room = store.get(roomCode);
    const hostParticipant = room?.participants.find((p) => p.connId === hostConn);

    const result = await handlers.handleCommand(hostConn, {
      command: "participant.rename",
      participantId: hostParticipant!.participantId,
      displayName: "dave",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error).toBe("DuplicateName");
  });

  it("自分の現在名と同一への rename は許可される（no-op 相当）", async () => {
    const room = store.get(roomCode);
    const hostParticipant = room?.participants.find((p) => p.connId === hostConn);
    const sameName = hostParticipant!.displayName;
    broadcaster.snapshots.length = 0;

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
    broadcaster.snapshots.length = 0;

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
    broadcaster.snapshots.length = 0;

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
    const before = broadcaster.snapshots.length;
    await handlers.handleCommand(hostConn, { command: "session.abort" });
    expect(broadcaster.snapshots.length).toBeGreaterThan(before);
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

    broadcaster.snapshots.length = 0;
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

  it("存在しない participantId への rename は PARTICIPANT_NOT_FOUND で拒否される", async () => {
    const result = await handlers.handleCommand(hostConn, {
      command: "participant.rename",
      participantId: "no-such-participant",
      displayName: "Ghost",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error).toBe("PARTICIPANT_NOT_FOUND");
    // snapshot は発行されない（誰の名前も変わらない）
    expect(getLatestSnapshot(broadcaster)).toBeUndefined();
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
