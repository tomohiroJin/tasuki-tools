/**
 * 権限判定の結合テスト（コマンド経路）
 *
 * 可否の規則そのものは `packages/timer-core` の純粋関数 `checkPermission()` が単独で持ち、
 * `packages/timer-core/test/permissions.test.ts` と `permissions-differential.test.ts` が
 * 25 コマンド × 役割 × 段階 × 対象を網羅している。したがってここでは**規則を再検証しない**。
 *
 * このファイルに残すのは、サーバー側にしか存在しない結合の観点だけである:
 *   1. join の既定ロール（判定の入力になる事実）
 *   2. コマンド経路が判定結果を実際に error として返すこと（拒否・許可それぞれ1件）
 *   3. `resolveIsSelfTarget()` が対象の指定方法を正しく解決すること
 *      （core は isSelfTarget を入力として受け取るだけなので、その算出は core では検証できない）
 *
 * 段階による差（開始前は主催者主導・開始後は全員同格）は
 * `permissions-before-start.test.ts` / `permissions-after-start.test.ts` が担当する。
 */

import { describe, it, expect, beforeEach } from "vitest";
import { makeHandlers } from "../src/application/handlers.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";

/**
 * @requirements FR-016, FR-017, US5
 */
describe("コマンド経路: 既定ロールと拒否の伝播", () => {
  let store: InMemoryRoomStore;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;
  let roomCode: string;

  beforeEach(async () => {
    store = new InMemoryRoomStore();
    broadcaster = new SpyBroadcaster();
    handlers = makeHandlers({
      store,
      clock: new FakeClock(1000000),
      broadcaster,
      codeGen: new FakeCodeGen(),
    });

    // ルームを作成
    await handlers.handleCommand("host-conn", {
      command: "room.create",
      displayName: "Host",
    });
    // 本番（server.ts）は handleCommand の戻り値を破棄する。値は本番と同じ観測点から取る（FR-100）。
    roomCode = broadcaster.createdFor("host-conn").code;

    // 参加者が join（既定は editor）。viewer 制限の検証用に host が viewer へ降格する。
    await handlers.handleCommand("viewer-conn", {
      command: "room.join",
      code: roomCode,
      displayName: "Viewer",
      hasAiKey: false,
    });
    const joined = store.get(roomCode)!;
    const viewerPid = joined.participants.find((p) => p.displayName === "Viewer")!.participantId;
    await handlers.handleCommand("host-conn", {
      command: "role.set",
      participantId: viewerPid,
      role: "viewer",
    });

    broadcaster.sent.length = 0;
    broadcaster.snapshots.length = 0;
  });

  it("新規参加者はデフォルトで editor（UX 再設計: すぐ参加して回せる）", async () => {
    // Given（beforeEach の Viewer は降格済み。別の参加者を新規 join させる）
    const command = {
      command: "room.join",
      code: roomCode,
      displayName: "Fresh",
      hasAiKey: false,
    } as const;
    // When
    await handlers.handleCommand("fresh-conn", command);

    // Then
    const room = store.get(roomCode);
    const fresh = room?.participants.find((p) => p.displayName === "Fresh");
    expect(fresh?.role).toBe("editor");
  });

  it("viewer は session.act を実行できない", async () => {
    // Given
    const command = { command: "session.act", action: "START" } as const;
    // When
    await handlers.handleCommand("viewer-conn", command);

    // Then
    const error = broadcaster.sent.find((s) => s.msg.type === "error");
    expect(error).toBeTruthy();
    if (error?.msg.type === "error") {
      expect(error.msg.code).toBe("UNAUTHORIZED");
    }
  });
});

// ─── コマンド経路: 許可の伝播 ────────────────────────────────────────────────

/**
 * @requirements FR-055
 */
describe("コマンド経路: 許可が decide まで届く", () => {
  let store: InMemoryRoomStore;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;
  let roomCode: string;
  let hostConnId: string;
  let viewerConnId: string;

  beforeEach(async () => {
    store = new InMemoryRoomStore();
    broadcaster = new SpyBroadcaster();
    handlers = makeHandlers({
      store,
      clock: new FakeClock(1000000),
      broadcaster,
      codeGen: new FakeCodeGen(),
    });
    hostConnId = "host-conn-v2";
    viewerConnId = "viewer-conn-v2";

    await handlers.handleCommand(hostConnId, {
      command: "room.create",
      displayName: "Host",
    });
    // 本番（server.ts）は handleCommand の戻り値を破棄する。値は本番と同じ観測点から取る（FR-100）。
    roomCode = broadcaster.createdFor(hostConnId).code;

    await handlers.handleCommand(viewerConnId, {
      command: "room.join",
      code: roomCode,
      displayName: "Viewer",
      hasAiKey: false,
    });
    // 既定 editor を viewer へ降格して制限を検証する。
    const joined = store.get(roomCode)!;
    const viewerPid = joined.participants.find((p) => p.displayName === "Viewer")!.participantId;
    await handlers.handleCommand(hostConnId, {
      command: "role.set",
      participantId: viewerPid,
      role: "viewer",
    });

    broadcaster.sent.length = 0;
    broadcaster.snapshots.length = 0;
  });

  it("viewer は session.abort を実行できない", async () => {
    // Given（viewer 権限で session.abort を対象にする）
    // When
    await handlers.handleCommand(viewerConnId, { command: "session.abort" });
    // Then
    const error = broadcaster.sent.find((s) => s.msg.type === "error");
    expect(error).toBeTruthy();
    if (error?.msg.type === "error") {
      expect(error.msg.code).toBe("UNAUTHORIZED");
    }
  });

  it("host は session.abort を実行できる", async () => {
    // Given（host 権限で session.abort を対象にする）
    // When
    await handlers.handleCommand(hostConnId, { command: "session.abort" });
    // Then
    const error = broadcaster.sent.find((s) => s.msg.type === "error");
    expect(error).toBeUndefined();
  });

  it("host は participant.addProxy を実行できる", async () => {
    // Given
    const command = {
      command: "participant.addProxy",
      displayName: "Dave",
      participantId: "proxy-99",
    } as const;
    // When
    await handlers.handleCommand(hostConnId, command);
    // Then
    const error = broadcaster.sent.find((s) => s.msg.type === "error");
    expect(error).toBeUndefined();
  });
});

// ─── resolveIsSelfTarget: 対象の解決（サーバー側にしかない責務） ───────────────
// core の checkPermission は isSelfTarget を「入力」として受け取るため、その算出の
// 正しさは core では検証できない。participantId で対象を指すコマンドについて、
// 「本人 / 他人」の解決がコマンド経路で機能していることをここで担保する。

/**
 * @requirements FR-071
 */
describe("resolveIsSelfTarget: driver.skip / driver.resume の対象解決（本人 or host）", () => {
  let store: InMemoryRoomStore;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;
  let roomCode: string;
  let hostConnId: string;
  let editorConnId: string;
  let viewerConnId: string;
  let editorPid: string;
  let viewerPid: string;

  beforeEach(async () => {
    store = new InMemoryRoomStore();
    broadcaster = new SpyBroadcaster();
    handlers = makeHandlers({
      store,
      clock: new FakeClock(1000000),
      broadcaster,
      codeGen: new FakeCodeGen(),
    });
    hostConnId = "host-conn-rel";
    editorConnId = "editor-conn-rel";
    viewerConnId = "viewer-conn-rel";

    await handlers.handleCommand(hostConnId, {
      command: "room.create",
      displayName: "Host",
    });
    // 本番（server.ts）は handleCommand の戻り値を破棄する。値は本番と同じ観測点から取る（FR-100）。
    roomCode = broadcaster.createdFor(hostConnId).code;

    await handlers.handleCommand(editorConnId, {
      command: "room.join",
      code: roomCode,
      displayName: "Editor",
      hasAiKey: false,
    });
    await handlers.handleCommand(viewerConnId, {
      command: "room.join",
      code: roomCode,
      displayName: "Viewer",
      hasAiKey: false,
    });

    // 参加者 ID を解決し、Editor を editor ロールへ昇格
    const room = store.get(roomCode)!;
    editorPid = room.participants.find((p) => p.displayName === "Editor")!.participantId;
    viewerPid = room.participants.find((p) => p.displayName === "Viewer")!.participantId;

    await handlers.handleCommand(hostConnId, {
      command: "role.set",
      participantId: editorPid,
      role: "editor",
    });

    broadcaster.sent.length = 0;
    broadcaster.snapshots.length = 0;
  });

  it("editor は他人を driver.skip できない（fail-closed）", async () => {
    // Given（editor が他人＝viewer を対象に driver.skip する）
    const command = { command: "driver.skip", participantId: viewerPid } as const;
    // When
    await handlers.handleCommand(editorConnId, command);
    // Then
    const error = broadcaster.sent.find((s) => s.msg.type === "error");
    expect(error).toBeTruthy();
    if (error?.msg.type === "error") {
      expect(error.msg.code).toBe("UNAUTHORIZED");
    }
  });

  it("viewer は自分を driver.skip できる（本人）", async () => {
    // Given（viewer が自分自身を対象に driver.skip する）
    const command = { command: "driver.skip", participantId: viewerPid } as const;
    // When
    await handlers.handleCommand(viewerConnId, command);
    // Then
    const error = broadcaster.sent.find((s) => s.msg.type === "error");
    expect(error).toBeUndefined();
  });

  it("host は他人を driver.skip できる（host）", async () => {
    // Given（host が他人＝viewer を対象に driver.skip する）
    const command = { command: "driver.skip", participantId: viewerPid } as const;
    // When
    await handlers.handleCommand(hostConnId, command);
    // Then
    const error = broadcaster.sent.find((s) => s.msg.type === "error");
    expect(error).toBeUndefined();
  });

  it("editor は他人を driver.resume できない（fail-closed）", async () => {
    // Given（editor が他人＝viewer を対象に driver.resume する）
    const command = { command: "driver.resume", participantId: viewerPid } as const;
    // When
    await handlers.handleCommand(editorConnId, command);
    // Then
    const error = broadcaster.sent.find((s) => s.msg.type === "error");
    expect(error).toBeTruthy();
    if (error?.msg.type === "error") {
      expect(error.msg.code).toBe("UNAUTHORIZED");
    }
  });

  it("viewer は自分を driver.resume できる（本人）", async () => {
    // Given（viewer が自分自身を対象に driver.resume する）
    const command = { command: "driver.resume", participantId: viewerPid } as const;
    // When
    await handlers.handleCommand(viewerConnId, command);
    // Then
    const error = broadcaster.sent.find((s) => s.msg.type === "error");
    expect(error).toBeUndefined();
  });
});
