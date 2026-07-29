/**
 * ai.unlock ハンドラ統合テスト
 * Task 6: 合言葉解錠・定数時間比較・レート制限・存在秘匿
 */

import { describe, it, expect, beforeEach } from "vitest";
import { makeHandlers } from "../src/application/handlers.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";

describe("ai.unlock", () => {
  let store: InMemoryRoomStore;
  let clock: FakeClock;
  let broadcaster: SpyBroadcaster;
  const hostConn = "host-conn";

  beforeEach(async () => {
    store = new InMemoryRoomStore();
    clock = new FakeClock(1_000_000);
    broadcaster = new SpyBroadcaster();
  });

  it("合言葉一致で aiUnlocked=true・problemMode=ai になり snapshot 配信される", async () => {
    // Given
    const handlers = makeHandlers({
      store,
      clock,
      broadcaster,
      codeGen: new FakeCodeGen(),
      aiUnlockKey: "himitsu",
    });
    const create = await handlers.handleCommand(hostConn, {
      command: "room.create",
      displayName: "Alice",
    });
    const code = create._unsafeUnwrap().code;
    // snapshots をリセットして ai.unlock だけの snapshot を確認しやすくする
    broadcaster.snapshots.length = 0;
    broadcaster.sent.length = 0;

    // When
    const result = await handlers.handleCommand(hostConn, {
      command: "ai.unlock",
      key: "himitsu",
    });

    // Then
    result._unsafeUnwrap();
    const room = store.get(code);
    expect(room?.aiUnlocked).toBe(true);
    expect(room?.problemMode).toBe("ai");
    // 全員へ新しい snapshot が配信される
    expect(broadcaster.snapshots.length).toBeGreaterThan(0);
    const snap = broadcaster.latestSnapshot();
    expect(snap?.aiUnlocked).toBe(true);
    expect(snap?.problemMode).toBe("ai");
  });

  it("合言葉不一致は AI_UNLOCK_FAILED でルームは変化しない", async () => {
    // Given
    const handlers = makeHandlers({
      store,
      clock,
      broadcaster,
      codeGen: new FakeCodeGen(),
      aiUnlockKey: "himitsu",
    });
    const create = await handlers.handleCommand(hostConn, {
      command: "room.create",
      displayName: "Alice",
    });
    const code = create._unsafeUnwrap().code;
    broadcaster.sent.length = 0;

    // When
    const result = await handlers.handleCommand(hostConn, {
      command: "ai.unlock",
      key: "wrong",
    });

    // Then
    expect(result.isErr()).toBe(true);
    const errorMsg = broadcaster.sent.find(
      (s) => s.connId === hostConn && s.msg.type === "error",
    );
    expect(errorMsg).toBeDefined();
    if (errorMsg?.msg.type === "error") {
      expect(errorMsg.msg.code).toBe("AI_UNLOCK_FAILED");
    }
    // ルームは変化しない
    const room = store.get(code);
    expect(room?.aiUnlocked).toBeUndefined();
  });

  it("aiUnlockKey 未設定（機能無効）では正しい合言葉でも AI_UNLOCK_FAILED（存在秘匿）", async () => {
    // Given（aiUnlockKey を渡さない）
    const handlers = makeHandlers({
      store,
      clock,
      broadcaster,
      codeGen: new FakeCodeGen(),
    });
    await handlers.handleCommand(hostConn, {
      command: "room.create",
      displayName: "Alice",
    });
    broadcaster.sent.length = 0;

    // When
    const result = await handlers.handleCommand(hostConn, {
      command: "ai.unlock",
      key: "himitsu",
    });

    // Then
    expect(result.isErr()).toBe(true);
    const errorMsg = broadcaster.sent.find(
      (s) => s.connId === hostConn && s.msg.type === "error",
    );
    expect(errorMsg).toBeDefined();
    if (errorMsg?.msg.type === "error") {
      expect(errorMsg.msg.code).toBe("AI_UNLOCK_FAILED");
    }
  });

  it("host 以外は UNAUTHORIZED で拒否される", async () => {
    // Given
    const handlers = makeHandlers({
      store,
      clock,
      broadcaster,
      codeGen: new FakeCodeGen(),
      aiUnlockKey: "himitsu",
    });
    const create = await handlers.handleCommand(hostConn, {
      command: "room.create",
      displayName: "Alice",
    });
    const code = create._unsafeUnwrap().code;
    const memberConn = "member-conn";
    const join = await handlers.handleCommand(memberConn, {
      command: "room.join",
      code,
      displayName: "Bob",
      hasAiKey: false,
    });
    join._unsafeUnwrap();
    broadcaster.sent.length = 0;

    // When（2人目＝editor が ai.unlock を試みる）
    const result = await handlers.handleCommand(memberConn, {
      command: "ai.unlock",
      key: "himitsu",
    });

    // Then
    expect(result.isErr()).toBe(true);
    const errorMsg = broadcaster.sent.find(
      (s) => s.connId === memberConn && s.msg.type === "error",
    );
    expect(errorMsg).toBeDefined();
    if (errorMsg?.msg.type === "error") {
      expect(errorMsg.msg.code).toBe("UNAUTHORIZED");
    }
  });

  it("連続失敗はレート制限される（30 回/10 秒の既存窓を共用）", async () => {
    // Given（誤ったキーで 30 回試みてレート制限を消費する）
    const handlers = makeHandlers({
      store,
      clock,
      broadcaster,
      codeGen: new FakeCodeGen(),
      aiUnlockKey: "himitsu",
    });
    await handlers.handleCommand(hostConn, {
      command: "room.create",
      displayName: "Alice",
    });
    for (let i = 0; i < 30; i++) {
      await handlers.handleCommand(hostConn, {
        command: "ai.unlock",
        key: `wrong-${i}`,
      });
    }
    broadcaster.sent.length = 0;

    // When（31 回目は正しいキーでも RATE_LIMITED になるはず）
    const result = await handlers.handleCommand(hostConn, {
      command: "ai.unlock",
      key: "himitsu",
    });

    // Then
    expect(result.isErr()).toBe(true);
    const errorMsg = broadcaster.sent.find(
      (s) => s.connId === hostConn && s.msg.type === "error",
    );
    expect(errorMsg).toBeDefined();
    if (errorMsg?.msg.type === "error") {
      expect(errorMsg.msg.code).toBe("RATE_LIMITED");
    }
  });
});
