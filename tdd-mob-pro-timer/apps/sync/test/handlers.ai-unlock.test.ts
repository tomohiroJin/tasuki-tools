/**
 * ai.unlock ハンドラ統合テスト
 * Task 6: 合言葉解錠・定数時間比較・レート制限・存在秘匿
 */

import { describe, it, expect, beforeEach } from "vitest";
import { makeHandlers } from "../src/application/handlers.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import type { RoomCodeGen } from "../src/ports/code-gen.js";
import type { Broadcaster } from "../src/ports/broadcaster.js";
import type { Room, ServerMsg } from "@tdd-mob/core";

// ─── フェイク実装 ──────────────────────────────────────────────────────────────

class FakeCodeGen implements RoomCodeGen {
  private _counter = 0;
  generate(): string { return `AIROOM${String(++this._counter).padStart(2, "0")}`; }
  generateParticipantId(): string { return `pid-ai-${++this._counter}`; }
  generateResumeToken(): string { return `rt-ai-${++this._counter}`; }
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

// ─── テスト ────────────────────────────────────────────────────────────────────

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
    const handlers = makeHandlers({
      store,
      clock,
      broadcaster,
      codeGen: new FakeCodeGen(),
      aiUnlockKey: "himitsu",
    });

    // host でルーム作成
    const create = await handlers.handleCommand(hostConn, {
      command: "room.create",
      displayName: "Alice",
    });
    expect(create.isOk()).toBe(true);
    const code = create.isOk() ? create.value.code : "";

    // snapshotRooms をリセットして ai.unlock だけの snapshot を確認しやすくする
    broadcaster.snapshotRooms.length = 0;
    broadcaster.sent.length = 0;

    const result = await handlers.handleCommand(hostConn, {
      command: "ai.unlock",
      key: "himitsu",
    });

    // コマンドが成功する
    expect(result.isOk()).toBe(true);

    // store の room が更新されている
    const room = store.get(code);
    expect(room?.aiUnlocked).toBe(true);
    expect(room?.problemMode).toBe("ai");

    // broadcastSnapshot が呼ばれている
    expect(broadcaster.snapshotRooms.length).toBeGreaterThan(0);
    const snap = getLatestSnapshot(broadcaster);
    expect(snap?.aiUnlocked).toBe(true);
    expect(snap?.problemMode).toBe("ai");
  });

  it("合言葉不一致は AI_UNLOCK_FAILED でルームは変化しない", async () => {
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
    expect(create.isOk()).toBe(true);
    const code = create.isOk() ? create.value.code : "";

    broadcaster.sent.length = 0;

    const result = await handlers.handleCommand(hostConn, {
      command: "ai.unlock",
      key: "wrong",
    });

    // コマンドが失敗する
    expect(result.isErr()).toBe(true);

    // エラーメッセージが送られる
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
    // aiUnlockKey を渡さない
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

    const result = await handlers.handleCommand(hostConn, {
      command: "ai.unlock",
      key: "himitsu",
    });

    expect(result.isErr()).toBe(true);

    const errorMsg = broadcaster.sent.find(
      (s) => s.connId === hostConn && s.msg.type === "error",
    );
    expect(errorMsg).toBeDefined();
    if (errorMsg?.msg.type === "error") {
      expect(errorMsg.msg.code).toBe("AI_UNLOCK_FAILED");
    }
  });

  it("host 以外は UNAUTHORIZED", async () => {
    const handlers = makeHandlers({
      store,
      clock,
      broadcaster,
      codeGen: new FakeCodeGen(),
      aiUnlockKey: "himitsu",
    });

    // host でルーム作成
    const create = await handlers.handleCommand(hostConn, {
      command: "room.create",
      displayName: "Alice",
    });
    expect(create.isOk()).toBe(true);
    const code = create.isOk() ? create.value.code : "";

    // 2人目が参加
    const memberConn = "member-conn";
    const join = await handlers.handleCommand(memberConn, {
      command: "room.join",
      code,
      displayName: "Bob",
      hasAiKey: false,
    });
    expect(join.isOk()).toBe(true);

    broadcaster.sent.length = 0;

    // 2人目（editor）が ai.unlock を試みる
    const result = await handlers.handleCommand(memberConn, {
      command: "ai.unlock",
      key: "himitsu",
    });

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

    // 誤ったキーで 30 回試みてレート制限を消費する
    for (let i = 0; i < 30; i++) {
      await handlers.handleCommand(hostConn, {
        command: "ai.unlock",
        key: `wrong-${i}`,
      });
    }

    broadcaster.sent.length = 0;

    // 31 回目（正しいキーでも）RATE_LIMITED になる
    const result = await handlers.handleCommand(hostConn, {
      command: "ai.unlock",
      key: "himitsu",
    });

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
