/**
 * 進行タイマーのルームの画面（#429）。
 *
 * 段階で中身を切り替える: 開始前は組む画面（`ScenarioBuilder`）。**進行中・終了は仮の一覧**（Task 3.6 が置き換える）。
 * 器（`.ui-page--wide`）は段階が変わっても変えない（`packages/ui/README.md`「器の選び方」）。
 * ここで名前は聞かない（名乗りは玄関に 1 つだけ・`docs/adr/0018`）。端末に同一性が無い・合言葉を求められたら
 * 玄関のそのルームへ送り返す（コードは落とさない）。
 */
import { useEffect } from 'react';
import type { AgendaView } from '@tasuki/agenda-core';
import { LoadingView } from '../components/LoadingView';
import { ScenarioBuilder } from '../components/ScenarioBuilder';
import { BACK_LINK, CLOSE_BUTTON, GONE_HEADING, GONE_LINK, GONE_TEXT, JOINING_HEADING, PAGE_HEADING } from '../copy';
import { useAgendaSync, type AgendaSync } from '../hooks/use-agenda-sync';
import { hubPathFor, redirectTo } from '../router';

export function AgendaRoom({ roomCode }: { roomCode: string }) {
  const sync = useAgendaSync(roomCode);

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
      <header className="ui-page-header">
        <h1>{PAGE_HEADING}</h1>
        <a className="ui-page-header-back ui-button ui-button--quiet" href={hubPathFor(roomCode)}>
          {BACK_LINK}
        </a>
      </header>
      {sync.error && (
        <p className="agenda-error ui-note ui-note--error" role="alert">
          {sync.error}
          <button type="button" className="ui-button ui-button--quiet ui-button--sm" onClick={sync.clearError}>
            {CLOSE_BUTTON}
          </button>
        </p>
      )}
      {view !== null && <PhaseView view={view} sync={sync} />}
    </main>
  );
}

/** 段階ごとの中身。開始前は組む画面、それ以外は Task 3.6 までの仮の一覧 */
function PhaseView({ view, sync }: { view: AgendaView; sync: AgendaSync }) {
  if (view.phase === 'idle') {
    return <ScenarioBuilder view={view} canOperate={sync.joined} onLoad={sync.setScenario} onStart={sync.start} />;
  }
  return (
    <section>
      <h2>{view.title}</h2>
      <ol>
        {view.steps.map((step) => (
          <li key={step.id}>{step.name}</li>
        ))}
      </ol>
    </section>
  );
}
