// 参加者一覧（入退室・投票状態をリアルタイム表示。FR-004）
// 投票済みは「伏せたカード」で表現し、公開で同じ札がその場でめくれて表の値を見せる（#348）
import type { CSSProperties } from 'react';
import type { Card, ParticipantView } from '@tasuki/poker-core';
import { cardLabel } from './CardHand';

interface Props {
  participants: ParticipantView[];
  you: string;
  /** 公開後の票（参加者 ID → 札）。`null` は投票中 */
  votes: ReadonlyMap<string, Card> | null;
}

/**
 * 席の札。回る軸・裏・表の 3 枚で、公開は `.revealed` が付くだけ。
 * 札の要素を作り直すと CSS の transition の起点が無く、めくれずに表が出るので、key に状態を混ぜない。
 */
function SeatCard({ hasVoted, vote, order }: { hasVoted: boolean; vote: Card | undefined; order: number }) {
  return (
    <span
      className={`seat-card${hasVoted ? ' facedown' : ''}${vote ? ' revealed' : ''}`}
      role="img"
      aria-label={vote ? cardLabel(vote) : hasVoted ? '投票済み' : '未投票'}
      style={{ '--seat-order': order } as CSSProperties}
    >
      <span className="seat-card-rotor">
        <span className="seat-card-back" />
        <span className="seat-card-face">{vote ? cardLabel(vote) : ''}</span>
      </span>
    </span>
  );
}

export function ParticipantList({ participants, you, votes }: Props) {
  return (
    <ul className="participants">
      {participants.map((p, order) => {
        const vote = votes?.get(p.id);
        return (
          <li key={p.id} className={p.connected ? '' : 'disconnected'}>
            <SeatCard hasVoted={p.hasVoted} vote={vote} order={order} />
            <span className="name">
              {p.name}
              {p.id === you && <span className="you-mark">（あなた）</span>}
            </span>
            {/* 公開後は札が値を見せるので「投票済み」は出さない。票が無い席だけ印を出す */}
            {votes === null
              ? p.hasVoted && <span className="badge voted">投票済み</span>
              : !vote && <span className="no-vote">未投票</span>}
            {!p.connected && <span className="badge">切断中</span>}
          </li>
        );
      })}
    </ul>
  );
}
