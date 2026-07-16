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
