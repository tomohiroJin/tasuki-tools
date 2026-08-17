// ルームの配信（RoomStore はポートへ切り出し済み。ここには型と broadcast() だけを残す）
import { createSnapshotBuilder, type Room } from '@tasuki/poker-core';

export interface RoomSocket {
  send(data: string): void;
}

export interface RoomEntry {
  room: Room;
  /** participantId → 接続中ソケット。切断でエントリ削除 */
  sockets: Map<string, RoomSocket>;
}

/** ルーム内の各接続へ受信者別スナップショットを配信する（research R1）。
    共有部分（参加者一覧・集計）は 1 回だけ構築し、受信者差分のみ組み立てる */
export function broadcast(entry: RoomEntry): void {
  const snapshotOf = createSnapshotBuilder(entry.room);
  for (const [participantId, socket] of entry.sockets) {
    socket.send(JSON.stringify(snapshotOf(participantId)));
  }
}
