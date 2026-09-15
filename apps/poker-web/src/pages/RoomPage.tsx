// ルーム画面: 入室が成立するまでは待機、成立後は招待リンク + 参加者一覧 + 投票（US1/US2/US4）
//
// **ここで名前は聞かない**（#95 S5c・R9）。名乗る場所は玄関に 1 つだけあり、
// 端末に同一性が無いままここへ来た人は玄関の参加画面へ送り返す。
import { useEffect, useRef, useState } from 'react';
import type { RoomStateMessage } from '@tasuki/poker-core';
import { CardHand } from '../components/CardHand';
import { ErrorNote } from '../components/ErrorNote';
import { ParticipantList } from '../components/ParticipantList';
import { Results } from '../components/Results';
import type { PokerSync } from '../hooks/useSync';
import { hubPathFor, redirectTo } from '../router';
import { planJoinRetry } from '../join-retry-plan';

interface Props {
  roomId: string;
  sync: PokerSync;
}

/**
 * 入室が成立するまでの待機画面。
 *
 * **撤去前はここが参加フォームだった**（#95 S5c・R9）。名乗りは玄関に 1 つだけになり、
 * ここへ来る人は端末に同一性を持っている —— 画面が待つのは `joined` と最初の
 * `room-state` だけである。
 *
 * それでも**告知の口は残す**。混雑で弾かれている間（#147）とサーバーのエラー（#217）を
 * ここで落とすと、待っている人には何も起きていないようにしか見えない。
 */
function JoiningView({ sync, notice }: { sync: PokerSync; notice: string | null }) {
  return (
    <main className="page">
      <h1>ルームに参加しています</h1>
      {/* 混雑で弾かれている間、この画面には何の手がかりも出ていなかった（#147）。 */}
      {notice && (
        <p className="error-note" role="status">
          {notice}
        </p>
      )}
      {/* 入室前にもサーバーのエラーを伝える（#217）。ここが無いと、未知の code も
          server-busy も画面から消える。rate-limited は上の notice が受け持つので
          ErrorNote 側で出さない（二重表示の回避） */}
      <ErrorNote error={sync.error} onClose={sync.clearError} />
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

/**
 * 招待リンク。**配るのは選択画面（ハブ）の URL である**（#95 S5b・D11）。
 *
 * S5a で参加用 URL は `/?room=CODE` に決まった（`docs/adr/0018` 決定 2）。poker だけが
 * 旧い `/poker/room/<id>` を配っていると、受け取った人は選択画面を通らずに poker へ
 * 着地し、**ツールを選び直せない**。組み立ては `@tasuki/sync-client` に 1 つあり、
 * **画面は同期フックから受け取る**（画面は同期クライアントを直接 import しない）。
 */
function InviteLink({ url }: { url: string }) {
  const [copyState, setCopyState] = useState<'idle' | 'done' | 'failed'>('idle');

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
  // 端末に同一性が無ければ、**玄関の参加画面へ送り返す**（#95 S5c・R9）。
  //
  // **接続を待たない。** timer は同じ決定を mount 時の効果で、接続状態を見ずに適用する
  // （`apps/timer-web/src/sync/use-timer-sync.ts` の入口の効果）。ここだけ WS の確立を
  // 待つと、同じ URL の形に対して 2 つの道具の挙動が割れるうえ、サーバーが落ちている間は
  // 入室を試みられないのに「ルームに参加しています」を見せ続けることになる。
  //
  // 名乗る場所はハブに 1 つだけあり、ここでもう一度聞かない。**コードは落とさない**
  // —— 落とすと、招待リンクやブックマークから来た人が入りたかったルームを失う。
  //
  // **ルームの消滅が分かるのは名乗った後である。** 玄関は先に名乗らせてから参加を試み、
  // 失敗して初めて不在を告げる（`apps/landing/src/screens/JoinRoom.tsx`）。
  // 「名前を入れる前に知らせる」という #76 J-1 の性質は、いまハブ側の宿題である（Issue #274）。
  //
  // 守りが 1 つ要る: `room-not-found` を受けると下の効果が `forgetIdentity` で保存を
  // 捨てるので、そのまま走り直すと**消滅の案内（戻る道つき）を出す前に玄関へ飛ぶ**。
  const entryAppliedRef = useRef(false);
  useEffect(() => {
    if (entryAppliedRef.current) return;
    if (sync.error?.code === 'room-not-found') return;
    entryAppliedRef.current = true;
    if (sync.storedIdentity(roomId) === null) redirectTo(hubPathFor(roomId));
  }, [sync, roomId]);

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
    const stored = sync.storedIdentity(roomId);
    // 保存が無い＝まだ名乗っていない。**上の効果が玄関へ送っている**ので、ここは何もしない。
    if (!stored) return;
    attemptedRef.current = true;
    sync.joinRoom(roomId, stored.displayName, stored.resumeToken);
  }, [sync, roomId]);

  // 混雑で弾かれたら、待ってから入り直す（#147）。
  //
  // #103 でレート制限が IP 単位になり、同一 NAT の利用者はバケツを共有する。
  // バースト容量を超えた人は `rate-limited` を受けるが、上の `attemptedRef` は
  // 接続ごとに 1 回しか試みないため、**接続済み・未入室のまま滞留**していた。
  // **即時に送り直してはならない** — 待ち時間とばらつきは join-retry.ts が決める。
  const rateLimitAttemptRef = useRef(0);
  const [retryNotice, setRetryNotice] = useState<string | null>(null);
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
    const stored = syncRef.current.storedIdentity(roomId);
    // **保存が消えていることがある。** 同じ端末の別のタブが、消滅したルームの
    // トークンを捨てる（下の `forgetIdentity`）と、この画面の足元から名乗りが消える。
    // 送り直す名前を持たないのに「入り直しています」と出すと、画面の言うことが嘘になる。
    const name = stored?.displayName ?? null;
    const plan = planJoinRetry(rateLimitAttemptRef.current, name !== null);
    setRetryNotice(plan.notice);
    // 使い切った。**数え直さない**（数え直すと諦めたはずが送り続ける形になる）。
    if (plan.kind === 'give-up') return;
    rateLimitAttemptRef.current = plan.attempt;
    const timer = setTimeout(() => {
      const s = syncRef.current;
      // 名前があれば入り直す。無ければルームの生死だけを尋ね直す（#76 J-1 と同じ扱い）。
      if (name !== null) s.joinRoom(roomId, name, stored?.resumeToken);
      else s.checkRoom(roomId);
    }, plan.delayMs);
    return () => clearTimeout(timer);
  }, [sync.error, roomId]);

  // 消滅したルームのトークンは破棄する（再試行ループ防止）
  useEffect(() => {
    if (sync.error?.code === 'room-not-found') syncRef.current.forgetIdentity(roomId);
  }, [sync.error, roomId]);

  // room-not-found はページ全体をエラー表示に（FR-015 / US1-AS3）
  if (sync.error?.code === 'room-not-found') {
    return (
      <main className="page">
        <h1>ルームが見つかりません</h1>
        <p>ルームは終了したか、リンクが正しくない可能性があります。</p>
        {/* **消えたルームの選択画面へは送らない。** ハブはそこで存在しないルームの
            参加画面を出し、名乗っても必ず失敗する（timer の `SessionLost` と同じ扱い）。 */}
        <a href="/">トップへ戻る</a>
      </main>
    );
  }

  const { snapshot } = sync;
  if (!snapshot || snapshot.roomId !== roomId) {
    return <JoiningView sync={sync} notice={retryNotice} />;
  }

  const isVoting = snapshot.round.status === 'voting';
  const inviteUrl = sync.inviteUrl(roomId);

  return (
    <main className="page room">
      <header>
        {/* 見出しと戻る導線を 1 行に組む（#95 S5c 追補・利用者の実画面フィードバック）。
            素のリンクを招待リンクの塊の上へ置くと、どこへ属する操作か分からず浮いていた。
            timer は `StatusStrip` の中に収めてあるので、こちらも見出しの相方にする。 */}
        <div className="room-title">
          <h1>プランニングポーカー</h1>
          {/* 選択画面へ戻る導線。旧入口（poker のトップ画面等）が撤去され、他に戻る
              手段が無い（利用者の申し送り・2026-09-14）。行き先は招待リンクと同じ
              **同じルームの選択画面**（玄関まで戻すとルームから出たことになる）ので、
              組み立ては増やさず sync.inviteUrl を再利用する。 */}
          <a className="room-back" href={inviteUrl}>
            選択画面へ戻る
          </a>
        </div>
        <InviteLink url={inviteUrl} />
      </header>
      <ErrorNote error={sync.error} onClose={sync.clearError} />
      <section>
        <h2>参加者（{snapshot.participants.length}人）</h2>
        <ParticipantList participants={snapshot.participants} you={snapshot.you} />
      </section>
      {isVoting ? (
        <VotingSection snapshot={snapshot} sync={sync} />
      ) : (
        <RevealedSection snapshot={snapshot} sync={sync} />
      )}
    </main>
  );
}

function VotingSection({
  snapshot,
  sync,
}: {
  snapshot: RoomStateMessage;
  sync: PokerSync;
}) {
  // 切断・再接続中は操作を受け付けない（送信しても届かないため）
  const offline = sync.status !== 'open';
  return (
    <section>
      <h2>あなたのカード</h2>
      <CardHand selected={snapshot.yourVote} onSelect={sync.vote} disabled={offline} />
      {/* かつてはホストだけに出ていたが、#95 S3 でホストを廃止し全参加者へ開放した */}
      <p>
        <button type="button" className="secondary" onClick={sync.reveal} disabled={offline}>
          票を公開する
        </button>
      </p>
    </section>
  );
}

function RevealedSection({
  snapshot,
  sync,
}: {
  snapshot: RoomStateMessage;
  sync: PokerSync;
}) {
  if (snapshot.round.status !== 'revealed') return null;
  const { votes, stats } = snapshot.round;
  const offline = sync.status !== 'open';

  return (
    <>
      <Results participants={snapshot.participants} votes={votes} stats={stats} />
      {/* かつてはホストだけに出ていたが、#95 S3 でホストを廃止し全参加者へ開放した */}
      <p className="round-actions">
        {/* 再投票と次ラウンドはドメイン上同一操作（next-round）。ラベルのみ区別（FR-011） */}
        <button type="button" onClick={sync.nextRound} disabled={offline}>
          再投票
        </button>
        <button type="button" className="secondary" onClick={sync.nextRound} disabled={offline}>
          次のラウンドへ
        </button>
      </p>
    </>
  );
}
