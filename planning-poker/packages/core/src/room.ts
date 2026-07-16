// Room 集約（data-model「Room」「Participant」）
// ドメイン操作は neverthrow の Result で表現する（憲法原則 IV）
import { err, ok, type Result } from 'neverthrow';
import type { Card } from './deck';

export interface Participant {
  id: string;
  /** 再接続用トークン。本人以外へ配信してはならない（snapshot が除外する） */
  token: string;
  name: string;
  isHost: boolean;
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
  nextJoinOrder: number;
}

export type RoomError = { code: 'invalid-name'; message: string };

export interface ParticipantIds {
  participantId: string;
  token: string;
}

const NAME_MAX_LENGTH = 24;

function validateName(raw: string): Result<string, RoomError> {
  const name = raw.trim();
  if (name.length < 1 || name.length > NAME_MAX_LENGTH) {
    return err({
      code: 'invalid-name',
      message: `名前は 1〜${NAME_MAX_LENGTH} 文字で入力してください`,
    });
  }
  return ok(name);
}

export interface RoomUpdate {
  room: Room;
  participant: Participant;
}

/** ルーム作成（作成者がホスト。ラウンドは voting で初期化。FR-001） */
export function createRoom(
  roomId: string,
  hostName: string,
  ids: ParticipantIds,
): Result<RoomUpdate, RoomError> {
  return validateName(hostName).map((name) => {
    const participant: Participant = {
      id: ids.participantId,
      token: ids.token,
      name,
      isHost: true,
      connected: true,
      joinOrder: 0,
    };
    const room: Room = {
      id: roomId,
      participants: [participant],
      round: { status: 'voting', votes: new Map() },
      nextJoinOrder: 1,
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

/**
 * 切断処理（US4）。connected=false にし、票は保持する。
 * 切断者がホストなら、接続中の参加者のうち joinOrder 最小の者へ権限を移す（FR-012 / research R6）。
 */
export function markDisconnected(room: Room, participantId: string): Room {
  const leaving = room.participants.find((p) => p.id === participantId);
  if (!leaving) return room;

  let updated = updateParticipant(room, participantId, (p) => ({
    ...p,
    connected: false,
    isHost: false,
  }));

  if (leaving.isHost) {
    const successor = updated.participants
      .filter((p) => p.connected)
      .reduce<Participant | null>(
        (min, p) => (min === null || p.joinOrder < min.joinOrder ? p : min),
        null,
      );
    if (successor) {
      updated = updateParticipant(updated, successor.id, (p) => ({ ...p, isHost: true }));
    }
  }

  return updated;
}

/** 再接続による復帰（FR-013）。票・joinOrder は保持され、ホスト権限は自動では戻らない */
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
    const participant: Participant = {
      id: ids.participantId,
      token: ids.token,
      name,
      isHost: false,
      connected: true,
      joinOrder: room.nextJoinOrder,
    };
    const updated: Room = {
      ...room,
      participants: [...room.participants, participant],
      nextJoinOrder: room.nextJoinOrder + 1,
    };
    return { room: updated, participant };
  });
}
