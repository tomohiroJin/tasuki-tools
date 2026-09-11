/**
 * メンバーシップ文脈の公開契約（#95・`docs/adr/0017`）。
 *
 * ルーム・参加者・表示名を扱う。ツールのドメイン（timer-core / poker-core）は
 * この文脈に依存しない。ここへ依存してよいのはアプリ層だけである。
 *
 * S1 の時点では表示名の規約だけが住んでいた。ルームと参加者は #95 S4a（#245）で移した。
 */

// ./display-name
export { normalizeDisplayName, nameSkeleton, conflictsWithExisting } from "./display-name.js";

// ./room
export {
  findParticipant,
  addParticipant,
  removeParticipant,
  attachConnection,
  detachConnection,
  hasNoParticipants,
} from "./room.js";
// Participant / Room: 上の関数の引数・戻り値型。ParticipantId ほかは署名から到達する
export type { Participant, Room, ParticipantId, ConnId, RoomCode } from "./room.js";
