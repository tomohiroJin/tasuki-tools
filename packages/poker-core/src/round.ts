// 投票ラウンド状態機械（data-model「Round 状態機械」）
// voting → revealed の遷移と投票操作。すべて純関数 + Result 型（憲法原則 IV）
import { err, ok, type Result } from 'neverthrow';
import type { Card } from './deck';
import type { Room } from './room';

export type RoundError =
  | { code: 'not-voting'; op: 'vote' | 'reveal' }
  | { code: 'not-revealed'; op: 'next-round' };

function withVotes(room: Room, votes: Map<string, Card>): Room {
  return { ...room, round: { ...room.round, votes } };
}

/** 投票（公開前は上書き可。FR-005〜007） */
export function castVote(room: Room, participantId: string, card: Card): Result<Room, RoundError> {
  if (room.round.status !== 'voting') {
    return err({ code: 'not-voting', op: 'vote' });
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

/**
 * 手動公開（FR-009）。
 *
 * #95 S3 で役割とホストを廃止したため、在室者なら誰でも実行できる。
 * `participantId` は呼び出し元が `RoomAction`（`(room, participantId) => Result<Room, RoundError>`）
 * として渡す都合上、引数の形を保つためだけに残る（この関数自身は在室確認をしない）。
 */
export function revealBy(room: Room, _participantId: string): Result<Room, RoundError> {
  if (room.round.status !== 'voting') {
    return err({ code: 'not-voting', op: 'reveal' });
  }
  return ok({ ...room, round: { ...room.round, status: 'revealed' as const } });
}

/**
 * 再投票・次ラウンドの開始（FR-011）。ドメイン上は同一操作で、ラベルは UI の責務。
 * 全票をリセットして voting に戻す。
 *
 * #95 S3 で役割とホストを廃止したため、在室者なら誰でも実行できる。
 * `participantId` は呼び出し元が `RoomAction` として渡す都合上、引数の形を保つためだけに残る。
 */
export function nextRound(room: Room, _participantId: string): Result<Room, RoundError> {
  if (room.round.status !== 'revealed') {
    return err({
      code: 'not-revealed',
      op: 'next-round',
    });
  }
  return ok({ ...room, round: { status: 'voting' as const, votes: new Map() } });
}
