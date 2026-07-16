// ルーム画面: 未参加なら参加フォーム、参加後は招待リンク + 参加者一覧（US1）
import { useState, type FormEvent } from 'react';
import { ParticipantList } from '../components/ParticipantList';
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
      {/* 投票 UI（CardHand）は US2、結果表示は US3 で実装 */}
    </main>
  );
}
