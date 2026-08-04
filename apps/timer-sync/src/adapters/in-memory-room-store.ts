/**
 * InMemoryRoomStore — ルームの揮発インメモリストア
 * T032: FR-013
 */

import type { Room } from "@tdd-mob/core";
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
