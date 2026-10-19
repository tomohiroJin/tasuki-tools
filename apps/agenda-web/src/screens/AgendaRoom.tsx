/**
 * 進行タイマーのルームの画面（#429）。
 *
 * **仮の画面**: 会の名前とステップの名前を並べるだけ。盤・組む画面・進行の画面は Task 3.5 / 3.6 が置き換える。
 * ここで名前は聞かない（名乗りは玄関に 1 つだけ・`docs/adr/0018`）。端末に同一性が無い・合言葉を求められたら
 * 玄関のそのルームへ送り返す（コードは落とさない）。
 */
import { useEffect } from 'react';
import { LoadingView } from '../components/LoadingView';
import { BACK_LINK, GONE_HEADING, GONE_LINK, GONE_TEXT, JOINING_HEADING, PAGE_HEADING } from '../copy';
import { useAgendaSync } from '../hooks/use-agenda-sync';
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
    <main className="ui-page ui-page--prose">
      <header className="ui-page-header">
        <h1>{PAGE_HEADING}</h1>
        <a className="ui-page-header-back ui-button ui-button--quiet" href={hubPathFor(roomCode)}>
          {BACK_LINK}
        </a>
      </header>
      {view !== null && (
        <section>
          <h2>{view.title}</h2>
          <ol>
            {view.steps.map((step) => (
              <li key={step.id}>{step.name}</li>
            ))}
          </ol>
        </section>
      )}
    </main>
  );
}
