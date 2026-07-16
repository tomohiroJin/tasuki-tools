// 参加者一覧（入退室・投票状態をリアルタイム表示。FR-004）
import type { ParticipantView } from '@planning-poker/core';

interface Props {
  participants: ParticipantView[];
  you: string;
}

export function ParticipantList({ participants, you }: Props) {
  return (
    <ul className="participants">
      {participants.map((p) => (
        <li key={p.id} className={p.connected ? '' : 'disconnected'}>
          <span className="name">
            {p.name}
            {p.id === you && '（あなた）'}
          </span>
          {p.isHost && <span className="badge host">ホスト</span>}
          {p.hasVoted && <span className="badge voted">投票済み</span>}
          {!p.connected && <span className="badge">切断中</span>}
        </li>
      ))}
    </ul>
  );
}
