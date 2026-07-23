// 公開後の結果表示（各票・平均・最頻値。FR-010）
import type { ParticipantView, RoundStats, VoteView } from '@planning-poker/core';
import { cardLabel } from './CardHand';

interface Props {
  participants: ParticipantView[];
  votes: VoteView[];
  stats: RoundStats;
}

/** 平均は小数 1 桁に丸めて表示（core は生値を返す。data-model 集計ルール） */
function formatAverage(average: number | null): string {
  if (average === null) return '—（算出不能）';
  return String(Math.round(average * 10) / 10);
}

export function Results({ participants, votes, stats }: Props) {
  const voteByParticipant = new Map(votes.map((v) => [v.participantId, v.card]));
  return (
    <section>
      <h2>結果</h2>
      <ul className="votes">
        {participants.map((p) => {
          const vote = voteByParticipant.get(p.id);
          return (
            <li key={p.id}>
              <span className="name">{p.name}</span>
              {vote ? (
                <span className="card small">{cardLabel(vote)}</span>
              ) : (
                <span className="no-vote">未投票</span>
              )}
            </li>
          );
        })}
      </ul>
      <dl className="stats">
        <div>
          <dt>平均</dt>
          <dd>{formatAverage(stats.average)}</dd>
        </div>
        <div>
          <dt>最頻値</dt>
          <dd>{stats.modes.length === 0 ? '—' : stats.modes.map(cardLabel).join(' / ')}</dd>
        </div>
      </dl>
    </section>
  );
}
