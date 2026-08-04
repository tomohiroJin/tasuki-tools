import { describe, it, expect, vi } from "vitest";
import { RoomReclaimer } from "../src/application/room-reclaimer.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import type { Room } from "@tdd-mob/core";

function room(code: string, presences: Array<Room["participants"][number]["presence"]>): Room {
  return {
    code,
    createdAt: 0,
    hostParticipantId: "p0",
    participants: presences.map((presence, i) => ({
      participantId: `p${i}`,
      connId: presence === "offline" ? null : `c${i}`,
      displayName: `u${i}`,
      role: i === 0 ? "host" : "editor",
      presence,
      joinedAt: 0,
    })),
  } as unknown as Room;
}

describe("RoomReclaimer", () => {
  it("全員 offline が TTL 継続したルームを回収する", () => {
    // Given
    const store = new InMemoryRoomStore();
    store.put(room("AAA", ["offline", "offline"]));
    const onReclaim = vi.fn();
    const r = new RoomReclaimer({ store, idleTtlMs: 1000, onReclaim });

    // When
    r.sweep(0);
    expect(onReclaim).not.toHaveBeenCalled();
    r.sweep(500);
    expect(onReclaim).not.toHaveBeenCalled();
    r.sweep(1000);

    // Then
    expect(onReclaim).toHaveBeenCalledWith("AAA", expect.any(Number));
  });

  it("オンライン参加者がいるルームは回収しない", () => {
    // Given
    const store = new InMemoryRoomStore();
    store.put(room("BBB", ["online", "offline"]));
    const onReclaim = vi.fn();
    const r = new RoomReclaimer({ store, idleTtlMs: 1000, onReclaim });

    // When
    r.sweep(0);
    r.sweep(10_000);

    // Then
    expect(onReclaim).not.toHaveBeenCalled();
  });

  it("空→誰か復帰でカウンタがリセットされる", () => {
    // Given
    const store = new InMemoryRoomStore();
    store.put(room("CCC", ["offline"]));
    const onReclaim = vi.fn();
    const r = new RoomReclaimer({ store, idleTtlMs: 1000, onReclaim });

    // When
    r.sweep(0);
    store.put(room("CCC", ["online"]));
    r.sweep(900);
    store.put(room("CCC", ["offline"]));
    r.sweep(950);
    r.sweep(1900);
    expect(onReclaim).not.toHaveBeenCalled();
    r.sweep(1950);

    // Then
    expect(onReclaim).toHaveBeenCalledWith("CCC", expect.any(Number));
  });

  it("回収するたびに reclaimedCount が増え、onReclaim にアイドル ms を渡す", () => {
    // Given
    const store = new InMemoryRoomStore();
    store.put(room("EEE", ["offline", "offline"]));
    const calls: Array<{ code: string; idleMs: number }> = [];
    const reclaimer = new RoomReclaimer({
      store,
      idleTtlMs: 1000,
      onReclaim: (code, idleMs) => calls.push({ code, idleMs }),
    });

    // When
    reclaimer.sweep(10_000); // 初検知（emptySince=10000・まだ回収しない）
    expect(reclaimer.reclaimedCount).toBe(0);
    reclaimer.sweep(11_500); // 1500ms 経過 >= 1000 → 回収

    // Then
    expect(reclaimer.reclaimedCount).toBe(1);
    expect(calls.length).toBe(1);
    expect(calls[0]?.idleMs).toBeGreaterThanOrEqual(1000);
  });

  it("回収後（store から削除）は二重に回収しない", () => {
    // Given
    const store = new InMemoryRoomStore();
    store.put(room("DDD", ["offline"]));
    const onReclaim = vi.fn((code: string) => store.remove(code));
    const r = new RoomReclaimer({ store, idleTtlMs: 1000, onReclaim });

    // When
    r.sweep(0);      // empty 初検知
    r.sweep(1000);   // TTL 到達 → 回収（store からも削除）
    r.sweep(2000);   // すでに無い → 何もしない

    // Then
    expect(onReclaim).toHaveBeenCalledTimes(1);
    expect(onReclaim).toHaveBeenCalledWith("DDD", expect.any(Number));
  });
});
