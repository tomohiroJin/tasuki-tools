// ルームレジストリ（揮発インメモリ。憲法原則 III / FR-014）
import { createSnapshotBuilder, type Room } from '@tasuki/poker-core';

export interface RoomSocket {
  send(data: string): void;
}

export interface RoomEntry {
  room: Room;
  /** participantId → 接続中ソケット。切断でエントリ削除 */
  sockets: Map<string, RoomSocket>;
}

const rooms = new Map<string, RoomEntry>();

/** 8 文字英数字のルーム ID を生成（research R4。衝突時は再生成） */
export function generateRoomId(): string {
  for (;;) {
    const id = crypto.randomUUID().replaceAll('-', '').slice(0, 8).toLowerCase();
    if (!rooms.has(id)) return id;
  }
}

export function putRoom(entry: RoomEntry): void {
  rooms.set(entry.room.id, entry);
}

/** 保持中のルーム数。上限判定に使う（Issue #63。上限そのものは server が決める） */
export function roomCount(): number {
  return rooms.size;
}

export function getRoom(roomId: string): RoomEntry | undefined {
  return rooms.get(roomId);
}

/** 接続数 0 になったルームを即時破棄する（FR-014, Clarification Q1） */
export function dropIfEmpty(roomId: string): void {
  const entry = rooms.get(roomId);
  if (entry && entry.sockets.size === 0) rooms.delete(roomId);
}

/** ルーム内の各接続へ受信者別スナップショットを配信する（research R1）。
    共有部分（参加者一覧・集計）は 1 回だけ構築し、受信者差分のみ組み立てる */
export function broadcast(entry: RoomEntry): void {
  const snapshotOf = createSnapshotBuilder(entry.room);
  for (const [participantId, socket] of entry.sockets) {
    socket.send(JSON.stringify(snapshotOf(participantId)));
  }
}
