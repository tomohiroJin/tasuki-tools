/**
 * Check-in Cards のルームの画面（#406）。
 *
 * 3.1 時点は骨組みだけ: 参加中・ルームなし・玄関への送り返し・共通の見出し・失敗の一言。
 * 札の盤（やり方の選択・手札・開票）は 3.2 以降でここへ組む。
 * ここで名前は聞かない（名乗りは玄関に 1 つだけ・`docs/adr/0018`）。端末に同一性が無い・合言葉を求められたら
 * 玄関のそのルームへ送り返す（コードは落とさない）。
 */
import { useEffect } from 'react';
import { ROOM_HEADER_TEXT, RoomHeader } from '@tasuki/invite-ui';
import { LoadingView } from '../components/LoadingView';
import { CLOSE_BUTTON, GONE_HEADING, GONE_LINK, GONE_TEXT, JOINING_HEADING, PAGE_HEADING } from '../copy';
import { useCheckinSync } from '../hooks/use-checkin-sync';
import { hubPathFor, redirectTo } from '../router';

export function CheckinRoom({ roomCode }: { roomCode: string }) {
  const sync = useCheckinSync(roomCode);

  // 玄関へ送る。**判定は同期フック、適用はここ 1 箇所**。
  useEffect(() => {
    if (sync.departed !== null) redirectTo(hubPathFor(roomCode, sync.departed));
    else if (sync.needsHub) redirectTo(hubPathFor(roomCode));
  }, [sync.departed, sync.needsHub, roomCode]);

  if (sync.gone) {
    return (
      <main className="ui-page ui-page--prose">
        <h1>{GONE_HEADING}</h1>
        <p>{GONE_TEXT}</p>
        {/* 消えたルームの選択画面へは送らない（そこで名乗っても必ず失敗する） */}
        <a className="ui-button ui-button--quiet" href="/">
          {GONE_LINK}
        </a>
      </main>
    );
  }
  if (sync.needsHub || sync.departed !== null) return <LoadingView />;

  if (!sync.joined && sync.checkin === null) {
    return (
      <main className="ui-page ui-page--prose">
        <header className="ui-page-header">
          <h1>{JOINING_HEADING}</h1>
          <a className="ui-page-header-back ui-button ui-button--quiet" href={hubPathFor(roomCode)}>
            {ROOM_HEADER_TEXT.back}
          </a>
        </header>
        {sync.retryNotice && (
          <p className="ui-note" role="status">
            {sync.retryNotice}
          </p>
        )}
        {sync.error && (
          <p className="ui-note ui-note--error" role="alert">
            {sync.error}
          </p>
        )}
      </main>
    );
  }

  return (
    <main className="ui-page ui-page--wide">
      <RoomHeader title={PAGE_HEADING} backHref={hubPathFor(roomCode)} roomCode={roomCode} inviteUrl={sync.inviteUrl} />
      {sync.error && (
        <p className="ui-note ui-note--error" role="alert">
          {sync.error}
          <button type="button" className="ui-button ui-button--quiet ui-button--sm" onClick={sync.clearError}>
            {CLOSE_BUTTON}
          </button>
        </p>
      )}
    </main>
  );
}
