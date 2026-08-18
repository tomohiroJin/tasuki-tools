/**
 * Broadcaster の実装。接続レジストリ（roomId → participantId → socket）を内側に持つ。
 *
 * 受信者別スナップショットの共有部分は 1 回だけ構築する（research R1）。
 */
// Room / ServerMessage の型は Broadcaster の戻り値型から文脈的に付くため、ここでは import しない
// （import すると @typescript-eslint/no-unused-vars に掛かる）。
import { createSnapshotBuilder } from '@tasuki/poker-core';
import type { Broadcaster, RoomSocket } from '../ports/broadcaster';

export function createWsBroadcaster(): Broadcaster {
  const byRoom = new Map<string, Map<string, RoomSocket>>();

  return {
    attach(roomId, participantId, socket) {
      const sockets = byRoom.get(roomId) ?? new Map<string, RoomSocket>();
      sockets.set(participantId, socket);
      byRoom.set(roomId, sockets);
    },

    detach(roomId, participantId, socket) {
      const sockets = byRoom.get(roomId);
      if (!sockets) return false;
      // 同一参加者が別ソケットで再接続済みなら（socket が入れ替わっていたら）何もしない
      if (sockets.get(participantId) !== socket) return false;
      sockets.delete(participantId);
      if (sockets.size === 0) byRoom.delete(roomId);
      return true;
    },

    // 空の集合を置き直すのと同じ。attach が新しい Map を作る
    resetRoom: (roomId) => void byRoom.delete(roomId),

    countIn: (roomId) => byRoom.get(roomId)?.size ?? 0,

    broadcastSnapshot(roomId, room) {
      const sockets = byRoom.get(roomId);
      if (!sockets) return;
      const snapshotOf = createSnapshotBuilder(room);
      for (const [participantId, socket] of sockets) {
        socket.send(JSON.stringify(snapshotOf(participantId)));
      }
    },

    sendTo: (socket, msg) => socket.send(JSON.stringify(msg)),
  };
}
