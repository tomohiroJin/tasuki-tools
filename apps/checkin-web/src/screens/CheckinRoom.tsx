/**
 * Check-in Cards のルームの画面（#406）。
 *
 * 参加中・ルームなし・玄関への送り返し・共通の見出し・失敗の一言（3.1）に、やり方の選択・お題の板・席・
 * 手札・下の操作の帯（3.3）を組む。開いた後の見せ方（RevealBoard）は 3.4。
 * ここで名前は聞かない（名乗りは玄関に 1 つだけ・`docs/adr/0018`）。端末に同一性が無い・合言葉を求められたら
 * 玄関のそのルームへ送り返す（コードは落とさない）。
 */
import { useEffect, useState } from 'react';
import { ROOM_HEADER_TEXT, RoomHeader } from '@tasuki/invite-ui';
import { Hand, SpectatorToggle } from '../components/Hand';
import { LoadingView } from '../components/LoadingView';
import { MethodPicker } from '../components/MethodPicker';
import { PromptPanel } from '../components/PromptPanel';
import { RoundDock } from '../components/RoundDock';
import { SeatRow } from '../components/SeatRow';
import { CLOSE_BUTTON, GONE_HEADING, GONE_LINK, GONE_TEXT, JOINING_HEADING, PAGE_HEADING } from '../copy';
import { useCheckinSync } from '../hooks/use-checkin-sync';
import { hubPathFor, redirectTo } from '../router';

export function CheckinRoom({ roomCode }: { roomCode: string }) {
  const sync = useCheckinSync(roomCode);
  // 「別のやり方」を押したあとの手元だけの状態。押しても他の人の回は変わらない
  const [picking, setPicking] = useState(false);

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

  const view = sync.checkin;
  const round = view?.round ?? null;
  const showPicker = view !== null && (round === null || picking);

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

      {view !== null && showPicker && (
        <>
          <MethodPicker
            onChoose={(method) => {
              setPicking(false);
              sync.chooseMethod(method);
            }}
            onDraw={(side) => {
              setPicking(false);
              sync.drawMethod(side);
            }}
            onCancel={round === null ? undefined : () => setPicking(false)}
          />
          {round === null && (
            <div className="table-foot">
              <SpectatorToggle spectating={view.spectating} onSetSpectator={sync.setSpectator} />
            </div>
          )}
        </>
      )}

      {view !== null && round !== null && !showPicker && (
        <div className="table">
          <PromptPanel
            method={round.method}
            visibility={round.visibility}
            locked={round.locked}
            onSetVisibility={(v) => sync.setVisibility(round.seq, v)}
            onChangeMethod={() => setPicking(true)}
          />
          {round.status === 'open' && (
            <>
              <SeatRow
                seats={round.seats}
                selfId={view.you}
                playedCount={round.playedCount}
                playerCount={round.playerCount}
                spectatorCount={view.spectatorCount}
              />
              <Hand
                method={round.method}
                selected={round.yourCard}
                spectating={view.spectating}
                onPlay={(card) => sync.playCard(round.seq, card)}
                onSetSpectator={sync.setSpectator}
              />
            </>
          )}
          <RoundDock
            status={round.status}
            onReveal={() => sync.reveal(round.seq)}
            onAgain={() => sync.playAgain(round.seq)}
            onChangeMethod={() => setPicking(true)}
          />
        </div>
      )}
    </main>
  );
}
