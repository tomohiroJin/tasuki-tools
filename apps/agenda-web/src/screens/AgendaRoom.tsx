/**
 * 進行タイマーのルームの画面（#429）。
 *
 * 段階で中身を切り替える: 開始前は組む画面（`ScenarioBuilder`）、進行中・一時停止中・終了は進める画面（`RunScreen`）。
 * 合図（時打ち・読み上げ）は段階をまたいで前の盤と比べるので、段階の切り替えの外（ここ）で持つ。
 * 器（`.ui-page--wide`）は段階が変わっても変えない（`packages/ui/README.md`「器の選び方」）。
 * ここで名前は聞かない（名乗りは玄関に 1 つだけ・`docs/adr/0018`）。端末に同一性が無い・合言葉を求められたら
 * 玄関のそのルームへ送り返す（コードは落とさない）。
 */
import { useEffect, useState } from 'react';
import type { AgendaView } from '@tasuki/agenda-core';
import { summaryText } from '../agenda-view';
import { LoadingView } from '../components/LoadingView';
import { RunScreen } from '../components/RunScreen';
import { ScenarioBuilder } from '../components/ScenarioBuilder';
import { SoundToggle } from '../components/SoundToggle';
import { useLocalClock } from '../hooks/use-local-clock';
import { usePrefersReducedMotion } from '../hooks/use-reduced-motion';
import { useRunSignals } from '../hooks/use-run-signals';
import { useSoundSetting } from '../hooks/use-sound-setting';
import { useWallClock } from '../hooks/use-wall-clock';
import { BACK_LINK, CLOSE_BUTTON, GONE_HEADING, GONE_LINK, GONE_TEXT, JOINING_HEADING, PAGE_HEADING } from '../copy';
import { useAgendaSync, type AgendaSync } from '../hooks/use-agenda-sync';
import { hubPathFor, redirectTo } from '../router';

export function AgendaRoom({ roomCode }: { roomCode: string }) {
  const sync = useAgendaSync(roomCode);
  // 映す表示か。**ここで持つ**: 映している間は見出し・戻るリンク・失敗の一言を描かない（全画面の重ねの裏に
  // 押せる部品を残すと、Tab で見えない部品に届く）。開始前に戻ったら（誰かが「最初から」を押した）抜ける
  const [projectingWanted, setProjecting] = useState(false);
  const phase = sync.agenda?.phase ?? null;
  const projecting = projectingWanted && phase !== null && phase !== 'idle';
  useEffect(() => {
    if (phase === 'idle') setProjecting(false);
  }, [phase]);

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

  const view = sync.agenda;
  if (!sync.joined && view === null) {
    return (
      <main className="ui-page ui-page--prose">
        <header className="ui-page-header">
          <h1>{JOINING_HEADING}</h1>
          <a className="ui-page-header-back ui-button ui-button--quiet" href={hubPathFor(roomCode)}>
            {BACK_LINK}
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
      {!projecting && (
        <header className="ui-page-header">
          <h1>{PAGE_HEADING}</h1>
          <a className="ui-page-header-back ui-button ui-button--quiet" href={hubPathFor(roomCode)}>
            {BACK_LINK}
          </a>
        </header>
      )}
      {!projecting && sync.error && (
        <p className="agenda-error ui-note ui-note--error" role="alert">
          {sync.error}
          <button type="button" className="ui-button ui-button--quiet ui-button--sm" onClick={sync.clearError}>
            {CLOSE_BUTTON}
          </button>
        </p>
      )}
      {view !== null && <PhaseView view={view} sync={sync} projecting={projecting} onProjectingChange={setProjecting} />}
    </main>
  );
}

/**
 * 段階ごとの中身。開始前は組む画面、それ以外は進める画面。
 * 読み上げの領域は段階に関わらず常に置き、文だけを差し替える（入れた瞬間の領域は読み上げられないことがある）。
 */
function PhaseView({
  view,
  sync,
  projecting,
  onProjectingChange,
}: {
  view: AgendaView;
  sync: AgendaSync;
  projecting: boolean;
  onProjectingChange: (projecting: boolean) => void;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const live = useLocalClock(view, sync.receivedAt, reducedMotion) ?? view;
  const wallNow = useWallClock();
  const { soundState, soundOn, toggleSound } = useSoundSetting();
  const { striking, announcement, announce } = useRunSignals(live, { frame: view, joined: sync.joined, soundOn, reducedMotion });
  return (
    <>
      {view.phase === 'idle' ? (
        <ScenarioBuilder view={view} canOperate={sync.joined} onLoad={sync.setScenario} onStart={sync.start} />
      ) : (
        <RunScreen
          view={live}
          wallNow={wallNow}
          reducedMotion={reducedMotion}
          striking={striking}
          canOperate={sync.joined}
          actions={sync}
          onSpeakSummary={() => announce(summaryText(live))}
          projecting={projecting}
          onProjectingChange={onProjectingChange}
          soundToggle={<SoundToggle state={soundState} onToggle={toggleSound} />}
        />
      )}
      <p className="ui-visually-hidden agenda-live" aria-live="polite">
        {announcement}
      </p>
    </>
  );
}
