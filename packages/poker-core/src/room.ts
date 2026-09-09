// Room 集約（data-model「Room」「Participant」）
// ドメイン操作は neverthrow の Result で表現する（憲法原則 IV）
import { err, ok, type Result } from 'neverthrow';
import type { Card } from './deck';

export interface Participant {
  id: string;
  /** 再接続用トークン。本人以外へ配信してはならない（snapshot が除外する） */
  token: string;
  name: string;
  connected: boolean;
  joinOrder: number;
}

export interface Round {
  status: 'voting' | 'revealed';
  /** participantId → 選択カード */
  votes: Map<string, Card>;
}

export interface Room {
  id: string;
  participants: Participant[];
  round: Round;
}

export type RoomError = { code: 'invalid-name' };

export interface ParticipantIds {
  participantId: string;
  token: string;
}

/** 名前ルールの単一情報源（プロトコルスキーマ・画面のフォームもこれを参照する） */
export const NAME_MAX_LENGTH = 24;

export function isValidName(raw: string): boolean {
  const name = raw.trim();
  return name.length >= 1 && name.length <= NAME_MAX_LENGTH;
}

function validateName(raw: string): Result<string, RoomError> {
  if (!isValidName(raw)) {
    return err({ code: 'invalid-name' });
  }
  return ok(raw.trim());
}

export interface RoomUpdate {
  room: Room;
  participant: Participant;
}

/** ルーム作成（ラウンドは voting で初期化。FR-001） */
export function createRoom(
  roomId: string,
  displayName: string,
  ids: ParticipantIds,
): Result<RoomUpdate, RoomError> {
  return validateName(displayName).map((name) => {
    const participant: Participant = {
      id: ids.participantId,
      token: ids.token,
      name,
      connected: true,
      joinOrder: 0,
    };
    const room: Room = {
      id: roomId,
      participants: [participant],
      round: { status: 'voting', votes: new Map() },
    };
    return { room, participant };
  });
}

/** token から参加者を特定する（再接続時の同一性判定。FR-013 / research R3） */
export function findParticipantByToken(room: Room, token: string): Participant | undefined {
  return room.participants.find((p) => p.token === token);
}

function updateParticipant(
  room: Room,
  participantId: string,
  update: (p: Participant) => Participant,
): Room {
  return {
    ...room,
    participants: room.participants.map((p) => (p.id === participantId ? update(p) : p)),
  };
}

/** 切断処理（US4）。connected=false にし、票は保持する。 */
export function markDisconnected(room: Room, participantId: string): Room {
  const leaving = room.participants.find((p) => p.id === participantId);
  if (!leaving) return room;

  return updateParticipant(room, participantId, (p) => ({
    ...p,
    connected: false,
  }));
}

/** 再接続による復帰（FR-013）。票・joinOrder は保持される */
export function markConnected(room: Room, participantId: string): Room {
  return updateParticipant(room, participantId, (p) => ({ ...p, connected: true }));
}

/** ルーム参加（同名許容・joinOrder 採番。FR-003） */
export function joinRoom(
  room: Room,
  rawName: string,
  ids: ParticipantIds,
): Result<RoomUpdate, RoomError> {
  return validateName(rawName).map((name) => {
    // 参加者は削除されない（切断は connected フラグのみ）ため、最大値 +1 で単調増加が保てる
    const joinOrder = Math.max(-1, ...room.participants.map((p) => p.joinOrder)) + 1;
    const participant: Participant = {
      id: ids.participantId,
      token: ids.token,
      name,
      connected: true,
      joinOrder,
    };
    const updated: Room = {
      ...room,
      participants: [...room.participants, participant],
    };
    return { room: updated, participant };
  });
}
