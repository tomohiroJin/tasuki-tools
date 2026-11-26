/**
 * うちわけの映す画面（#476 第 2 段・設計 §5 D1・D2）。`/track/?view=display`。
 *
 * 会議室の画面などに映す読むだけの画面。いまの作業名（大）・経過・作業名ごとの合計の表・時系列の帯。
 * **押せる部品を置かない**（取り違えて操作しない）。入り方は通常の接続（`useTrackSync`）で、
 * ここから送るのは再接続・表に戻ったときの `track.sync` だけ（操作の関数は 1 つも呼ばない。名簿には普通の参加者として載る）。
 * 名乗りは玄関に 1 つだけ（`docs/adr/0018`）。端末に同一性が無ければ、ルームの画面と同じく玄関へ送る。
 */
import { totalsOf, runningSegmentOf, durationOf, type TrackView } from '@tasuki/track-core';
import { ConnectionBanner, LoadingView, RoomGoneView, RoomJoiningView, useHubRedirect, usePrefersReducedMotion } from '@tasuki/web-kit/room';
import { ROOM_HEADER_TEXT } from '@tasuki/invite-ui';
import { TimeBand } from '../components/TimeBand';
import { TotalsPanel } from '../components/TotalsPanel';
import { ELAPSED_LABEL, NOW_HEADING, NOW_IDLE, PAGE_HEADING, TIMELINE_HEADING } from '../copy';
import { useTabTitle } from '../hooks/use-tab-title';
import { useTrackClock } from '../hooks/use-track-clock';
import { useTrackSync } from '../hooks/use-track-sync';
import { localTzOffsetMin } from '../platform/timezone';
import { hubPathFor, redirectTo } from '../router';
import { formatElapsed, isUnnamed, nameOf, tabTitleOf } from '../track-view';

export function TrackDisplay({ roomCode }: { roomCode: string }) {
  const sync = useTrackSync(roomCode);
  useHubRedirect({ departed: sync.departed, needsHub: sync.needsHub, roomCode, returnTo: 'track', hubPathFor, redirectTo });

  if (sync.gone) return <RoomGoneView />;
  if (sync.needsHub || sync.departed !== null) return <LoadingView />;
  const view = sync.track;
  if (!sync.joined && view === null) {
    return (
      <RoomJoiningView
        backHref={hubPathFor(roomCode)}
        backLabel={ROOM_HEADER_TEXT.back}
        retryNotice={sync.retryNotice}
        error={sync.error}
        notice={sync.notice}
        bannerPlacement="after-header"
      />
    );
  }
  return (
    <>
      <ConnectionBanner kind={sync.notice} />
      <main className="track-display">{view !== null && <DisplayBody view={view} receivedAt={sync.receivedAt} />}</main>
    </>
  );
}

function DisplayBody({ view, receivedAt }: { view: TrackView; receivedAt: number }) {
  const reducedMotion = usePrefersReducedMotion();
  const { nowMs } = useTrackClock(view, receivedAt, reducedMotion);
  const tzOffsetMin = localTzOffsetMin();
  const running = runningSegmentOf(view);
  const totals = totalsOf(view, nowMs);
  useTabTitle(tabTitleOf(view, nowMs));

  return (
    <div className="track-display-body">
      <h1 className="track-display-title">{PAGE_HEADING}</h1>
      <section className="track-display-now ui-stack" aria-label={NOW_HEADING}>
        {running === null ? (
          <p className="track-display-name track-now-idle">{NOW_IDLE}</p>
        ) : (
          <>
            <p className={isUnnamed(running) ? 'track-display-name track-name--unnamed' : 'track-display-name'}>{nameOf(running)}</p>
            <p className="track-display-elapsed">
              <span className="ui-visually-hidden">{ELAPSED_LABEL} </span>
              <span className="track-digits">{formatElapsed(durationOf(running, nowMs))}</span>
            </p>
          </>
        )}
      </section>
      <TotalsPanel totals={totals} />
      <section className="track-display-band ui-stack" aria-label={TIMELINE_HEADING}>
        <h2>{TIMELINE_HEADING}</h2>
        <TimeBand view={view} nowMs={nowMs} totals={totals} tzOffsetMin={tzOffsetMin} />
      </section>
    </div>
  );
}
