// ルーム画面: 未参加なら参加フォーム、参加後は招待リンク + 参加者一覧 + 投票（US1/US2/US4）
import { useEffect, useRef, useState } from 'react';
import type { RoomStateMessage } from '@tasuki/poker-core';
import { CardHand } from '../components/CardHand';
import { NameForm } from '../components/NameForm';
import { ParticipantList } from '../components/ParticipantList';
import { Results } from '../components/Results';
import type { PokerSync } from '../hooks/useSync';
import { roomPath, topPath } from '../router';
import { clearIdentity, loadIdentity } from '../storage';
import { joinRetryDelayMs } from '../join-retry';

interface Props {
  roomId: string;
  sync: PokerSync;
}

function JoinForm({ roomId, sync, notice }: Props & { notice: string | null }) {
  return (
    <main className="page">
      <h1>ルームに参加</h1>
      {/* 混雑で弾かれている間、この画面には何の手がかりも出ていなかった（#147）。 */}
      {notice && (
        <p className="error-note" role="status">
          {notice}
        </p>
      )}
      <NameForm
        submitLabel="参加する"
        placeholder="例: はなこ"
        onSubmit={(name) => sync.joinRoom(roomId, name)}
        disabled={sync.status !== 'open'}
      />
    </main>
  );
}

/** 非セキュアオリジン（http の LAN 利用等）向けのフォールバックコピー */
function legacyCopy(text: string): void {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand('copy');
  textarea.remove();
  if (!ok) throw new Error('copy failed');
}

function InviteLink({ roomId }: { roomId: string }) {
  const [copyState, setCopyState] = useState<'idle' | 'done' | 'failed'>('idle');
  const url = `${location.origin}${roomPath(roomId)}`;

  const copy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        legacyCopy(url);
      }
      setCopyState('done');
    } catch {
      try {
        legacyCopy(url);
        setCopyState('done');
      } catch {
        setCopyState('failed'); // URL は画面に出ているので手動選択で代替できる
      }
    }
    setTimeout(() => setCopyState('idle'), 2000);
  };

  return (
    <div className="invite">
      <span className="invite-url">{url}</span>
      <button type="button" onClick={copy}>
        {copyState === 'done' && 'コピーしました'}
        {copyState === 'failed' && 'コピーできません（URL を選択してください）'}
        {copyState === 'idle' && '招待リンクをコピー'}
      </button>
    </div>
  );
}

export function RoomPage({ roomId, sync }: Props) {
  // 保存済みトークンでの自動復帰（US4 / FR-013）。接続が開くたびに 1 回だけ試みる。
  // 判定は「この接続で joined 済みか」で行う（切断前の古い snapshot では判定しない）
  const attemptedRef = useRef(false);
  useEffect(() => {
    if (sync.status !== 'open') {
      attemptedRef.current = false;
      return;
    }
    if (attemptedRef.current || sync.joinedThisConnection) return;
    if (sync.error?.code === 'room-not-found') return; // 消滅したルームへの再試行はしない
    const stored = loadIdentity(roomId);
    if (stored) {
      attemptedRef.current = true;
      sync.joinRoom(roomId, stored.name, stored.token);
      return;
    }
    // 保存が無い＝招待リンクで初めて来た人。**参加を試みる前に**ルームの生死を尋ねる（#76 J-1）。
    // これが無いと、終了したルームのリンクでも参加フォームが出て、名前を入れて
    // 送信して初めて「見つかりません」に変わる。無ければ room-not-found が返り、
    // 下のエラー表示へ切り替わる。生きていれば無音で、参加フォームがそのまま残る。
    attemptedRef.current = true;
    sync.checkRoom(roomId);
  }, [sync, roomId]);

  // 混雑で弾かれたら、待ってから入り直す（#147）。
  //
  // #103 でレート制限が IP 単位になり、同一 NAT の利用者はバケツを共有する。
  // バースト容量を超えた人は `rate-limited` を受けるが、上の `attemptedRef` は
  // 接続ごとに 1 回しか試みないため、**接続済み・未入室のまま滞留**していた。
  // **即時に送り直してはならない** — 待ち時間とばらつきは join-retry.ts が決める。
  const rateLimitAttemptRef = useRef(0);
  const [retryNotice, setRetryNotice] = useState<string | null>(null);
  useEffect(() => {
    if (sync.joinedThisConnection) {
      // 入れたので数え直す。案内も消す。
      rateLimitAttemptRef.current = 0;
      setRetryNotice(null);
      return;
    }
    if (sync.error?.code !== 'rate-limited') return;
    const attempt = rateLimitAttemptRef.current + 1;
    const delay = joinRetryDelayMs(attempt);
    if (delay === null) {
      // 使い切った。**数え直さない**（数え直すと諦めたはずが送り続ける形になる）。
      setRetryNotice('混雑が続いています。時間をおいてから再読込してください');
      return;
    }
    rateLimitAttemptRef.current = attempt;
    setRetryNotice('混み合っています。自動で入り直しています…');
    const timer = setTimeout(() => {
      const stored = loadIdentity(roomId);
      if (stored) sync.joinRoom(roomId, stored.name, stored.token);
      else sync.checkRoom(roomId);
    }, delay);
    return () => clearTimeout(timer);
  }, [sync, roomId]);

  // 消滅したルームのトークンは破棄する（再試行ループ防止）
  useEffect(() => {
    if (sync.error?.code === 'room-not-found') clearIdentity(roomId);
  }, [sync.error, roomId]);

  // room-not-found はページ全体をエラー表示に（FR-015 / US1-AS3）
  if (sync.error?.code === 'room-not-found') {
    return (
      <main className="page">
        <h1>ルームが見つかりません</h1>
        <p>ルームは終了したか、リンクが正しくない可能性があります。</p>
        <a href={topPath()}>トップへ戻る</a>
      </main>
    );
  }

  const { snapshot } = sync;
  if (!snapshot || snapshot.roomId !== roomId) {
    return <JoinForm roomId={roomId} sync={sync} notice={retryNotice} />;
  }

  const isHost = snapshot.participants.find((p) => p.id === snapshot.you)?.isHost ?? false;
  const isVoting = snapshot.round.status === 'voting';

  return (
    <main className="page room">
      <header>
        <h1>プランニングポーカー</h1>
        <InviteLink roomId={roomId} />
      </header>
      {sync.error && (
        <p className="error-note" role="alert">
          {sync.error.message}
          <button type="button" className="secondary" onClick={sync.clearError}>
            閉じる
          </button>
        </p>
      )}
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
  // 切断・再接続中は操作を受け付けない（送信しても届かないため）
  const offline = sync.status !== 'open';
  return (
    <section>
      <h2>あなたのカード</h2>
      <CardHand selected={snapshot.yourVote} onSelect={sync.vote} disabled={offline} />
      {isHost && (
        <p>
          <button type="button" className="secondary" onClick={sync.reveal} disabled={offline}>
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
  const offline = sync.status !== 'open';

  return (
    <>
      <Results participants={snapshot.participants} votes={votes} stats={stats} />
      {isHost && (
        <p className="round-actions">
          {/* 再投票と次ラウンドはドメイン上同一操作（next-round）。ラベルのみ区別（FR-011） */}
          <button type="button" onClick={sync.nextRound} disabled={offline}>
            再投票
          </button>
          <button type="button" className="secondary" onClick={sync.nextRound} disabled={offline}>
            次のラウンドへ
          </button>
        </p>
      )}
    </>
  );
}
