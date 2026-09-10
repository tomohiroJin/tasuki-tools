/**
 * InMemoryRoomStore — **名簿**の揮発インメモリストア
 * T032: FR-013（#95 S4a で保管する型がメンバーシップ文脈の Room になった）
 */

import type { Room } from "@tasuki/room-core";
import type { RoomStore } from "../ports/room-store.js";

export class InMemoryRoomStore implements RoomStore {
  private readonly rooms = new Map<string, Room>();

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  put(room: Room): void {
    this.rooms.set(room.code, room);
  }

  remove(code: string): void {
    this.rooms.delete(code);
  }

  list(): Room[] {
    return [...this.rooms.values()];
  }
}
