/**
 * メンバーシップ文脈のドメイン（#95 D1・D4）。
 *
 * **ツールを知らない。** ここに timer / poker の語彙を持ち込むと、文脈を上流に立てた
 * 意味が消える。ツール固有の属性（お題の AI 鍵・ドライバー適格）は各ツールの状態が持つ。
 *
 * `presence` の値域に `"idle"` を残しているのは wire の契約（`RoomSchema`）に合わせるため。
 * 代入する経路は無い（S4a 時点で実測 0 件）。
 */

export type ParticipantId = string;
export type ConnId = string;
export type RoomCode = string;

/** 名簿の 1 人。**同一性と在席の模型は S4b（D12・D14）で作り直す。** */
export interface Participant {
  id: ParticipantId;
  displayName: string;
  /** 在席中の接続。S4b で `connections: ReadonlyMap<ConnId, ToolId | null>` になる */
  connId: ConnId | null;
  presence: "online" | "idle" | "offline";
  joinedAt: number;
}

export interface Room {
  code: RoomCode;
  createdAt: number;
  participants: Participant[];
}

export function findParticipant(room: Room, id: ParticipantId): Participant | undefined {
  return room.participants.find((p) => p.id === id);
}

export function addParticipant(room: Room, participant: Participant): Room {
  return { ...room, participants: [...room.participants, participant] };
}

export function removeParticipant(room: Room, id: ParticipantId): Room {
  return { ...room, participants: room.participants.filter((p) => p.id !== id) };
}

function updateParticipant(
  room: Room,
  id: ParticipantId,
  update: (p: Participant) => Participant,
): Room {
  return { ...room, participants: room.participants.map((p) => (p.id === id ? update(p) : p)) };
}

export function attachConnection(room: Room, id: ParticipantId, connId: ConnId): Room {
  return updateParticipant(room, id, (p) => ({ ...p, connId, presence: "online" }));
}

export function detachConnection(room: Room, id: ParticipantId): Room {
  return updateParticipant(room, id, (p) => ({ ...p, connId: null, presence: "offline" }));
}

export function hasNoParticipants(room: Room): boolean {
  return room.participants.length === 0;
}
