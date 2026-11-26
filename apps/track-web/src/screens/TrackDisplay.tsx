/**
 * うちわけの映す画面（#476 第 2 段・設計 §5 D1・D2）。`/track/?view=display`。
 *
 * 会議室の画面などに映す読むだけの画面。いまの作業名（大）・経過・作業名ごとの合計の表・時系列の帯。
 * **押せる部品を置かない**（取り違えて操作しない）。入り方は通常の接続（`useTrackSync`）で、
 * ここから送るのは再接続・表に戻ったときの `track.sync` だけ（操作の関数は 1 つも呼ばない。名簿には普通の参加者として載る）。
 * 名乗りは玄関に 1 つだけ（`docs/adr/0018`）。端末に同一性が無ければ、ルームの画面と同じく玄関へ送る。
 */
import { bandOf, totalsOf, runningSegmentOf, durationOf, type TrackView } from '@tasuki/track-core';
import { ConnectionBanner, RoomGoneView, RoomJoiningView, usePrefersReducedMotion } from '@tasuki/web-kit/room';
import { ROOM_HEADER_TEXT } from '@tasuki/invite-ui';
import { TimeBand } from '../components/TimeBand';
import { TotalsPanel } from '../components/TotalsPanel';
import { DISPLAY_JOIN_LINK, DISPLAY_NEEDS_JOIN, ELAPSED_LABEL, NOW_HEADING, NOW_IDLE, PAGE_HEADING, TIMELINE_HEADING } from '../copy';
import { useTabTitle } from '../hooks/use-tab-title';
import { useTrackClock } from '../hooks/use-track-clock';
import { useTrackSync } from '../hooks/use-track-sync';
import { localTzOffsetMin } from '../platform/timezone';
import { hubPathFor } from '../router';
import { bandSummaryOf, formatElapsed, isUnnamed, nameOf, tabTitleOf } from '../track-view';

export function TrackDisplay({ roomCode }: { roomCode: string }) {
  const sync = useTrackSync(roomCode);

  if (sync.gone) return <RoomGoneView />;
  // 玄関へは自動で送らない（名乗った後の戻り先は操作できるルームの画面で、映す画面へは戻れない）。
  // 利用者が先にこの端末でルームに入り、映す画面の URL を開き直す
  if (sync.needsHub || sync.departed !== null) {
    return (
      <main className="track-display">
        <p className="ui-note">{DISPLAY_NEEDS_JOIN}</p>
        <a className="ui-button ui-button--secondary" href={hubPathFor(roomCode, sync.departed ?? undefined)}>
          {DISPLAY_JOIN_LINK}
        </a>
      </main>
    );
  }
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
  const band = bandOf(view, nowMs);
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
      {band !== null && (
        <section className="track-display-band ui-stack" aria-label={TIMELINE_HEADING}>
          <h2>{TIMELINE_HEADING}</h2>
          {/* 帯は飾り。同じ情報を、読み上げ向けの文でも持つ */}
          <p className="ui-visually-hidden">{bandSummaryOf(view, band, nowMs, tzOffsetMin)}</p>
          <TimeBand view={view} nowMs={nowMs} tzOffsetMin={tzOffsetMin} />
        </section>
      )}
    </div>
  );
}
