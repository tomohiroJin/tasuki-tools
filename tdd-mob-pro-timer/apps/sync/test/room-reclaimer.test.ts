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
    const store = new InMemoryRoomStore();
    store.put(room("AAA", ["offline", "offline"]));
    const onReclaim = vi.fn();
    const r = new RoomReclaimer({ store, idleTtlMs: 1000, onReclaim });

    r.sweep(0);
    expect(onReclaim).not.toHaveBeenCalled();
    r.sweep(500);
    expect(onReclaim).not.toHaveBeenCalled();
    r.sweep(1000);
    expect(onReclaim).toHaveBeenCalledWith("AAA");
  });

  it("オンライン参加者がいるルームは回収しない", () => {
    const store = new InMemoryRoomStore();
    store.put(room("BBB", ["online", "offline"]));
    const onReclaim = vi.fn();
    const r = new RoomReclaimer({ store, idleTtlMs: 1000, onReclaim });
    r.sweep(0);
    r.sweep(10_000);
    expect(onReclaim).not.toHaveBeenCalled();
  });

  it("空→誰か復帰でカウンタがリセットされる", () => {
    const store = new InMemoryRoomStore();
    store.put(room("CCC", ["offline"]));
    const onReclaim = vi.fn();
    const r = new RoomReclaimer({ store, idleTtlMs: 1000, onReclaim });
    r.sweep(0);
    store.put(room("CCC", ["online"]));
    r.sweep(900);
    store.put(room("CCC", ["offline"]));
    r.sweep(950);
    r.sweep(1900);
    expect(onReclaim).not.toHaveBeenCalled();
    r.sweep(1950);
    expect(onReclaim).toHaveBeenCalledWith("CCC");
  });
});
