/**
 * ルーレットのルームの画面（#94 PR 2・spec §5.6）。1 画面で完結させる。
 *
 * **ここで名前は聞かない**（名乗りは玄関に 1 つだけ・`docs/adr/0018`）。端末に同一性が無い・
 * 合言葉を求められたら、玄関のそのルームへ送り返す（コードは落とさない）。
 *
 * 円盤と札は PR 3 で舞台（`.roulette-stage`）の中に足す。いまの舞台は
 * お題の添え書き・結果の一言・回すだけで、「回して決まる」を通す。
 */
import { useEffect, useState } from 'react';
import { InviteLink } from '../components/InviteLink';
import { LoadingView } from '../components/LoadingView';
import { PeoplePanel } from '../components/PeoplePanel';
import { SpinControls } from '../components/SpinControls';
import {
  BACK_LINK,
  GONE_HEADING,
  GONE_LINK,
  GONE_TEXT,
  INVITE_HEADING,
  JOINING_HEADING,
  PAGE_HEADING,
  STAGE_HEADING,
  topicNoteText,
} from '../copy';
import { useRouletteSync } from '../hooks/use-roulette-sync';
import { usePrefersReducedMotion } from '../hooks/use-reduced-motion';
import { hubPathFor, redirectTo } from '../router';
import {
  canOperate,
  captionOf,
  connectionNotice,
  isServerSpinning,
  membersOf,
  peopleOf,
  phaseOf,
  spinButtonOf,
} from '../roulette-view';

/**
 * 画面が使う「いま」。回転の終わり（`endAt`・`performance.now()` の時刻）に描き直す。
 *
 * **`receivedAt` を下限にする**: 状態を受け取った直後の描画で、古い「いま」を使うと経過が
 * 受け取った値より小さく見え、終わっている回転が一瞬「回っている」になる。
 * 終わりは rAF に頼らない（裏のタブでは止まる）。残り時間の後に必ず描き直す。
 */
function useNowMs(receivedAt: number, endAt: number | null): number {
  const [tick, setTick] = useState(() => performance.now());
  useEffect(() => {
    if (endAt === null) return;
    const delay = endAt - performance.now();
    if (delay <= 0) return;
    const timer = setTimeout(() => setTick(performance.now()), delay + 30);
    return () => clearTimeout(timer);
  }, [endAt]);
  return Math.max(tick, receivedAt);
}

export function RouletteRoom({ roomCode }: { roomCode: string }) {
  const sync = useRouletteSync(roomCode);
  const reducedMotion = usePrefersReducedMotion();

  // 玄関へ戻す。抜けた・外されたときは理由を運ぶ（玄関が告知を出す・#290）。
  useEffect(() => {
    if (sync.departed !== null) redirectTo(hubPathFor(roomCode, sync.departed));
    else if (sync.needsHub) redirectTo(hubPathFor(roomCode));
  }, [sync.departed, sync.needsHub, roomCode]);

  const view = sync.roulette;
  const spin = view?.spin ?? null;
  const endAt = spin === null ? null : sync.receivedAt + spin.durationMs - spin.elapsedMs;
  const nowMs = useNowMs(sync.receivedAt, endAt);

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
        <a className="ui-button ui-button--quiet" href="/">
          {GONE_LINK}
        </a>
      </main>
    );
  }
  if (sync.needsHub || sync.departed !== null) return <LoadingView />;
  // 最初の入室が成立するまで。再接続の間は画面を保ち、操作だけを止める（`canOperate`）。
  if (!sync.joined && view === null) {
    return (
      <>
        {banner}
        <main className="ui-page ui-page--prose">
          <header className="ui-page-header">
            <h1>{JOINING_HEADING}</h1>
            {/* 参加の返事が来ないまま待つ期限は無い。待たされた人が自分で戻れるように。 */}
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
      </>
    );
  }

  // 参加はしたが、最初のルーレットの状態がまだ（返事の順で入れ替わりうる）。空の状態で描く。
  const current = view ?? { excluded: [], guests: [], drawn: [], spin: null };
  const operable = canOperate(sync.status, sync.joined);
  const serverSpinning = isServerSpinning(current, sync.receivedAt, nowMs);
  const phase = phaseOf({ view: current, receivedAt: sync.receivedAt, nowMs, reducedMotion });
  const people = peopleOf({ members: membersOf(sync.roster), view: current, selfId: sync.selfId, phase });
  const button = spinButtonOf({ view: current, poolCount: people.poolCount, operable, serverSpinning });
  const topicTitle = sync.topic?.topic?.title ?? null;

  return (
    <>
      {banner}
      <main className="ui-page ui-page--wide">
        <div className="roulette-room-header">
          <header className="ui-page-header">
            <h1>{PAGE_HEADING}</h1>
            <a className="ui-page-header-back ui-button ui-button--quiet" href={hubPathFor(roomCode)}>
              {BACK_LINK}
            </a>
          </header>
        </div>
        {sync.retryNotice && (
          <p className="roulette-notice ui-note" role="status">
            {sync.retryNotice}
          </p>
        )}
        {sync.error && (
          <p className="roulette-notice ui-note ui-note--error" role="alert">
            {sync.error}
          </p>
        )}
        {/* 段組み（ADR 0025）。操作の面が主役、脇は右。DOM は狭い幅で見せたい順:
            お題 → 結果の一言 → 回す → 入る人 → 名前を追加 → 一周 → 仲間を招く */}
        <div className="ui-workspace ui-workspace--side-end">
          <section className="ui-workspace-main roulette-stage" aria-labelledby="roulette-stage-heading">
            <h2 id="roulette-stage-heading" className="roulette-visually-hidden">
              {STAGE_HEADING}
            </h2>
            {topicTitle !== null && <p className="roulette-topic">{topicNoteText(topicTitle)}</p>}
            {/* 読み上げは role="status"。回している間は当たりの名前を入れない（止まってから入れる） */}
            <p className="roulette-caption" role="status">
              {captionOf({ view: current, phase, poolCount: people.poolCount })}
            </p>
            <SpinControls label={button.label} disabled={button.disabled} onSpin={sync.spin} />
          </section>
          <div className="ui-workspace-side roulette-side">
            <PeoplePanel
              people={people}
              locked={!operable || serverSpinning}
              onInclude={sync.setIncluded}
              onRemoveGuest={sync.removeGuest}
              onAddGuest={sync.addGuest}
              onResetCycle={sync.resetCycle}
            />
            {/* 招待は脇の最後（spec §6.7 の 3 版）。見出しの下に置くと 320px で 2 段を取り、円盤を押し下げる */}
            <section className="ui-panel roulette-invite" aria-labelledby="roulette-invite-heading">
              <h2 id="roulette-invite-heading">{INVITE_HEADING}</h2>
              <InviteLink url={sync.inviteUrl} />
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
