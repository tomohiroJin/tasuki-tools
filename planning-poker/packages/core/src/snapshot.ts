// 受信者別スナップショット投影（research R1）
// 秘匿はここで構造的に保証する: token は常に除外、voting 中の他者票は hasVoted のみ（SC-004）
import type { RoomStateMessage, RoundStats, VoteView } from './protocol';
import type { Room } from './room';

/** revealed ラウンドの集計。本実装は US3（T036）で stats.ts に置き換える */
function computeStats(_votes: VoteView[]): RoundStats {
  return { average: null, modes: [] };
}

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
    return { status: 'revealed' as const, votes, stats: computeStats(votes) };
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
