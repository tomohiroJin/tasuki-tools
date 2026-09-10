// 受信者別スナップショット投影（research R1）
// 秘匿はここで構造的に保証する: token は常に除外、voting 中の他者票は hasVoted のみ（SC-004）
//
// **#95 S4a で入力が「ルーム」から「ラウンド＋名簿の断片」の 2 つになった。**
// wire（`room-state` の形）は変えていない —— 組み立てる材料の出所が変わっただけである。
import type { RoomStateMessage, VoteView } from './protocol';
import type { Round } from './round';
import { computeStats } from './stats';

/**
 * 名簿の断片（`room-state` の participants に要るぶんだけ）。
 *
 * **`@tasuki/room-core` を import しない**（理由は `round.ts` の `VoterView` と同じ）。
 * `name` は room-core の `displayName`、`connected` は `presence !== "offline"` に対応し、
 * 変換はアプリ層が行う。**トークンは受け取らない** —— 受け取らなければ漏らせない。
 */
export interface ParticipantFragment {
  id: string;
  name: string;
  connected: boolean;
}

/**
 * 受信者に依存しない共有部分（参加者一覧・ラウンド・集計）を 1 回だけ構築し、
 * 受信者ごとの差分（you / yourVote）だけを組み立てるビルダーを返す。
 * ルーム全体への配信（broadcast）で集計や投影を受信者数ぶん再計算しないための入口
 */
export function createSnapshotBuilder(
  roomId: string,
  round: Round,
  participants: readonly ParticipantFragment[],
): (viewerId: string) => RoomStateMessage {
  const views = participants.map((p) => ({
    id: p.id,
    name: p.name,
    connected: p.connected,
    hasVoted: round.votes.has(p.id),
  }));

  const roundView: RoomStateMessage['round'] = (() => {
    if (round.status === 'voting') {
      // voting 中: 他者の選択値はいかなるフィールドにも含めない（FR-006）
      return { status: 'voting' as const };
    }
    const votes: VoteView[] = [...round.votes.entries()].map(([participantId, card]) => ({
      participantId,
      card,
    }));
    return { status: 'revealed' as const, votes, stats: computeStats(votes.map((v) => v.card)) };
  })();

  return (viewerId) => ({
    type: 'room-state',
    roomId,
    you: viewerId,
    participants: views,
    round: roundView,
    yourVote: round.votes.get(viewerId) ?? null,
  });
}
