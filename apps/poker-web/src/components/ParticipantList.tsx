// 参加者一覧（入退室・投票状態をリアルタイム表示。FR-004）
// 投票済みは「伏せたカード」で表現し、公開で同じ札がその場でめくれて表の値を見せる（#348）
import type { CSSProperties } from 'react';
import type { Card, ParticipantView } from '@tasuki/poker-core';
import { cardLabel } from './CardHand';
import { holdsSeatCard } from '../room-view';
import { SPECTATOR_BADGE } from '../spectator-copy';

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
  // 投票者を先に、見学者を後に並べる（それぞれの中は元の順・#419）
  const ordered = [...participants.filter((p) => !p.spectator), ...participants.filter((p) => p.spectator)];
  // 札のめくれる順は札を出す席だけで数える（見学者の行が間に居ても 0 から続く）
  let seatOrder = 0;
  return (
    <ul className="participants">
      {ordered.map((p) => {
        const vote = votes?.get(p.id);
        // 見学者は札を持たない。ただし開票後に票が残っているときは、集計に入った札を隠さない
        const showCard = holdsSeatCard(p, votes);
        const order = showCard ? seatOrder++ : 0;
        return (
          <li key={p.id} className={p.connected ? '' : 'disconnected'}>
            {showCard && <SeatCard hasVoted={p.hasVoted} vote={vote} order={order} />}
            <span className="name">
              {p.name}
              {p.id === you && <span className="you-mark">（あなた）</span>}
            </span>
            {p.spectator && <span className="badge spectator">{SPECTATOR_BADGE}</span>}
            {/* 公開後は札が値を見せるので「投票済み」は出さない。票が無い席だけ印を出す。
                印は見える字だけにする（札の `aria-label` が既に「未投票」を読み上げるので、2 回読ませない・#348 のレビュー）。
                見学者は投票しないので「未投票」は出さない */}
            {!p.spectator &&
              (votes === null
                ? p.hasVoted && <span className="badge voted">投票済み</span>
                : !vote && (
                    <span className="no-vote" aria-hidden="true">
                      未投票
                    </span>
                  ))}
            {!p.connected && <span className="badge">切断中</span>}
          </li>
        );
      })}
    </ul>
  );
}
