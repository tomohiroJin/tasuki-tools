/**
 * お題ツールのルームの画面（#91 PR 2・spec §5.4）。1 画面で完結させる（timer の形は引き継がない）。
 *
 * **ここで名前は聞かない**（名乗りは玄関に 1 つだけ・`docs/adr/0018`）。端末に同一性が無い・
 * 合言葉を求められたら、玄関のそのルームへ送り返す（コードは落とさない）。
 */
import { useCallback, useEffect, useState } from 'react';
import { CurrentTopic, type Draft } from '../components/CurrentTopic';
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
  // 書きかけは編集欄が持つが、右の読む面（「下書きの見え方」）が描くので、ここへ持ち上げる（#316）。
  // 同じ中身なら同じ参照を返す（編集欄の effect が初回に空で呼んでも描き直さない）
  const [draft, setDraft] = useState<Draft>({ title: '', body: '' });
  const onDraftChange = useCallback((next: Draft) => {
    setDraft((prev) => (prev.title === next.title && prev.body === next.body ? prev : next));
  }, []);

  // 玄関へ戻す。抜けた・外されたときは理由を運ぶ（玄関が告知を出す・#290）。
  useEffect(() => {
    if (sync.departed !== null) redirectTo(hubPathFor(roomCode, sync.departed));
    else if (sync.needsHub) redirectTo(hubPathFor(roomCode));
  }, [sync.departed, sync.needsHub, roomCode]);

  const notice = connectionNotice(sync);
  const banner = notice.kind !== 'none' && (
    <p className={`ui-banner${notice.kind === 'unreachable' ? ' ui-banner--unreachable' : ''}`} role={notice.kind === 'unreachable' ? 'alert' : 'status'}>
      {notice.text}
    </p>
  );

  if (sync.gone) {
    return (
      <main className="ui-page ui-page--prose">
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
        <main className="ui-page ui-page--prose">
          <header className="ui-page-header">
            <h1>{JOINING_HEADING}</h1>
            {/* 参加の返事が来ないまま待つ期限は無い（spec §10.1）。待たされた人が自分で戻れるように。 */}
            <a className="ui-page-header-back" href={hubPathFor(roomCode)}>
              {BACK_LINK}
            </a>
          </header>
          {sync.retryNotice && <p className="ui-note" role="status">{sync.retryNotice}</p>}
          {sync.error && <p className="ui-note ui-note--error" role="alert">{sync.error}</p>}
        </main>
      </>
    );
  }

  const enabled = canOperate(sync.status, sync.joined);
  return (
    <>
      {banner}
      <main className="ui-page ui-page--wide">
        <header className="ui-page-header">
          <h1>{PAGE_HEADING}</h1>
          <a className="ui-page-header-back" href={hubPathFor(roomCode)}>
            {BACK_LINK}
          </a>
        </header>
        <InviteLink url={sync.inviteUrl} />
        {/* 入り直しの途中の混雑も、この画面で伝える（伝えないと、ボタンが黙って押せなくなる） */}
        {sync.retryNotice && <p className="topic-notice ui-note" role="status">{sync.retryNotice}</p>}
        {sync.error && <p className="ui-note ui-note--error" role="alert">{sync.error}</p>}
        {/* 段組み（#316・ADR 0025）。いまのお題は右の読む面（広い幅）。DOM は狭い幅で見せたい順に書く:
            いまのお題 → 作る・書く。64rem 以上では -side-end で右の列へ、画面に留まる。 */}
        <div className="ui-workspace ui-workspace--reader ui-workspace--side-end">
          <div className="ui-workspace-side">
            <CurrentTopic state={sync.topicState} notice={generationNotice(sync.topicState)} enabled={enabled} draft={draft} onClear={sync.clearTopic} />
          </div>
          <div className="ui-workspace-main topic-tools">
            {/* 作るはボタン 1 つで済む操作なので、長く書く「書く」より先に置く（#313 構成案 1） */}
            <TopicMaker aiUnlocked={sync.topicState?.aiUnlocked ?? false} enabled={enabled} onGenerate={sync.generate} onUnlock={sync.unlock} />
            <TopicEditor current={sync.topicState?.topic ?? null} enabled={enabled} onDraftChange={onDraftChange} onSubmit={sync.setTopic} />
          </div>
        </div>
      </main>
    </>
  );
}
