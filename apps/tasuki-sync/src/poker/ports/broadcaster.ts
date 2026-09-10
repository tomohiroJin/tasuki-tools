/**
 * Broadcaster ポート — 誰が接続中かと、どう届けるか。
 *
 * **ルーム保管とは分ける**（docs/adr/0004 の背景が挙げた非対称の解消）。
 * ただし timer 側の形はそのまま写せない。timer は名簿の `Participant.connId` から
 * ソケットを引くが、**poker の配信は参加者 ID を鍵にした独自のレジストリで行う**
 * （受信者別スナップショットの宛先が参加者 ID だから）。接続レジストリは
 * アダプタの内側に置き、このポートはルーム ID と参加者 ID だけで話す。
 */
import type { OutboundServerMessage, ParticipantFragment, Round } from '@tasuki/poker-core';

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
  /**
   * 受信者別スナップショットを配信する。
   *
   * **#95 S4a で引数が「ルーム」から「ラウンド＋名簿の断片」の 2 つになった。**
   * 保管が名簿（`RoomStore`）とラウンド（`RoundStore`）に割れたので、wire の形を
   * 組む材料もその 2 つから渡す。**wire（`room-state`）の形は変わっていない。**
   * 名簿の断片への写し替え（`displayName` → `name`・`presence` → `connected`）は
   * アプリ層が行う（`poker-core` は `@tasuki/room-core` を知らない・設計正本 D2）。
   */
  broadcastSnapshot(
    roomId: string,
    round: Round,
    participants: readonly ParticipantFragment[],
  ): void;
  /**
   * **受け取るのは `OutboundServerMessage`**（#214・docs/poker/adr/0003 決定 4）。
   * 受信の契約（`ServerMessage`）は `error.code` を任意の非空文字列まで広げているので、
   * そのまま使うと**綴りを誤った `code` が型検査を通る**。
   */
  sendTo(socket: RoomSocket, msg: OutboundServerMessage): void;
}
