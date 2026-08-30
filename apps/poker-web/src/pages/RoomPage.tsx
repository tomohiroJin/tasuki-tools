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
import { planJoinRetry } from '../join-retry-plan';

interface Props {
  roomId: string;
  sync: PokerSync;
}

function JoinForm({
  roomId,
  sync,
  notice,
  onNameSubmitted,
}: Props & { notice: string | null; onNameSubmitted: (name: string) => void }) {
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
        onSubmit={(name) => {
          // 混雑で弾かれたときに**この名前で**入り直せるよう控える（#147）。
          // 保存（saveIdentity）は joined を受け取ってからなので、初めて来た人が
          // 弾かれた時点では保存が無く、控えておかないと入り直せない。
          onNameSubmitted(name);
          sync.joinRoom(roomId, name);
        }}
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
  // 入力された名前。保存（saveIdentity）は joined を受け取ってからなので、
  // 初めて来た人が弾かれた時点では保存が無い。控えておかないと入り直せない。
  const typedNameRef = useRef<string | null>(null);
  // 効果の依存に `sync` そのものを入れないための持ち手（下記）。
  const syncRef = useRef(sync);
  syncRef.current = sync;

  // 入室できたら数え直す。
  useEffect(() => {
    if (!sync.joinedThisConnection) return;
    rateLimitAttemptRef.current = 0;
    setRetryNotice(null);
  }, [sync.joinedThisConnection]);

  // **接続し直したら数え直す。** 前の接続で諦めていても、新しい接続では改めて
  // 入り直しを試みてよい（timer 側の handleReconnected と揃える）。これが無いと、
  // 回線が切れて戻ってきた新しい接続で、一度も再試行しないまま諦め表示に戻る。
  const wasOpenRef = useRef(sync.status === 'open');
  useEffect(() => {
    const isOpen = sync.status === 'open';
    if (isOpen && !wasOpenRef.current) {
      rateLimitAttemptRef.current = 0;
      setRetryNotice(null);
    }
    wasOpenRef.current = isOpen;
  }, [sync.status]);

  useEffect(() => {
    // **依存は `sync.error` だけにする。** `sync` そのものを依存に置くと、
    // 再接続で `status` などが変わるたびに効果が畳まれて張り直され、
    // **一度も送り直さないまま試行回数だけを使い切る**（#147 の敵対的検証で判明）。
    // `sync.error` はエラーごとに新しいオブジェクトなので、1 回の拒否につき 1 回走る。
    if (sync.error?.code !== 'rate-limited') return;
    const stored = loadIdentity(roomId);
    const name = stored?.name ?? typedNameRef.current;
    const plan = planJoinRetry(rateLimitAttemptRef.current, name !== null);
    setRetryNotice(plan.notice);
    // 使い切った。**数え直さない**（数え直すと諦めたはずが送り続ける形になる）。
    if (plan.kind === 'give-up') return;
    rateLimitAttemptRef.current = plan.attempt;
    const timer = setTimeout(() => {
      const s = syncRef.current;
      // 名前があれば入り直す。無ければルームの生死だけを尋ね直す（#76 J-1 と同じ扱い）。
      if (name !== null) s.joinRoom(roomId, name, stored?.token);
      else s.checkRoom(roomId);
    }, plan.delayMs);
    return () => clearTimeout(timer);
  }, [sync.error, roomId]);

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
    return (
      <JoinForm
        roomId={roomId}
        sync={sync}
        notice={retryNotice}
        onNameSubmitted={(name) => (typedNameRef.current = name)}
      />
    );
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
