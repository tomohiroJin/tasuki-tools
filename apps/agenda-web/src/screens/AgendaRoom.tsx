/**
 * 進行タイマーのルームの画面（#429）。
 *
 * 段階で中身を切り替える: 開始前は組む画面（`ScenarioBuilder`）、進行中・一時停止中・終了は進める画面（`RunScreen`）。
 * 合図（時打ち・読み上げ）は段階をまたいで前の盤と比べるので、段階の切り替えの外（ここ）で持つ。
 * 器（`.ui-page--wide`）は段階が変わっても変えない（`packages/ui/README.md`「器の選び方」）。
 * ここで名前は聞かない（名乗りは玄関に 1 つだけ・`docs/adr/0018`）。端末に同一性が無い・合言葉を求められたら
 * 玄関のそのルームへ送り返す（コードは落とさない）。
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { AgendaView } from '@tasuki/agenda-core';
import { ROOM_HEADER_TEXT, RoomHeader } from '@tasuki/invite-ui';
import { ConnectionBanner, LoadingView, RoomGoneView, RoomJoiningView, useHubRedirect, usePrefersReducedMotion } from '@tasuki/web-kit/room';
import { summaryText } from '../agenda-view';
import { RunScreen } from '../components/RunScreen';
import { ScenarioBuilder } from '../components/ScenarioBuilder';
import { SoundToggle } from '../components/SoundToggle';
import { useLocalClock } from '../hooks/use-local-clock';
import { useRunSignals } from '../hooks/use-run-signals';
import { useSoundSetting } from '../hooks/use-sound-setting';
import { useWallClock } from '../hooks/use-wall-clock';
import { CLOSE_BUTTON, PAGE_HEADING } from '../copy';
import { useAgendaSync, type AgendaSync } from '../hooks/use-agenda-sync';
import { hubPathFor, redirectTo } from '../router';

/** 「開始」を押してから、進行中が届けば本人の開始の返事と見なす時間（ms）。遅い回線でも届き、他の人の開始と取り違えにくい長さ */
const START_ARRIVAL_WINDOW_MS = 10_000;

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
  useHubRedirect({ departed: sync.departed, needsHub: sync.needsHub, roomCode, hubPathFor, redirectTo });

  // 消えたルームの選択画面へは送らない（そこで名乗っても必ず失敗する）
  if (sync.gone) return <RoomGoneView />;
  if (sync.needsHub || sync.departed !== null) return <LoadingView />;

  const view = sync.agenda;
  if (!sync.joined && view === null) {
    return (
      <RoomJoiningView
        backHref={hubPathFor(roomCode)}
        backLabel={ROOM_HEADER_TEXT.back}
        retryNotice={sync.retryNotice}
        error={sync.error}
        banner={<ConnectionBanner kind={sync.notice} />}
        bannerPlacement="after-header"
      />
    );
  }

  return (
    <>
      {/* 接続の告知の帯。手元の画面では本文（main）の直前（上端に貼りつく）。映している間は全面を覆う映す表示の外では
          覆われて見えないので、ここでは描かず、映す表示の中の上端に置く（`banner` で渡す・切れていることは隠さない） */}
      {!projecting && <ConnectionBanner kind={sync.notice} />}
      <main className="ui-page ui-page--wide">
        {/* 映している間は描かない（全画面の重ねの裏に押せる部品を残さない）。見出し・戻る・招待は共通の部品が描く（#447 段 1） */}
        {!projecting && (
          <RoomHeader title={PAGE_HEADING} backHref={hubPathFor(roomCode)} roomCode={roomCode} inviteUrl={sync.inviteUrl} />
        )}
        {!projecting && sync.error && (
          <p className="agenda-error ui-note ui-note--error" role="alert">
            {sync.error}
            <button type="button" className="ui-button ui-button--quiet ui-button--sm" onClick={sync.clearError}>
              {CLOSE_BUTTON}
            </button>
          </p>
        )}
        {view !== null && <PhaseView view={view} sync={sync} projecting={projecting} onProjectingChange={setProjecting} banner={<ConnectionBanner kind={sync.notice} />} />}
      </main>
    </>
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
  banner,
}: {
  view: AgendaView;
  sync: AgendaSync;
  projecting: boolean;
  onProjectingChange: (projecting: boolean) => void;
  /** 接続の告知の帯（映す表示の中に置くため、進める画面へ渡す） */
  banner: ReactNode;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const live = useLocalClock(view, sync.receivedAt, reducedMotion) ?? view;
  const wallNow = useWallClock();
  const { soundState, soundOn, toggleSound } = useSoundSetting();
  const { striking, announcement, announce } = useRunSignals(live, { frame: view, joined: sync.joined, soundOn, reducedMotion });
  // 「開始」を押した本人の印（押した時刻）。進める画面の最初の描画で消費する（他の参加者の画面は位相が変わっても寄せない・#455）。
  // 返事が来ない開始（同じ文言の失敗で表示が変わらない・送信が黙って落ちた）でも印が残らないよう、時間で切る
  const startedAtRef = useRef<number | null>(null);
  const syncStart = sync.start;
  const start = useCallback(() => {
    startedAtRef.current = Date.now();
    syncStart();
  }, [syncStart]);
  const consumeStartArrival = useCallback(() => {
    const at = startedAtRef.current;
    startedAtRef.current = null;
    return at !== null && Date.now() - at <= START_ARRIVAL_WINDOW_MS;
  }, []);
  // 送信が失敗したら印を消す（後で他の人が開始した画面を動かさない）
  useEffect(() => {
    if (sync.error !== null) startedAtRef.current = null;
  }, [sync.error]);
  return (
    <>
      {view.phase === 'idle' ? (
        <ScenarioBuilder view={view} canOperate={sync.joined} onLoad={sync.setScenario} onStart={start} />
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
          consumeStartArrival={consumeStartArrival}
          soundToggle={<SoundToggle state={soundState} onToggle={toggleSound} />}
          banner={banner}
        />
      )}
      <p className="ui-visually-hidden agenda-live" aria-live="polite">
        {announcement}
      </p>
    </>
  );
}
