/**
 * ルーレットのルームの画面（#94・spec §5.6）。1 画面で完結させる。
 *
 * **ここで名前は聞かない**（名乗りは玄関に 1 つだけ・`docs/adr/0018`）。端末に同一性が無い・
 * 合言葉を求められたら、玄関のそのルームへ送り返す（コードは落とさない）。
 *
 * 舞台（円盤・札・一言・回す）は `Stage` が持つ（PR 3）。
 */
import { useCallback, useEffect, useState } from 'react';
import { InviteLink } from '../components/InviteLink';
import { LoadingView } from '../components/LoadingView';
import { ModePanel } from '../components/ModePanel';
import { PeoplePanel } from '../components/PeoplePanel';
import { Stage } from '../components/Stage';
import {
  BACK_LINK,
  GONE_HEADING,
  GONE_LINK,
  GONE_TEXT,
  INVITE_HEADING,
  JOINING_HEADING,
  PAGE_HEADING,
} from '../copy';
import { useRouletteSync } from '../hooks/use-roulette-sync';
import { usePrefersReducedMotion } from '../hooks/use-reduced-motion';
import { hubPathFor, redirectTo } from '../router';
import {
  canOperate,
  captionOf,
  connectionNotice,
  cycleLineOf,
  isServerSpinning,
  membersOf,
  modeOf,
  orderButtonOf,
  orderCaptionOf,
  orderProgressOf,
  orderStageOf,
  peopleOf,
  phaseOf,
  pickCountOf,
  picksOf,
  poolOfView,
  revealedCountOf,
  spinButtonOf,
  stageViewOf,
} from '../roulette-view';
import { pickStopsMs } from '@tasuki/roulette-core';
import { usePressMotion } from '../hooks/use-press-motion';
import { pressButtonOf, pressCaptionOf, pressStopOfView, withPressStop } from '../press-view';

/**
 * 画面が使う「いま」。回転の終わりと、2 人以上なら**各人が止まる時刻**（`wakeAts`・`performance.now()` の時刻）に描き直す。
 * **止まったかの判定（`phaseOf`）の時計はこれ 1 つ**。円盤（`Stage`）も局面を受けて止まる。
 *
 * **`receivedAt` を下限にする**: 状態を受け取った直後の描画で、古い「いま」を使うと経過が
 * 受け取った値より小さく見え、終わっている回転が一瞬「回っている」になる。
 * 終わりは rAF に頼らない（裏のタブでは止まる）。残り時間の後に必ず描き直す。
 */
function useNowMs(receivedAt: number, wakeAts: readonly number[]): number {
  const [tick, setTick] = useState(() => performance.now());
  const key = wakeAts.join(',');
  useEffect(() => {
    // まだ来ていない時刻すべてに timer を置く（#401: 1 人ずつ止まる）。1 つずつ待ち直す形にすると、
    // 裏のタブで timer が遅れて一度に起きたとき、次の時刻を「もう過ぎた」と見て待たずに止まったままになる
    const now = performance.now();
    const timers = wakeAts.filter((at) => at > now).map((at) => setTimeout(() => setTick(performance.now()), at - now + 30));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 時刻の列は key（中身）で比べる（描くたびに新しい配列になる）
  }, [key]);
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
  const wakeAts =
    spin === null
      ? []
      : [...pickStopsMs(picksOf(spin).length, spin.stopStyle), spin.durationMs].map((at) => sync.receivedAt + at - spin.elapsedMs);
  const nowMs = useNowMs(sync.receivedAt, wakeAts);

  // 押して止める（#401）。位置と「止まって寄せ終わったか」は画面の時計で動くので、早い return より前で持つ
  const pressSpin = view !== null && modeOf(view) === 'press' ? stageViewOf(view).spin : null;
  const motion = usePressMotion({ spin: pressSpin, receivedAt: sync.receivedAt, nowMs });
  const { press: pressMotion } = motion;
  const { stopPress } = sync;
  const doStop = useCallback(() => {
    const sent = pressMotion();
    if (sent !== null) stopPress(sent.seq, sent.index, sent.settle);
  }, [pressMotion, stopPress]);
  // 回っている間は、文字の欄に居なければ Space でも止められる（spec P9。フォーカスを勝手に動かさない）
  const canStopByKey = pressSpin !== null && motion.stop === null && !motion.pressedHere && canOperate(sync.status, sync.joined);
  useEffect(() => {
    if (!canStopByKey) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== ' ' || event.repeat) return;
      const target = event.target as HTMLElement | null;
      // 文字の欄では空白を打つ。ボタンの上の Space はそのボタンが押す
      if (target?.closest('input, textarea, select, button, [contenteditable="true"]')) return;
      event.preventDefault();
      doStop();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canStopByKey, doStop]);

  const notice = connectionNotice(sync.notice);
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
  const received = view ?? { excluded: [], guests: [], drawn: [], spin: null };
  // 回せるかはサーバーの回転で決める（決め方に合わない回転でも、回っている間はサーバーが拒む）
  const operable = canOperate(sync.status, sync.joined);
  // 押して止める回転は、止まるまで（押されるか 30 秒たつまで）サーバーが回っているとみなす
  const serverSpinning =
    received.spin?.press !== undefined
      ? pressStopOfView(received.spin, sync.receivedAt, nowMs) === null
      : isServerSpinning(received, sync.receivedAt, nowMs);
  // 舞台と一覧は、決め方に合う回転だけを読む（#401 順番に回す）
  const mode = modeOf(received);
  const pressing = mode === 'press';
  // 押して止めるときは、30 秒の自動の停止も止まった位置として書き込む（サーバーは配り直さない）
  const current = pressing ? withPressStop(stageViewOf(received), motion.stop) : stageViewOf(received);
  // 押して止めるときの局面は、止まって寄せ終わったか（動きを減らす設定でも回す・spec P8）
  const phase = pressing
    ? current.spin === null
      ? 'idle'
      : motion.landed
        ? 'settled'
        : 'spinning'
    : phaseOf({ view: current, receivedAt: sync.receivedAt, nowMs, reducedMotion });
  const revealed = pressing
    ? phase === 'settled'
      ? 1
      : 0
    : revealedCountOf({ view: current, receivedAt: sync.receivedAt, nowMs, reducedMotion });
  // 入る人は 1 回だけ組み、一覧と円盤へ渡す
  const members = membersOf(sync.roster);
  const pool = poolOfView(members, current);
  const order = mode === 'order' ? orderStageOf({ view: current, pool, phase, revealed }) : null;
  // 押して止めるときは一周の印を出さない（一周を使わない・spec P6）
  const turns = order?.turns ?? (pressing ? new Map<string, number>() : undefined);
  const people = peopleOf({ members, view: current, selfId: sync.selfId, phase, pool, revealed, turns });
  const pressButton = pressing
    ? pressButtonOf({
        hasSpin: current.spin !== null,
        stopped: motion.stop !== null,
        landed: motion.landed,
        pressedHere: motion.pressedHere,
        poolCount: people.poolCount,
        operable,
      })
    : null;
  const button =
    pressButton !== null
      ? pressButton
      : order === null
        ? spinButtonOf({ view: current, poolCount: people.poolCount, operable, serverSpinning })
        : orderButtonOf({ order, poolCount: people.poolCount, operable, serverSpinning });
  const winnerName = motion.stop === null ? null : (current.spin?.wheel[motion.stop.index]?.name ?? null);
  const pressCaption = pressing ? pressCaptionOf({ phase, stop: motion.stop, winnerName, poolCount: people.poolCount }) : null;
  const caption =
    pressCaption !== null
      ? pressCaption.text
      : order === null
        ? captionOf({ view: current, phase, poolCount: people.poolCount })
        : orderCaptionOf({ view: current, phase, poolCount: people.poolCount, order });
  const topicTitle = sync.topic?.topic?.title ?? null;
  const locked = !operable || serverSpinning;

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
            お題 → 結果の一言 → 回す → 決め方 → 入る人 → 名前を追加 → 仲間を招く */}
        <div className="ui-workspace ui-workspace--side-end">
          <Stage
            pool={pool}
            view={current}
            phase={phase}
            revealed={revealed}
            receivedAt={sync.receivedAt}
            reducedMotion={reducedMotion}
            people={people}
            topicTitle={topicTitle}
            caption={caption}
            button={button}
            onSpin={pressButton?.stop === true ? doStop : sync.spin}
            order={order}
            pressPosition={pressing ? motion.position : null}
            captionHidden={pressCaption?.hidden ?? ''}
          />
          <div className="ui-workspace-side roulette-side">
            {/* 脇は 決め方 → 入る人 → 仲間を招く（#401 順番に回す T9）。決め方ごとの設定と進み具合は決め方の面だけが持つ */}
            <ModePanel
              mode={mode}
              locked={locked}
              inRound={order?.inRound === true}
              onMode={sync.setMode}
              pickCount={pickCountOf(current)}
              onPickCount={sync.setPickCount}
              cycleLine={cycleLineOf(people.drawnCount, people.poolCount)}
              onResetCycle={sync.resetCycle}
              orderProgress={order === null ? '' : orderProgressOf(order)}
              canResetOrder={(current.order ?? null) !== null}
              onResetOrder={sync.resetOrder}
            />
            <PeoplePanel
              people={people}
              locked={locked}
              onInclude={sync.setIncluded}
              onRemoveGuest={sync.removeGuest}
              onAddGuest={sync.addGuest}
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
