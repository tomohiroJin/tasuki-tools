/**
 * うちわけのルームの画面（#476・設計 §5）。
 *
 * 器は `.ui-page--wide`。64rem 以上で 2 段（左: いま・切り替える／右: うちわけ・時系列・持ち帰り）、狭い幅では DOM の順に積む。
 * 段組みは部品（`.ui-workspace`）が持つ。左の段は候補の並びが主で細くてよいので脇（`-side`・22rem）に、
 * 右の段は表と手直しの欄が幅を要るので残りの幅（`-main`）に置く。
 * ここで名前は聞かない（名乗りは玄関に 1 つだけ・`docs/adr/0018`）。端末に同一性が無い・合言葉を求められたら
 * 玄関のそのルームへ送り返す。切断中（`!sync.joined`）は操作を押させない。
 * **誰が操作したかは、画面のどこにも出さない**（写しに無い。設計 §6）。
 */
import { useState } from 'react';
import {
  LONG_RUNNING_NOTICE_MS,
  candidatesOf,
  longRunningOf,
  previousLabelOf,
  runningSegmentOf,
  toMarkdown,
  totalsOf,
  type BackMinutes,
  type TrackView,
} from '@tasuki/track-core';
import { ROOM_HEADER_TEXT, RoomHeader } from '@tasuki/invite-ui';
import { ConnectionBanner, LoadingView, RoomGoneView, RoomJoiningView, useHubRedirect, usePrefersReducedMotion } from '@tasuki/web-kit/room';
import { Notices } from '../components/Notices';
import { NowPanel } from '../components/NowPanel';
import { SwitchPanel } from '../components/SwitchPanel';
import { TakeHome } from '../components/TakeHome';
import { Timeline } from '../components/Timeline';
import { TotalsPanel } from '../components/TotalsPanel';
import { CLOSE_BUTTON, FOOTNOTE, PAGE_HEADING, longRunningText } from '../copy';
import { useAnnouncement } from '../hooks/use-announcement';
import { useTabTitle } from '../hooks/use-tab-title';
import { useTrackClock } from '../hooks/use-track-clock';
import { useTrackKeys } from '../hooks/use-track-keys';
import { useTrackSync, type TrackSync } from '../hooks/use-track-sync';
import { useUndoSeconds } from '../hooks/use-undo-seconds';
import { localTzOffsetMin } from '../platform/timezone';
import { hubPathFor, redirectTo } from '../router';
import { nameOf, tabTitleOf } from '../track-view';

const MS_PER_MIN = 60_000;

export function TrackRoom({ roomCode }: { roomCode: string }) {
  const sync = useTrackSync(roomCode);

  // 玄関へ送る。**判定は同期フック、適用はここ 1 箇所**。
  useHubRedirect({ departed: sync.departed, needsHub: sync.needsHub, roomCode, returnTo: 'track', hubPathFor, redirectTo });

  // 消えたルームの選択画面へは送らない（そこで名乗っても必ず失敗する）
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
      <main className="ui-page ui-page--wide">
        <RoomHeader title={PAGE_HEADING} backHref={hubPathFor(roomCode)} roomCode={roomCode} inviteUrl={sync.inviteUrl} />
        <div className="track-room">
          {sync.error && (
            <p className="track-error ui-note ui-note--error" role="alert">
              {sync.error}
              <button type="button" className="ui-button ui-button--quiet ui-button--sm" onClick={sync.clearError}>
                {CLOSE_BUTTON}
              </button>
            </p>
          )}
          {view !== null && <RoomBody view={view} sync={sync} />}
          <p className="track-footnote ui-note">{FOOTNOTE}</p>
        </div>
      </main>
    </>
  );
}

/** 写しが届いた後の中身。時計・キーボード・タブの題・読み上げはここで持つ（写しが要るフックをまとめる）。 */
function RoomBody({ view, sync }: { view: TrackView; sync: TrackSync }) {
  const reducedMotion = usePrefersReducedMotion();
  const { nowMs, getNow } = useTrackClock(view, sync.receivedAt, reducedMotion);
  const undoSeconds = useUndoSeconds(view.undo, sync.receivedAt);
  // 「いつから」は止める・休憩にする・切り替えるのどれにも効く。1 回使ったら「いまから」へ戻す（次の操作まで持ち越さない）
  const [backMin, setBackMin] = useState<BackMinutes | null>(null);
  const tzOffsetMin = localTzOffsetMin();
  const canOperate = sync.joined;

  const running = runningSegmentOf(view);
  const candidates = candidatesOf(view, sync.topic?.topic?.title ?? null);
  const totals = totalsOf(view, nowMs);
  const longRunning = longRunningOf(view, nowMs);
  const longText = longRunning === null ? null : longRunningText(nameOf(longRunning), LONG_RUNNING_NOTICE_MS / MS_PER_MIN);
  const announcement = useAnnouncement(view, longText);
  useTabTitle(tabTitleOf(view, nowMs));

  const takeBack = (): BackMinutes | undefined => {
    const used = backMin ?? undefined;
    setBackMin(null);
    return used;
  };
  const startWork = (label: string): void => sync.start(label, 'work', takeBack());
  const stop = (): void => sync.stop(takeBack());

  useTrackKeys({
    enabled: canOperate,
    // キーは「いまから」で送る（「いつから」の選択は画面の操作のためのもの）
    onCandidate: (index) => {
      const candidate = candidates[index];
      if (candidate !== undefined) sync.start(candidate.label, 'work');
    },
    onStop: () => {
      if (running !== null) sync.stop();
    },
    onResume: () => {
      const label = previousLabelOf(view);
      if (label !== null) sync.start(label, 'work');
    },
  });

  const resume = (): void => {
    // 最後の区切り（全員の切断で閉じた区切り）と同じ名前・種類で、いまから始める（離れていた間は数えない）
    const last = view.segments.at(-1);
    if (last !== undefined) sync.start(last.label, last.kind);
  };

  return (
    <>
      <Notices view={view} tzOffsetMin={tzOffsetMin} longRunningText={longText} canOperate={canOperate} onResume={resume} onDismiss={sync.dismissOffer} />
      <div className="ui-workspace">
        <div className="ui-workspace-side track-column">
          <NowPanel
            view={view}
            nowMs={nowMs}
            undoSeconds={undoSeconds}
            canOperate={canOperate}
            onStop={stop}
            onBreak={() => sync.start('', 'break', takeBack())}
            onUndo={sync.undo}
          />
          <SwitchPanel
            running={running !== null}
            candidates={candidates}
            backMin={backMin}
            onBackMinChange={setBackMin}
            canOperate={canOperate}
            onStart={startWork}
            onPin={sync.pin}
          />
        </div>
        <div className="ui-workspace-main track-column">
          <TotalsPanel totals={totals} />
          <Timeline view={view} nowMs={nowMs} getNow={getNow} tzOffsetMin={tzOffsetMin} canOperate={canOperate} actions={sync} />
          <TakeHome markdown={toMarkdown(view, nowMs, tzOffsetMin)} hasRecord={view.segments.length > 0} canOperate={canOperate} onClear={sync.clear} />
        </div>
      </div>
      {/* 読み上げの領域は常に置き、文だけを差し替える（入れた瞬間の領域は読み上げられないことがある） */}
      <p className="ui-visually-hidden track-live" aria-live="polite">
        {announcement}
      </p>
    </>
  );
}
