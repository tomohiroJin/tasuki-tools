// 参加者一覧（入退室・投票状態をリアルタイム表示。FR-004）
// 投票済みは「伏せたカード」で表現する（カードテーブルのメタファー）
import type { ParticipantView } from '@tasuki/poker-core';

interface Props {
  participants: ParticipantView[];
  you: string;
}

function SeatCard({ hasVoted }: { hasVoted: boolean }) {
  return (
    <span
      className={`seat-card${hasVoted ? ' facedown' : ''}`}
      role="img"
      aria-label={hasVoted ? '投票済み' : '未投票'}
    />
  );
}

export function ParticipantList({ participants, you }: Props) {
  return (
    <ul className="participants">
      {participants.map((p) => (
        <li key={p.id} className={p.connected ? '' : 'disconnected'}>
          <SeatCard hasVoted={p.hasVoted} />
          <span className="name">
            {p.name}
            {p.id === you && <span className="you-mark">（あなた）</span>}
          </span>
          {p.isHost && <span className="badge host">ホスト</span>}
          {p.hasVoted && <span className="badge voted">投票済み</span>}
          {!p.connected && <span className="badge">切断中</span>}
        </li>
      ))}
    </ul>
  );
}
