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
import { TopicEditor, type FillRequest } from '../components/TopicEditor';
import { TopicMaker } from '../components/TopicMaker';
import { BACK_LINK, GONE_HEADING, GONE_LINK, GONE_TEXT, JOINING_HEADING, PAGE_HEADING } from '../copy';
import { useTopicSync } from '../hooks/use-topic-sync';
import { hubPathFor, redirectTo } from '../router';
import { canOperate, connectionNotice, generationNotice } from '../topic-view';

export function TopicRoom({ roomCode }: { roomCode: string }) {
  const sync = useTopicSync(roomCode);
  // 書きかけは編集欄が持つが、右の読む面（「下書き」）が描くので、ここへ持ち上げる（#316）。
  // 同じ中身なら同じ参照を返す（編集欄の effect が初回に空で呼んでも描き直さない）
  const [draft, setDraft] = useState<Draft>({ title: '', body: '' });
  const onDraftChange = useCallback((next: Draft) => {
    setDraft((prev) => (prev.title === next.title && prev.body === next.body ? prev : next));
  }, []);

  // 「下書きにコピー」の要求。札の側のボタンが押した時点のお題を詰めて新しい object を作る（`TopicEditor` が同一性で受ける）。
  // 届いたお題の変化では作らない —— 書いている途中に別の人がお題を変えても、書く欄は動かさない
  const [fillRequest, setFillRequest] = useState<FillRequest | null>(null);

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
        <a className="ui-button ui-button--quiet" href="/">{GONE_LINK}</a>
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
            <a className="ui-page-header-back ui-button ui-button--quiet" href={hubPathFor(roomCode)}>
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
  const generation = generationNotice(sync.topicState);
  return (
    <>
      {banner}
      <main className="ui-page ui-page--wide">
        {/* 見出しと招待リンクを 1 つの塊にし、下の段組みとの間に余白を取る（poker の `.room > header` と同じ・#316） */}
        <div className="topic-room-header">
          <header className="ui-page-header">
            <h1>{PAGE_HEADING}</h1>
            <a className="ui-page-header-back ui-button ui-button--quiet" href={hubPathFor(roomCode)}>
              {BACK_LINK}
            </a>
          </header>
          <InviteLink url={sync.inviteUrl} />
        </div>
        {/* 入り直しの途中の混雑も、この画面で伝える（伝えないと、ボタンが黙って押せなくなる） */}
        {sync.retryNotice && <p className="topic-notice ui-note" role="status">{sync.retryNotice}</p>}
        {sync.error && <p className="ui-note ui-note--error" role="alert">{sync.error}</p>}
        {/* 段組み（#316・ADR 0025）。いまのお題は右の読む面（広い幅）。DOM は狭い幅で見せたい順に書く:
            場のお題 → 書く・作る。64rem 以上では -side-end で右の列へ、画面に留まる。 */}
        <div className="ui-workspace ui-workspace--reader ui-workspace--side-end">
          <div className="ui-workspace-side">
            <CurrentTopic state={sync.topicState} enabled={enabled} draft={draft} onCopyToDraft={(topic) => setFillRequest({ ...topic })} onClear={sync.clearTopic} />
          </div>
          <div className="ui-workspace-main topic-tools">
            {/* 生成の知らせは操作の面の先頭に置く。読む面の札の最大の高さは脇に札しか載らない前提で決めてあり、
                札の上に置くと脇の区画が画面の高さを超える（#316 最終レビュー I3）。aria-busy の section の外にも当たる */}
            {generation && <p className="topic-notice ui-note" role="status">{generation}</p>}
            {/* 書くが主役。作るはその下のたためる欄（最初はたたむ）。#313 構成案 1 は作るが先だったが、
                利用者が実物を見て #316 PR 1 で逆にした（設計正本 §10.1） */}
            <TopicEditor fillRequest={fillRequest} enabled={enabled} onDraftChange={onDraftChange} onSubmit={sync.setTopic} />
            <TopicMaker aiUnlocked={sync.topicState?.aiUnlocked ?? false} enabled={enabled} onGenerate={sync.generate} onUnlock={sync.unlock} />
          </div>
        </div>
      </main>
    </>
  );
}
