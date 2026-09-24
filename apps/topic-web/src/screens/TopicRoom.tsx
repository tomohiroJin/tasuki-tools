/**
 * お題ツールのルームの画面（#91 PR 2・spec §5.4）。1 画面で完結させる（timer の形は引き継がない）。
 *
 * **ここで名前は聞かない**（名乗りは玄関に 1 つだけ・`docs/adr/0018`）。端末に同一性が無い・
 * 合言葉を求められたら、玄関のそのルームへ送り返す（コードは落とさない）。
 */
import { useEffect } from 'react';
import { CurrentTopic } from '../components/CurrentTopic';
import { InviteLink } from '../components/InviteLink';
import { LoadingView } from '../components/LoadingView';
import { TopicEditor } from '../components/TopicEditor';
import { TopicMaker } from '../components/TopicMaker';
import { BACK_LINK, GONE_HEADING, GONE_LINK, GONE_TEXT, JOINING_HEADING, PAGE_HEADING } from '../copy';
import { useTopicSync } from '../hooks/use-topic-sync';
import { hubPathFor, redirectTo } from '../router';
import { canOperate, connectionNotice, generationNotice } from '../topic-view';

export function TopicRoom({ roomCode }: { roomCode: string }) {
  const sync = useTopicSync(roomCode);

  // 玄関へ戻す。抜けた・外されたときは理由を運ぶ（玄関が告知を出す・#290）。
  useEffect(() => {
    if (sync.departed !== null) redirectTo(hubPathFor(roomCode, sync.departed));
    else if (sync.needsHub) redirectTo(hubPathFor(roomCode));
  }, [sync.departed, sync.needsHub, roomCode]);

  const notice = connectionNotice(sync);
  const banner = notice.kind !== 'none' && (
    <div className={`connection-banner${notice.kind === 'unreachable' ? ' unreachable' : ''}`} role={notice.kind === 'unreachable' ? 'alert' : 'status'}>
      {notice.text}
    </div>
  );

  if (sync.gone) {
    return (
      <main className="page">
        <h1>{GONE_HEADING}</h1>
        <p>{GONE_TEXT}</p>
        {/* 消えたルームの選択画面へは送らない（そこで名乗っても必ず失敗する・poker と同じ扱い） */}
        <a href="/">{GONE_LINK}</a>
      </main>
    );
  }
  if (sync.needsHub || sync.departed !== null) return <LoadingView />;
  // 最初の入室が成立するまで。再接続の間は画面を保ち、操作だけを止める（`canOperate`）。
  if (!sync.joined && sync.topicState === null) {
    return (
      <>
        {banner}
        <main className="page">
          <h1>{JOINING_HEADING}</h1>
          {sync.retryNotice && <p role="status">{sync.retryNotice}</p>}
          {sync.error && <p className="topic-error" role="alert">{sync.error}</p>}
        </main>
      </>
    );
  }

  const enabled = canOperate(sync.status, sync.joined);
  return (
    <>
      {banner}
      <main className="page topic-page">
        <header className="topic-header">
          <h1>{PAGE_HEADING}</h1>
          <a className="topic-back" href={hubPathFor(roomCode)}>
            {BACK_LINK}
          </a>
        </header>
        <InviteLink url={sync.inviteUrl} />
        {/* 入り直しの途中の混雑も、この画面で伝える（伝えないと、ボタンが黙って押せなくなる） */}
        {sync.retryNotice && <p className="topic-notice" role="status">{sync.retryNotice}</p>}
        {sync.error && <p className="topic-error" role="alert">{sync.error}</p>}
        <CurrentTopic state={sync.topicState} notice={generationNotice(sync.topicState)} enabled={enabled} onClear={sync.clearTopic} />
        <div className="topic-tools">
          <TopicEditor current={sync.topicState?.topic ?? null} enabled={enabled} onSubmit={sync.setTopic} />
          <TopicMaker aiUnlocked={sync.topicState?.aiUnlocked ?? false} enabled={enabled} onGenerate={sync.generate} onUnlock={sync.unlock} />
        </div>
      </main>
    </>
  );
}
