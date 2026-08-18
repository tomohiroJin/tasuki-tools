/**
 * Broadcaster ポート — 誰が接続中かと、どう届けるか。
 *
 * **ルーム保管とは分ける**（docs/adr/0004 の背景が挙げた非対称の解消）。
 * ただし timer-sync の形はそのまま写せない。timer は `Participant.connId` を持ち
 * Broadcaster が connId からソケットを引くが、**poker の Participant に connId は無い**。
 * 足すとスナップショットの形が変わり振る舞い不変を壊すため、接続レジストリは
 * アダプタの内側に置き、このポートはルーム ID と参加者 ID だけで話す。
 */
import type { Room, ServerMessage } from '@tasuki/poker-core';

export interface RoomSocket {
  send(data: string): void;
}

export interface Broadcaster {
  attach(roomId: string, participantId: string, socket: RoomSocket): void;
  /**
   * 指定ソケットが現在の登録と同一のときだけ外し、true を返す。
   * **異なれば何もせず false を返す**（同一参加者が別ソケットで再接続済みの場合）。
   * これを落とすと、再接続直後に古いソケットの close が新しい接続を蹴り出す。
   */
  detach(roomId: string, participantId: string, socket: RoomSocket): boolean;
  /**
   * そのルーム ID の接続レジストリを空にする。
   *
   * **新しいルームを作る直前に呼ぶ。** ポート化の前は `handleCreateRoom` が
   * `socketsByRoom.set(room.id, new Map())` で毎回**空の集合を作り直して**いた。
   * その復元である（`attach` は既存の集合があれば再利用するため、これが無いと
   * 作り直しにならない）。
   *
   * 落とすと、到達不能になったルームに残った接続が、**同じルーム ID が再採番された
   * ときに別ルームのスナップショットを受け取る**（`store` から消えたルーム ID は
   * `generateRoomId` の衝突回避を素通りするため、再採番自体は起こりうる）。
   */
  resetRoom(roomId: string): void;
  countIn(roomId: string): number;
  broadcastSnapshot(roomId: string, room: Room): void;
  sendTo(socket: RoomSocket, msg: ServerMessage): void;
}
