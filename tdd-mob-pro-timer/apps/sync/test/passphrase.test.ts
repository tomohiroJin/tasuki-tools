/**
 * room.passphrase.set（任意ルームパスフレーズ）の結合テスト
 * host 限定の設定/解除・平文 snapshot 非混入
 */

import { describe, it, expect, beforeEach } from "vitest";
import { makeHandlers } from "../src/application/handlers.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";

/**
 * @requirements v2.2 R4-2
 */
describe("room.passphrase.set", () => {
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

    await handlers.handleCommand(hostConn, {
      command: "room.create",
      displayName: "Host",
    });
    roomCode = broadcaster.createdFor(hostConn).code;
    broadcaster.snapshots.length = 0;
    broadcaster.sent.length = 0;
  });

  it("ホストはパスフレーズを設定でき passphraseProtected が true（平文は snapshot 非混入）", async () => {
    // Given
    const command = { command: "room.passphrase.set", passphrase: "secret" } as const;

    // When
    const res = await handlers.handleCommand(hostConn, command);

    // Then
    res._unsafeUnwrap();
    expect(store.get(roomCode)?.passphraseProtected).toBe(true);
    // 平文 "secret" が Room（snapshot 対象）に混入していないこと
    expect(JSON.stringify(store.get(roomCode))).not.toContain("secret");
  });

  it("空文字で解除でき passphraseProtected が false", async () => {
    // Given
    await handlers.handleCommand(hostConn, {
      command: "room.passphrase.set",
      passphrase: "secret",
    });
    expect(store.get(roomCode)?.passphraseProtected).toBe(true);

    // When
    const res = await handlers.handleCommand(hostConn, {
      command: "room.passphrase.set",
      passphrase: "",
    });

    // Then
    res._unsafeUnwrap();
    expect(store.get(roomCode)?.passphraseProtected).toBe(false);
  });

  it("ホスト以外のパスフレーズ設定は UNAUTHORIZED で拒否", async () => {
    // Given（別 conn が editor として参加。join のデフォルトは editor）
    await handlers.handleCommand(editorConn, {
      command: "room.join",
      code: roomCode,
      displayName: "Editor",
      hasAiKey: false,
    });

    // When
    await handlers.handleCommand(editorConn, {
      command: "room.passphrase.set",
      passphrase: "hack",
    });

    // Then
    expect(broadcaster.errorsTo(editorConn).at(-1)?.code).toBe("UNAUTHORIZED");
    // passphraseProtected は変化しない
    expect(store.get(roomCode)?.passphraseProtected).toBeFalsy();
  });
});

/**
 * @requirements v2.2 R4-2
 */
describe("room.join のパスフレーズ検証", () => {
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

    await handlers.handleCommand(hostConn, {
      command: "room.create",
      displayName: "Host",
    });
    roomCode = broadcaster.createdFor(hostConn).code;
    broadcaster.snapshots.length = 0;
    broadcaster.sent.length = 0;
  });

  it("パスフレーズ設定済みルームへ正しいパスフレーズで参加できる", async () => {
    // Given（host がパスフレーズを設定する）
    await handlers.handleCommand(hostConn, {
      command: "room.passphrase.set",
      passphrase: "secret",
    });
    const before = store.get(roomCode)?.participants.length ?? 0;

    // When
    const res = await handlers.handleCommand(joinerConn, {
      command: "room.join",
      code: roomCode,
      displayName: "Joiner",
      hasAiKey: false,
      passphrase: "secret",
    });

    // Then（参加者が1名増えている）
    res._unsafeUnwrap();
    expect(store.get(roomCode)?.participants.length).toBe(before + 1);
  });

  it("パスフレーズ未提供は PASSPHRASE_REQUIRED で拒否（参加者数不変）", async () => {
    // Given
    await handlers.handleCommand(hostConn, {
      command: "room.passphrase.set",
      passphrase: "secret",
    });
    const before = store.get(roomCode)?.participants.length ?? 0;

    // When
    await handlers.handleCommand(joinerConn, {
      command: "room.join",
      code: roomCode,
      displayName: "Joiner",
      hasAiKey: false,
    });

    // Then
    expect(broadcaster.errorsTo(joinerConn).at(-1)?.code).toBe("PASSPHRASE_REQUIRED");
    // 参加者数は変化しない
    expect(store.get(roomCode)?.participants.length).toBe(before);
  });

  it("パスフレーズ不一致は PASSPHRASE_MISMATCH で拒否（参加者数不変）", async () => {
    // Given
    await handlers.handleCommand(hostConn, {
      command: "room.passphrase.set",
      passphrase: "secret",
    });
    const before = store.get(roomCode)?.participants.length ?? 0;

    // When
    await handlers.handleCommand(joinerConn, {
      command: "room.join",
      code: roomCode,
      displayName: "Joiner",
      hasAiKey: false,
      passphrase: "wrong",
    });

    // Then
    expect(broadcaster.errorsTo(joinerConn).at(-1)?.code).toBe("PASSPHRASE_MISMATCH");
    // 参加者数は変化しない
    expect(store.get(roomCode)?.participants.length).toBe(before);
  });

  it("パスフレーズ未設定ルームは passphrase なしで従来どおり参加できる（後方互換）", async () => {
    // Given
    const before = store.get(roomCode)?.participants.length ?? 0;

    // When
    const res = await handlers.handleCommand(joinerConn, {
      command: "room.join",
      code: roomCode,
      displayName: "Joiner",
      hasAiKey: false,
    });

    // Then
    res._unsafeUnwrap();
    expect(store.get(roomCode)?.participants.length).toBe(before + 1);
  });

  it("正規化: 設定側の前後空白は無視され、trim 後一致で参加できる", async () => {
    // Given（host が前後空白付きで設定 → サーバは trim して保持）
    await handlers.handleCommand(hostConn, {
      command: "room.passphrase.set",
      passphrase: "secret ",
    });
    const before = store.get(roomCode)?.participants.length ?? 0;

    // When（参加側は空白なしの "secret"）
    const res = await handlers.handleCommand(joinerConn, {
      command: "room.join",
      code: roomCode,
      displayName: "Joiner",
      hasAiKey: false,
      passphrase: "secret",
    });

    // Then（trim 比較で一致して参加できる）
    res._unsafeUnwrap();
    expect(store.get(roomCode)?.participants.length).toBe(before + 1);
  });

  it("resume（再接続）はパスフレーズ不要で成功する（再認証されない）", async () => {
    // Given（初回参加＝正しいパスフレーズで resumeToken を得る）
    await handlers.handleCommand(hostConn, {
      command: "room.passphrase.set",
      passphrase: "secret",
    });
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

    // When（新接続で resumeToken のみ・passphrase なし）
    const res = await handlers.handleCommand("joiner-reconnect", {
      command: "room.join",
      code: roomCode,
      displayName: "Joiner",
      hasAiKey: false,
      resumeToken: resumeToken!,
    });

    // Then（再認証されず成功する）
    expect(res.isOk()).toBe(true);
  });
});
