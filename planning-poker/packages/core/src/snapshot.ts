// 受信者別スナップショット投影（research R1）
// 秘匿はここで構造的に保証する: token は常に除外、voting 中の他者票は hasVoted のみ（SC-004）
import type { RoomStateMessage } from './protocol';
import type { Room } from './room';

/** Room → 受信者（viewerId）向けの room-state メッセージ */
export function snapshotFor(room: Room, viewerId: string): RoomStateMessage {
  const participants = room.participants.map((p) => ({
    id: p.id,
    name: p.name,
    isHost: p.isHost,
    connected: p.connected,
    hasVoted: room.round.votes.has(p.id),
  }));

  return {
    type: 'room-state',
    roomId: room.id,
    you: viewerId,
    participants,
    // revealed 投影（votes + stats）は US2/US3 で実装
    round: { status: 'voting' },
    yourVote: room.round.votes.get(viewerId) ?? null,
  };
}
