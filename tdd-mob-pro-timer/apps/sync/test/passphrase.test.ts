/**
 * room.passphrase.set（任意ルームパスフレーズ・R4-2）の結合テスト
 * Task 2: host 限定の設定/解除・平文 snapshot 非混入
 */

import { describe, it, expect, beforeEach } from "vitest";
import { makeHandlers } from "../src/application/handlers.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";

describe("room.passphrase.set（R4-2）", () => {
  let store: InMemoryRoomStore;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;
  let roomCode: string;
  const hostConn = "host-conn";
  const editorConn = "editor-conn";

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

  it("ホストはパスフレーズを設定でき passphraseProtected が true（平文は snapshot 非混入）", async () => {
    const res = await handlers.handleCommand(hostConn, {
      command: "room.passphrase.set",
      passphrase: "secret",
    });

    expect(res.isOk()).toBe(true);
    expect(store.get(roomCode)?.passphraseProtected).toBe(true);
    // 平文 "secret" が Room（snapshot 対象）に混入していないこと
    expect(JSON.stringify(store.get(roomCode))).not.toContain("secret");
  });

  it("空文字で解除でき passphraseProtected が false", async () => {
    await handlers.handleCommand(hostConn, {
      command: "room.passphrase.set",
      passphrase: "secret",
    });
    expect(store.get(roomCode)?.passphraseProtected).toBe(true);

    const res = await handlers.handleCommand(hostConn, {
      command: "room.passphrase.set",
      passphrase: "",
    });

    expect(res.isOk()).toBe(true);
    expect(store.get(roomCode)?.passphraseProtected).toBe(false);
  });

  it("ホスト以外のパスフレーズ設定は UNAUTHORIZED で拒否", async () => {
    // 別 conn が editor として参加（join のデフォルトは editor）
    await handlers.handleCommand(editorConn, {
      command: "room.join",
      code: roomCode,
      displayName: "Editor",
      hasAiKey: false,
    });

    const res = await handlers.handleCommand(editorConn, {
      command: "room.passphrase.set",
      passphrase: "hack",
    });

    expect(res.isErr()).toBe(true);
    if (res.isErr()) expect(res.error).toBe("UNAUTHORIZED");
    // passphraseProtected は変化しない
    expect(store.get(roomCode)?.passphraseProtected).toBeFalsy();
  });
});

describe("room.join のパスフレーズ検証（R4-2 / Task 3）", () => {
  let store: InMemoryRoomStore;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;
  let roomCode: string;
  const hostConn = "host-conn";
  const joinerConn = "joiner-conn";

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

  it("パスフレーズ設定済みルームへ正しいパスフレーズで参加できる", async () => {
    // host がパスフレーズを設定する
    await handlers.handleCommand(hostConn, {
      command: "room.passphrase.set",
      passphrase: "secret",
    });
    const before = store.get(roomCode)?.participants.length ?? 0;

    const res = await handlers.handleCommand(joinerConn, {
      command: "room.join",
      code: roomCode,
      displayName: "Joiner",
      hasAiKey: false,
      passphrase: "secret",
    });

    expect(res.isOk()).toBe(true);
    // 参加者が1名増えている
    expect(store.get(roomCode)?.participants.length).toBe(before + 1);
  });

  it("パスフレーズ未提供は PASSPHRASE_REQUIRED で拒否（参加者数不変）", async () => {
    await handlers.handleCommand(hostConn, {
      command: "room.passphrase.set",
      passphrase: "secret",
    });
    const before = store.get(roomCode)?.participants.length ?? 0;

    const res = await handlers.handleCommand(joinerConn, {
      command: "room.join",
      code: roomCode,
      displayName: "Joiner",
      hasAiKey: false,
    });

    expect(res.isErr()).toBe(true);
    if (res.isErr()) expect(res.error).toBe("PASSPHRASE_REQUIRED");
    // 参加者数は変化しない
    expect(store.get(roomCode)?.participants.length).toBe(before);
  });

  it("パスフレーズ不一致は PASSPHRASE_MISMATCH で拒否（参加者数不変）", async () => {
    await handlers.handleCommand(hostConn, {
      command: "room.passphrase.set",
      passphrase: "secret",
    });
    const before = store.get(roomCode)?.participants.length ?? 0;

    const res = await handlers.handleCommand(joinerConn, {
      command: "room.join",
      code: roomCode,
      displayName: "Joiner",
      hasAiKey: false,
      passphrase: "wrong",
    });

    expect(res.isErr()).toBe(true);
    if (res.isErr()) expect(res.error).toBe("PASSPHRASE_MISMATCH");
    // 参加者数は変化しない
    expect(store.get(roomCode)?.participants.length).toBe(before);
  });

  it("パスフレーズ未設定ルームは passphrase なしで従来どおり参加できる（後方互換）", async () => {
    const before = store.get(roomCode)?.participants.length ?? 0;

    const res = await handlers.handleCommand(joinerConn, {
      command: "room.join",
      code: roomCode,
      displayName: "Joiner",
      hasAiKey: false,
    });

    expect(res.isOk()).toBe(true);
    expect(store.get(roomCode)?.participants.length).toBe(before + 1);
  });

  it("正規化: 設定側の前後空白は無視され、trim 後一致で参加できる", async () => {
    // host が前後空白付きで設定 → サーバは trim して保持。
    await handlers.handleCommand(hostConn, {
      command: "room.passphrase.set",
      passphrase: "secret ",
    });
    const before = store.get(roomCode)?.participants.length ?? 0;

    // 参加側は空白なしの "secret" → trim 比較で一致して参加できる。
    const res = await handlers.handleCommand(joinerConn, {
      command: "room.join",
      code: roomCode,
      displayName: "Joiner",
      hasAiKey: false,
      passphrase: "secret",
    });

    expect(res.isOk()).toBe(true);
    expect(store.get(roomCode)?.participants.length).toBe(before + 1);
  });

  it("resume（再接続）はパスフレーズ不要で成功する（再認証されない）", async () => {
    await handlers.handleCommand(hostConn, {
      command: "room.passphrase.set",
      passphrase: "secret",
    });
    // 初回参加（正しいパスフレーズ）で resumeToken を得る。
    await handlers.handleCommand(joinerConn, {
      command: "room.join",
      code: roomCode,
      displayName: "Joiner",
      hasAiKey: false,
      passphrase: "secret",
    });
    const joinedMsg = broadcaster.sent.find((s) => s.msg.type === "room.joined");
    const resumeToken =
      joinedMsg && "resumeToken" in joinedMsg.msg
        ? (joinedMsg.msg as { resumeToken: string }).resumeToken
        : undefined;
    expect(resumeToken).toBeTruthy();

    // 新接続で resumeToken のみ（passphrase なし）→ 再認証されず成功する。
    const res = await handlers.handleCommand("joiner-reconnect", {
      command: "room.join",
      code: roomCode,
      displayName: "Joiner",
      hasAiKey: false,
      resumeToken: resumeToken!,
    });

    expect(res.isOk()).toBe(true);
  });
});
