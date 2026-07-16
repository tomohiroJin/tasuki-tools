// 投票ラウンド状態機械（data-model「Round 状態機械」）
// voting → revealed の遷移と投票操作。すべて純関数 + Result 型（憲法原則 IV）
import { err, ok, type Result } from 'neverthrow';
import type { Card } from './deck';
import type { Room } from './room';

export type RoundError = {
  code: 'not-voting' | 'not-revealed' | 'not-host';
  message: string;
};

function withVotes(room: Room, votes: Map<string, Card>): Room {
  return { ...room, round: { ...room.round, votes } };
}

/** 投票（公開前は上書き可。FR-005〜007） */
export function castVote(room: Room, participantId: string, card: Card): Result<Room, RoundError> {
  if (room.round.status !== 'voting') {
    return err({ code: 'not-voting', message: '現在は投票を受け付けていません' });
  }
  const votes = new Map(room.round.votes);
  votes.set(participantId, card);
  return ok(withVotes(room, votes));
}

/** 自動公開の判定: 接続中の全参加者（途中参加者を含む）が投票済み（FR-008, Clarification Q3） */
export function shouldAutoReveal(room: Room): boolean {
  if (room.round.status !== 'voting') return false;
  const connected = room.participants.filter((p) => p.connected);
  return connected.length > 0 && connected.every((p) => room.round.votes.has(p.id));
}

/** 条件成立時のみ revealed へ遷移させる（不成立ならそのまま返す） */
export function applyAutoReveal(room: Room): Room {
  if (!shouldAutoReveal(room)) return room;
  return { ...room, round: { ...room.round, status: 'revealed' } };
}

/** ホストによる手動公開（FR-009） */
export function revealBy(room: Room, participantId: string): Result<Room, RoundError> {
  const actor = room.participants.find((p) => p.id === participantId);
  if (!actor?.isHost) {
    return err({ code: 'not-host', message: 'ホストのみが公開できます' });
  }
  if (room.round.status !== 'voting') {
    return err({ code: 'not-voting', message: 'すでに公開されています' });
  }
  return ok({ ...room, round: { ...room.round, status: 'revealed' } });
}
