/** RoomStore の揮発インメモリ実装（憲法 原則 III。再起動で失われてよい） */
import type { Room } from '@tasuki/poker-core';
import type { RoomStore } from '../ports/room-store';

export function createInMemoryRoomStore(): RoomStore {
  const rooms = new Map<string, Room>();
  return {
    get: (roomId) => rooms.get(roomId),
    put: (room) => void rooms.set(room.id, room),
    remove: (roomId) => void rooms.delete(roomId),
    has: (roomId) => rooms.has(roomId),
    count: () => rooms.size,
  };
}
