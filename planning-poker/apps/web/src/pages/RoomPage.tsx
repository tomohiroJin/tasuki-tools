// ルーム画面: 未参加なら参加フォーム、参加後は招待リンク + 参加者一覧 + 投票（US1/US2）
import { useState, type FormEvent } from 'react';
import type { RoomStateMessage } from '@planning-poker/core';
import { CardHand } from '../components/CardHand';
import { ParticipantList } from '../components/ParticipantList';
import { Results } from '../components/Results';
import type { PokerSync } from '../hooks/useSync';

interface Props {
  roomId: string;
  sync: PokerSync;
}

function JoinForm({ roomId, sync }: Props) {
  const [name, setName] = useState('');
  const canSubmit = name.trim().length >= 1 && name.trim().length <= 24;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (canSubmit) sync.joinRoom(roomId, name.trim());
  };

  return (
    <main className="page">
      <h1>ルームに参加</h1>
      <form onSubmit={handleSubmit} className="stack">
        <label>
          あなたの名前
          <input
            type="text"
            value={name}
            maxLength={24}
            placeholder="例: はなこ"
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </label>
        <button type="submit" disabled={!canSubmit}>
          参加する
        </button>
      </form>
    </main>
  );
}

function InviteLink({ roomId }: { roomId: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${location.origin}/poker/room/${roomId}`;

  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="invite">
      <span className="invite-url">{url}</span>
      <button type="button" onClick={copy}>
        {copied ? 'コピーしました' : '招待リンクをコピー'}
      </button>
    </div>
  );
}

export function RoomPage({ roomId, sync }: Props) {
  // room-not-found はページ全体をエラー表示に（FR-015 / US1-AS3）
  if (sync.error?.code === 'room-not-found') {
    return (
      <main className="page">
        <h1>ルームが見つかりません</h1>
        <p>ルームは終了したか、リンクが正しくない可能性があります。</p>
        <a href="/poker/">トップへ戻る</a>
      </main>
    );
  }

  const { snapshot } = sync;
  if (!snapshot || snapshot.roomId !== roomId) {
    return <JoinForm roomId={roomId} sync={sync} />;
  }

  const isHost = snapshot.participants.find((p) => p.id === snapshot.you)?.isHost ?? false;
  const isVoting = snapshot.round.status === 'voting';

  return (
    <main className="page room">
      <header>
        <h1>プランニングポーカー</h1>
        <InviteLink roomId={roomId} />
      </header>
      <section>
        <h2>参加者（{snapshot.participants.length}人）</h2>
        <ParticipantList participants={snapshot.participants} you={snapshot.you} />
      </section>
      {isVoting ? (
        <VotingSection snapshot={snapshot} sync={sync} isHost={isHost} />
      ) : (
        <RevealedSection snapshot={snapshot} sync={sync} isHost={isHost} />
      )}
    </main>
  );
}

function VotingSection({
  snapshot,
  sync,
  isHost,
}: {
  snapshot: RoomStateMessage;
  sync: PokerSync;
  isHost: boolean;
}) {
  return (
    <section>
      <h2>あなたのカード</h2>
      <CardHand selected={snapshot.yourVote} onSelect={sync.vote} disabled={false} />
      {isHost && (
        <p>
          <button type="button" className="secondary" onClick={sync.reveal}>
            票を公開する
          </button>
        </p>
      )}
    </section>
  );
}

function RevealedSection({
  snapshot,
  sync,
  isHost,
}: {
  snapshot: RoomStateMessage;
  sync: PokerSync;
  isHost: boolean;
}) {
  if (snapshot.round.status !== 'revealed') return null;
  const { votes, stats } = snapshot.round;

  return (
    <>
      <Results participants={snapshot.participants} votes={votes} stats={stats} />
      {isHost && (
        <p className="round-actions">
          {/* 再投票と次ラウンドはドメイン上同一操作（next-round）。ラベルのみ区別（FR-011） */}
          <button type="button" onClick={sync.nextRound}>
            再投票
          </button>
          <button type="button" className="secondary" onClick={sync.nextRound}>
            次のラウンドへ
          </button>
        </p>
      )}
    </>
  );
}
