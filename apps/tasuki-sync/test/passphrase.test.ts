/**
 * 合言葉の保持と、`room.join` の合言葉の検証の結合テスト。
 *
 * 設定のコマンド `room.passphrase.set` は #638 でハブ（玄関）へ移った（実 WS 越しの検証は
 * `live-ws.hub-passphrase.test.ts`）。ここでは設定の本体（`applyRoomPassphrase`）と、timer の入口の
 * 検証（保持した合言葉で関門が働くこと）を見る。
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { makeHandlers } from "../src/application/handlers.js";
import { applyRoomPassphrase } from "../src/application/room-passphrase.js";
import { createTokenStore, type TokenStore } from "../src/application/token-store.js";
import { makeTestHandlers } from "./support/room-builder.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { InMemoryTimerStore } from "../src/adapters/in-memory-timer-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { maybeRoomViewOf } from "./support/room-view.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";

describe("applyRoomPassphrase", () => {
  it("設定すると保管され、付いている（true）を返す", () => {
    const tokens = createTokenStore();

    const protectedNow = applyRoomPassphrase(tokens, "R1", "secret");

    expect(protectedNow).toBe(true);
    expect(tokens.getPassphrase("R1")).toBe("secret");
  });

  it("前後の空白は落として保持する（設定側と参加側の trim の差で不一致にしない）", () => {
    const tokens = createTokenStore();

    applyRoomPassphrase(tokens, "R1", "  secret ");

    expect(tokens.getPassphrase("R1")).toBe("secret");
  });

  it("空文字・空白のみは解除し、付いていない（false）を返す", () => {
    const tokens = createTokenStore();
    applyRoomPassphrase(tokens, "R1", "secret");

    expect(applyRoomPassphrase(tokens, "R1", "")).toBe(false);
    expect(tokens.getPassphrase("R1")).toBeUndefined();

    applyRoomPassphrase(tokens, "R1", "secret");
    expect(applyRoomPassphrase(tokens, "R1", "  ")).toBe(false);
    expect(tokens.getPassphrase("R1")).toBeUndefined();
  });

  it("別のルームの合言葉には触れない", () => {
    const tokens = createTokenStore();
    applyRoomPassphrase(tokens, "R1", "secret");

    applyRoomPassphrase(tokens, "R2", "");

    expect(tokens.getPassphrase("R1")).toBe("secret");
  });
});

/**
 * @requirements v2.2 R4-2
 */
describe("room.join のパスフレーズ検証", () => {
  let store: InMemoryRoomStore;
  let timers: InMemoryTimerStore;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;
  let tokens: TokenStore;
  let roomCode: string;
  const hostConn = "host-conn";
  const joinerConn = "joiner-conn";

  beforeEach(async () => {
    store = new InMemoryRoomStore();
    timers = new InMemoryTimerStore();
    broadcaster = new SpyBroadcaster();
    tokens = createTokenStore();
    handlers = makeTestHandlers({
      store,
      timers,
      tokens,
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
    applyRoomPassphrase(tokens, roomCode, "secret");
    const before = maybeRoomViewOf(store, timers, roomCode)?.participants.length ?? 0;

    // When
    const res = await handlers.handleCommand(joinerConn, {
      command: "room.join",
      code: roomCode,
      displayName: "Joiner",
      passphrase: "secret",
    });

    // Then（参加者が1名増えている）
    res._unsafeUnwrap();
    expect(maybeRoomViewOf(store, timers, roomCode)?.participants.length).toBe(before + 1);
  });

  it("パスフレーズ未提供は PASSPHRASE_REQUIRED で拒否（参加者数不変）", async () => {
    // Given
    applyRoomPassphrase(tokens, roomCode, "secret");
    const before = maybeRoomViewOf(store, timers, roomCode)?.participants.length ?? 0;

    // When
    await handlers.handleCommand(joinerConn, {
      command: "room.join",
      code: roomCode,
      displayName: "Joiner",
    });

    // Then
    expect(broadcaster.errorsTo(joinerConn).at(-1)?.code).toBe("PASSPHRASE_REQUIRED");
    // 参加者数は変化しない
    expect(maybeRoomViewOf(store, timers, roomCode)?.participants.length).toBe(before);
  });

  it("パスフレーズ不一致は PASSPHRASE_MISMATCH で拒否（参加者数不変）", async () => {
    // Given
    applyRoomPassphrase(tokens, roomCode, "secret");
    const before = maybeRoomViewOf(store, timers, roomCode)?.participants.length ?? 0;

    // When
    await handlers.handleCommand(joinerConn, {
      command: "room.join",
      code: roomCode,
      displayName: "Joiner",
      passphrase: "wrong",
    });

    // Then
    expect(broadcaster.errorsTo(joinerConn).at(-1)?.code).toBe("PASSPHRASE_MISMATCH");
    // 参加者数は変化しない
    expect(maybeRoomViewOf(store, timers, roomCode)?.participants.length).toBe(before);
  });

  it("パスフレーズ未設定ルームは passphrase なしで従来どおり参加できる（後方互換）", async () => {
    // Given
    const before = maybeRoomViewOf(store, timers, roomCode)?.participants.length ?? 0;

    // When
    const res = await handlers.handleCommand(joinerConn, {
      command: "room.join",
      code: roomCode,
      displayName: "Joiner",
    });

    // Then
    res._unsafeUnwrap();
    expect(maybeRoomViewOf(store, timers, roomCode)?.participants.length).toBe(before + 1);
  });

  it("正規化: 設定側の前後空白は無視され、trim 後一致で参加できる", async () => {
    // Given（host が前後空白付きで設定 → サーバは trim して保持）
    applyRoomPassphrase(tokens, roomCode, "secret ");
    const before = maybeRoomViewOf(store, timers, roomCode)?.participants.length ?? 0;

    // When（参加側は空白なしの "secret"）
    const res = await handlers.handleCommand(joinerConn, {
      command: "room.join",
      code: roomCode,
      displayName: "Joiner",
      passphrase: "secret",
    });

    // Then（trim 比較で一致して参加できる）
    res._unsafeUnwrap();
    expect(maybeRoomViewOf(store, timers, roomCode)?.participants.length).toBe(before + 1);
  });

  it("resume（再接続）はパスフレーズ不要で成功する（再認証されない）", async () => {
    // Given（初回参加＝正しいパスフレーズで resumeToken を得る）
    applyRoomPassphrase(tokens, roomCode, "secret");
    await handlers.handleCommand(joinerConn, {
      command: "room.join",
      code: roomCode,
      displayName: "Joiner",
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
      resumeToken: resumeToken!,
    });

    // Then（再認証されず成功する）
    expect(res.isOk()).toBe(true);
  });
});
