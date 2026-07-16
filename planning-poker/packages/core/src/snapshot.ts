// 受信者別スナップショット投影（research R1）
// 秘匿はここで構造的に保証する: token は常に除外、voting 中の他者票は hasVoted のみ（SC-004）
import type { RoomStateMessage, VoteView } from './protocol';
import type { Room } from './room';
import { computeStats } from './stats';

/** Room → 受信者（viewerId）向けの room-state メッセージ */
export function snapshotFor(room: Room, viewerId: string): RoomStateMessage {
  const participants = room.participants.map((p) => ({
    id: p.id,
    name: p.name,
    isHost: p.isHost,
    connected: p.connected,
    hasVoted: room.round.votes.has(p.id),
  }));

  const round: RoomStateMessage['round'] = (() => {
    if (room.round.status === 'voting') {
      // voting 中: 他者の選択値はいかなるフィールドにも含めない（FR-006）
      return { status: 'voting' as const };
    }
    const votes: VoteView[] = [...room.round.votes.entries()].map(([participantId, card]) => ({
      participantId,
      card,
    }));
    return { status: 'revealed' as const, votes, stats: computeStats(votes.map((v) => v.card)) };
  })();

  return {
    type: 'room-state',
    roomId: room.id,
    you: viewerId,
    participants,
    round,
    yourVote: room.round.votes.get(viewerId) ?? null,
  };
}
