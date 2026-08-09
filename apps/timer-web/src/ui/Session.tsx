/**
 * セッション画面
 * T057: FR-007, FR-017, FR-030 ＋ デザインシステム適用
 */

import React, { useMemo, useState } from "react";
import {
  Crown, ArrowRight, Play, Pause, SkipForward, Shuffle, TimerReset,
} from "lucide-react";
import { secondsLeft, elapsedMs } from "@tasuki/timer-core/aggregate";
import type { Room, Problem } from "@tasuki/timer-core";
import { Card, GhostButton, PrimaryButton } from "./primitives.js";
import { CircularProgress } from "./components/CircularProgress.js";
import { TeamOrbit } from "./components/TeamOrbit.js";
import { RotationLineup } from "./components/RotationLineup.js";
import { rotationMembers } from "./rotation-names.js";
import { RosterPanel } from "./components/RosterPanel.js";
import { isAllowed, canRemoveParticipant, canDemote } from "@tasuki/timer-core";
import { ProblemEditor } from "./components/ProblemEditor.js";
import { EndSessionZone } from "./components/EndSessionZone.js";
import { SelfDriverToggle } from "./components/SelfDriverToggle.js";
import { SpectatorSelfActions } from "./components/SpectatorSelfActions.js";
import { SwitchAlert } from "./components/SwitchAlert.js";
import { SharedMemo } from "./components/SharedMemo.js";
import { useNowTick } from "./use-now-tick.js";
import { useDiscreteAnnouncement } from "./use-discrete-announcement.js";
import { usePrefersReducedMotion } from "./use-reduced-motion.js";
import { useSwitchAlert } from "./use-switch-alert.js";
import { useCountdownTick } from "./use-countdown-tick.js";
import { useIsWide, useViewportWidth } from "./use-breakpoint.js";
import { useNotifyPreferences } from "./use-notify-preferences.js";
import { formatRemaining, formatElapsed } from "./format-time.js";
import { Tabs } from "./components/Tabs.js";
import { InvitePanel } from "./components/InvitePanel.js";
import { PassphrasePanel } from "./components/PassphrasePanel.js";
import { NotifyHint } from "./components/NotifyHint.js";
import { loadNotifyHintSeen, saveNotifyHintSeen } from "../prefs/local-prefs.js";

interface SessionProps {
  room: Room;
  participantId: string;
  clockOffset?: number;
  /** お題の代表生成を待っている間 true（共有時のみ）。生成中表示に使う */
  awaitingProblem?: boolean;
  /** AI/定型のお題を生成中（regenerate 中）。ProblemEditor のスピナー＋減光に使う。 */
  generatingProblem?: boolean;
  /** AI 解錠ルームか（生成中文言の出し分けに使う）。 */
  aiUnlocked?: boolean;
  /** AI モードか（problemMode === "ai"）。生成中文言の出し分けに使う。 */
  aiMode?: boolean;
  onSkip: () => void;
  onPause: () => void;
  onResume: () => void;
  /** 現ドライバーのまま持ち時間を満タンからやり直す（Issue #14・session.act RESTART）。
   *  ホスト専用の全体リセット（onReset・先頭ドライバーへ戻る）とは別操作。 */
  onRestartTimer: () => void;
  onComplete: () => void;
  onAbort: () => void;
  onReset: () => void;
  /** 在席一覧（RosterPanel）の操作ハンドラ（FR-046/047/048/051）。
   *  既存の onSkip（= SWITCH 交代）とは別物の driver.skip/resume を扱う。 */
  onRenameParticipant: (participantId: string, displayName: string) => void;
  onDriverSkip: (participantId: string) => void;
  onDriverResume: (participantId: string) => void;
  /** ホストが任意メンバーを現ドライバーに指名する（Issue #13）。 */
  onDriverAssign: (participantId: string) => void;
  onAddProxy: (displayName: string) => void;
  /** 引き継ぎメモの更新（editor+ のみ・§9.1）。handoff.note.set を送る。 */
  onHandoffNoteSet?: (text: string) => void;
  /** 自分をドライバーローテーションに加える（自分のIDで member.add・2層モデル）。途中参加対応。 */
  onJoinRotation?: (participantId: string) => void;
  /** 自分をローテーションから外す（自分のIDを渡し、index は App が最新 snapshot から解決）。 */
  onLeaveRotation?: (participantId: string) => void;
  /** ホストが参加者を退出させる（⑪・host 限定）。 */
  onRemoveParticipant?: (participantId: string) => void;
  /** 自分の役割を自分で変える（role.set・自己対象）。開始後のみ有効（FR-073b）。 */
  onSelfRoleChange?: (role: "editor" | "viewer") => void;
  /** ホストを任意のオンライン参加者へ明示移譲する（R2-3・host 限定）。 */
  onTransferHost?: (participantId: string) => void;
  /** ドライバー順の入れ替え（v2.3 #1・host）。fromIndex→toIndex（rotation 内の位置・member.move）。 */
  onMoveRotation?: (fromIndex: number, toIndex: number) => void;
  /** ドライバー順をランダムに並べ替える（v2.3 #1・host）。member.shuffle を送る。 */
  onShuffle?: () => void;
  /** お題編集まわり（editor+）。お題が確定している間のみ ProblemEditor から呼ばれる（US3）。
   *  共有時は problem.edit/submit/request、ソロ時は LocalEngine 経由で App が処理する。 */
  onEditProblem?: (patch: Partial<Omit<Problem, "source" | "edited">>) => void;
  onCopyProblem?: () => void;
  onRegenerateProblem?: () => void;
  onPasteProblem?: () => void;
  /** ルームのパスフレーズ設定/解除（R4-2・host 限定）。空文字で解除。 */
  onSetPassphrase?: (passphrase: string) => void;
}

/** 残り時間がこの秒数以下で緊急表示にする */
const URGENT_THRESHOLD_SECONDS = 10;

export function Session({
  room,
  participantId,
  clockOffset = 0,
  awaitingProblem = false,
  generatingProblem = false,
  aiUnlocked = false,
  aiMode = false,
  onSkip,
  onPause,
  onResume,
  onRestartTimer,
  onComplete,
  onAbort,
  onReset,
  onRenameParticipant,
  onDriverSkip,
  onDriverResume,
  onDriverAssign,
  onAddProxy,
  onHandoffNoteSet,
  onJoinRotation,
  onLeaveRotation,
  onRemoveParticipant,
  onSelfRoleChange,
  onTransferHost,
  onMoveRotation,
  onShuffle,
  onEditProblem,
  onCopyProblem,
  onRegenerateProblem,
  onPasteProblem,
  onSetPassphrase,
}: SessionProps) {
  // 初回ヒントを閉じたか（手動 dismiss で永続化）。実際の表示可否は下の notifyPrefs.enabled と
  // 組み合わせて派生で判定し、セッション中に通知を ON にしたら自動的に消えるようにする。
  const [hintDismissed, setHintDismissed] = useState(() => loadNotifyHintSeen());
  const dismissHint = () => { saveNotifyHintSeen(); setHintDismissed(true); };

  // 稼働中は定期的に再レンダリングしてカウントダウンを進める（FR-007・フックに分離）。
  const now = useNowTick(room.clock.running, room.clock.anchorServerTime);
  const elapsed = useMemo(
    () => elapsedMs(room.clock, now, clockOffset),
    [room.clock, now, clockOffset],
  );

  // 表示用の残り時間。サーバー権威の secondsLeft をそのまま使う（0 でクランプ）。
  // 交代＝サーバーの新アンカー snapshot で「ドライバー変更」と「時間リセット」が同時に
  // 反映されるため、二重リセットや先走りロールオーバーは行わない（⑥ 致命傷の修正）。
  // 上限を間隔でクランプする。交代直後に clockOffset 等で残りが一瞬 interval を僅かに超え、
  // ceil 表示で「05:01」のような interval+1 秒が1フレーム出るのを防ぐ（0 下限は secondsLeft 側）。
  const displayRemaining = useMemo(
    () => Math.min(room.clock.intervalSeconds, secondsLeft(room.clock, now, clockOffset)),
    [room.clock, now, clockOffset],
  );

  const currentParticipant = room.participants.find(
    (p) => p.participantId === participantId,
  );
  const isHost = currentParticipant?.role === "host";
  const isEditor = currentParticipant?.role === "editor" || isHost;

  // 画面の活性はサーバーと同じ判定関数で決める（FR-080/081）。
  // isHost で隠していると、サーバーを緩めても利用者から見て何も変わらない。
  // 段階は phase ではなく startedAt を見る（ロビーへ戻しても権限が巻き戻らない・D2）。
  const started = room.startedAt != null;
  /** 自分がそのコマンドを実行できるか。対象を持つ操作は isSelfTarget を渡す。 */
  const can = (command: string, isSelfTarget = false): boolean =>
    currentParticipant !== undefined &&
    isAllowed({ command, role: currentParticipant.role, started, isSelfTarget });
  // 終了系3操作は規則表で同じ扱い（開始前はホスト・開始後は編集者以上）。代表して1つで判定する。
  const canEndSession = can("session.abort");
  // 他の参加者への管理操作（改名・一時離脱・指名・並べ替え・退出・代理追加）をまとめた活性。
  // これらは規則表でも同じ形（開始前は他人対象がホスト限定・開始後は編集者以上）を持つ。
  const canManageOthers = can("participant.remove");

  const rotationLen = room.session.rotation.length;
  const nextIndex =
    rotationLen > 0 ? (room.session.currentIndex + 1) % rotationLen : 0;
  // rotation は参加者IDの配列（D6b）。表示用に「識別子＋表示名」へ一度だけ写す。
  const rotation = rotationMembers(room.session.rotation, room.participants);
  // 現ドライバー・次・ナビは呼び名（同名が並ぶときは識別子つき）で出す。
  // 素の表示名だと同名2名がどちらも「Bob」になり「次は誰か」が判別できない。
  const rotationNames = rotation.map((m) => m.label);
  const currentDriverId = room.session.rotation[room.session.currentIndex] ?? "";
  const currentDriverName =
    rotationNames[room.session.currentIndex] ?? "—";
  const nextDriverName =
    rotationLen > 0 ? (rotationNames[nextIndex] ?? "—") : "—";
  // ナビゲーター（⑦）。次ドライバーと別概念にし、既定では「現ドライバーの前の人
  //（直前に運転していた退役ドライバー）」をメインナビとする。文脈を最も持つ人。
  // rotation が1人のときは現ドライバーと一致するため表示しない。
  const prevIndex = rotationLen > 0 ? (room.session.currentIndex - 1 + rotationLen) % rotationLen : 0;
  const navigatorName =
    room.config.navigatorEnabled && rotationLen > 1
      ? rotationNames[prevIndex]
      : null;

  const isUrgent = room.clock.running && displayRemaining <= URGENT_THRESHOLD_SECONDS;

  // 支援技術向けの離散アナウンス（FR-035・フックに分離）。
  const announcement = useDiscreteAnnouncement({
    running: room.clock.running,
    isPaused: room.session.isPaused,
    currentIndex: room.session.currentIndex,
    isUrgent,
    driverName: currentDriverName,
  });


  // 強い交代通知（§9.1 assertiveSwitch）はカスタムフックに集約。reduced-motion は
  // SwitchAlert の描画にのみ使う（アニメ抑制）。
  const reducedMotion = usePrefersReducedMotion();
  // 個人通知設定をライブ購読する。NotifySettings での保存（同一タブ）と別タブの
  // storage 変更の両方で即時反映され、セッション中の ON/OFF・音変更が次の交代に効く。
  const notifyPrefs = useNotifyPreferences();
  const { switchAlertName, dismissSwitchAlert } = useSwitchAlert(
    room.session.currentIndex,
    currentDriverName,
    { assertiveSwitch: room.config.assertiveSwitch === true, notify: notifyPrefs },
  );

  const intervalSeconds = room.clock.intervalSeconds || 1;
  const progress = ((intervalSeconds - displayRemaining) / intervalSeconds) * 100;
  const isPaused = room.session.isPaused;
  const running = room.clock.running;

  // 交代前カウントダウン予告音（Issue #2）。個人設定でON/OFF・予告秒数を制御。
  useCountdownTick(displayRemaining, running, {
    enabled: notifyPrefs.countdownEnabled,
    thresholdSeconds: notifyPrefs.countdownSeconds,
    volume: notifyPrefs.volume,
    mode: notifyPrefs.countdownMode,
    voiceId: notifyPrefs.countdownVoiceId,
  });

  // PC ではタイマーを主役として大きく見せる（ステージ感・モバイルは収まるサイズに）。
  const isWide = useIsWide();
  // モバイルでは円形計器（固定 px）が Card 内に収まるよう、ビューポート幅から
  // 利用可能幅（Stage px-4=32 + Card p-6=48 + 枠 2 を差し引く）でクランプする。
  // これで 360px 幅でも TeamOrbit/CircularProgress が横にはみ出さない（R5-3）。
  const vw = useViewportWidth();
  const mobileMaxOrbit = Math.min(340, Math.max(248, vw - 82));
  const orbitSize = isWide ? 460 : mobileMaxOrbit;
  // リング（タイマー）は orbit に対して概ね 224/340 の比率を保ち、アバターと重ならない大きさに。
  const ringSize = isWide ? 300 : Math.round(mobileMaxOrbit * (224 / 340));

  // 「セッション」タブのコンテンツ（既存 UI をそのまま移動）。
  const sessionPanel = (
    <div className="space-y-6">
      {/* 初回ヒント（未読かつ通知 OFF のときのみ）。閉じる or 通知 ON で消える。 */}
      {!hintDismissed && !notifyPrefs.enabled && <NotifyHint onDismiss={dismissHint} />}
      {/* お題（確定後）。editor+ は ProblemEditor で各フィールドを編集できる
          （FR-009/013/038/040/041）。未確定で生成待ちなら生成中表示（FR-003, US3-AC5）。
          problemEnabled=false のときはお題ブロック自体を表示しない。 */}
      {room.config.problemEnabled !== false && (room.problem ? (
        <Card>
          <ProblemEditor
            problem={room.problem}
            canEdit={isEditor}
            difficulty={room.config.difficulty}
            language={room.config.language}
            compact
            onEdit={(patch) => onEditProblem?.(patch)}
            onCopy={() => onCopyProblem?.()}
            onRegenerate={() => onRegenerateProblem?.()}
            onPaste={() => onPasteProblem?.()}
            generating={generatingProblem}
          />
        </Card>
      ) : (
        awaitingProblem && (
          <Card>
            <div className="py-8 text-center text-[var(--bone-subtle)]" aria-live="polite">
              <span className="inline-block h-4 w-4 animate-pulse rounded-full bg-[var(--signal)] mb-2" aria-hidden="true" />
              <p>
                {aiUnlocked && aiMode
                  ? "AI がお題を作成中です…（最大 1 分）"
                  : "お題を生成中…"}
              </p>
            </div>
          </Card>
        )
      ))}

      {/* PC（lg+）は「左＝タイマー主役＋ホスト操作 / 右＝参加者・引き継ぎ」の2カラム。
          モバイルは素直に縦積み（space-y-6）になる。 */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6 lg:items-start space-y-6 lg:space-y-0">
      {/* ── 左（メイン）: タイマー＋ホスト操作 ── */}
      <div className="space-y-6 lg:min-w-0">
      {/* ドライバーパネル（タイマー＝円形プログレス、人＝円周配置、現ドライバー＝Crown） */}
      <Card className={`relative overflow-hidden transition-all`}>
        {/* 現ドライバー背後の微かな朱の発光（計器の照明）。虹色グラデは廃止。 */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_22%,var(--signal-tint),transparent_58%)] pointer-events-none" />
        <div className="relative text-center py-4">
          <div className="instrument-label mb-3">Current Driver</div>
          <div
            key={currentDriverName}
            className="driver-name-fluid font-black mb-5 text-[var(--bone)] animate-fade-up drop-shadow-[0_0_8px_var(--signal-edge)]"
          >
            <Crown className="w-10 h-10 md:w-12 md:h-12 inline mr-3 text-[var(--signal)]" aria-hidden="true" />
            {currentDriverName}
          </div>

          <div className="flex justify-center mb-4 boot-reveal" style={{ animationDelay: "60ms" }}>
            <TeamOrbit members={rotation} currentIndex={room.session.currentIndex} size={orbitSize}>
              <CircularProgress
                progress={progress}
                warning={isUrgent}
                running={running && !isPaused}
                size={ringSize}
                strokeWidth={isWide ? 14 : 11}
              >
                {/* タイマー（残り10秒で緊急色）。role="timer" で意味付与、aria-live は off。 */}
                <div
                  role="timer"
                  aria-live="off"
                  aria-label={`残り時間 ${formatRemaining(displayRemaining)}`}
                  className={`text-6xl lg:text-7xl font-black tabular tracking-tight ${
                    isUrgent ? "text-[var(--urgent)] animate-pulse" : "text-[var(--bone)]"
                  } ${isPaused ? "opacity-50" : ""}`}
                >
                  {formatRemaining(displayRemaining)}
                </div>
                {isPaused && (
                  <div className="instrument-label mt-1 text-[10px]">Paused</div>
                )}
              </CircularProgress>
            </TeamOrbit>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 text-lg text-[var(--bone-muted)] boot-reveal" style={{ animationDelay: "150ms" }}>
            <ArrowRight className="w-5 h-5 text-[var(--steel)]" aria-hidden="true" />
            次: <span className="text-[var(--bone)] font-bold text-lg">{nextDriverName}</span>
            {room.config.navigatorEnabled && navigatorName && (
              <span className="ml-3 text-[var(--bone-subtle)]">ナビ: <span className="text-[var(--bone-muted)]">{navigatorName}</span></span>
            )}
          </div>

          {/* 交代順ストリップ（読み取り専用・「自分はいつ？」確認用） */}
          <div className="mt-3">
            <RotationLineup
              rotation={rotation}
              currentIndex={room.session.currentIndex}
              intervalSeconds={room.clock.intervalSeconds || 1}
              selfIndex={currentParticipant ? room.session.rotation.indexOf(currentParticipant.participantId) : -1}
              isPaused={room.session.isPaused}
            />
          </div>

          {/* 統計（等幅タビュラーで計測値らしく） */}
          <div className="mt-4 flex justify-center gap-6 text-base text-[var(--bone-subtle)]">
            <span>経過 <span className="tabular text-[var(--bone-muted)]">{formatElapsed(elapsed)}</span></span>
            <span>交代 <span className="tabular text-[var(--bone-muted)]">{room.session.totalSwitches}</span>回</span>
          </div>
        </div>

        {/* 操作（編集者：スキップ／一時停止・再開） */}
        <div className="relative flex flex-wrap justify-center gap-2 pt-2 boot-reveal" style={{ animationDelay: "230ms" }}>
          {isEditor && (
            <>
              {isPaused || !running ? (
                <PrimaryButton onClick={onResume} disabled={!isPaused}>
                  <span className="flex items-center gap-2"><Play className="w-5 h-5" aria-hidden="true" /> 再開</span>
                </PrimaryButton>
              ) : (
                <GhostButton onClick={onPause}>
                  <span className="flex items-center gap-2"><Pause className="w-4 h-4" aria-hidden="true" /> 一時停止</span>
                </GhostButton>
              )}
              <GhostButton onClick={onSkip} disabled={!running}>
                <span className="flex items-center gap-2"><SkipForward className="w-4 h-4" aria-hidden="true" /> スキップ</span>
              </GhostButton>
              {/* 「時間リセット」＝持ち時間のやり直し（Issue #14）。人は変えず、現ドライバーの
                  時間だけ満タンから走り直す。ホスト専用の「最初から」（先頭ドライバーへ戻す
                  全体リセット・EndSessionZone の赤いボタン）とは文言・アイコン・置き場所で
                  区別する。ラベルは短く保ち、詳細は title 属性で補う。
                  一時停止中でも押せる（押すと走行再開する）ため disabled にしない。 */}
              <GhostButton
                onClick={onRestartTimer}
                title="同じドライバーのまま、持ち時間を最初からやり直します"
              >
                <span className="flex items-center gap-2"><TimerReset className="w-4 h-4" aria-hidden="true" /> 時間リセット</span>
              </GhostButton>
            </>
          )}
        </div>
      </Card>

      {/* 終了系3操作の隔離ゾーン（完成/中断/リセット・確認つき・FR-018/019/044）。
          開始後は主催者以外にも提示する（FR-081）。 */}
      {canEndSession && (
        <Card>
          <EndSessionZone
            onComplete={onComplete}
            onAbort={onAbort}
            onReset={onReset}
            isShared={room.code !== "SOLO"}
          />
        </Card>
      )}
      </div>{/* /左（メイン） */}

      {/* ── 右（サイド）: 参加者一覧＋引き継ぎメモ ── */}
      <div className="space-y-6 lg:min-w-0">
      {/* 在席一覧（RosterPanel）。改名・一時離脱・代理追加・観覧表示・現ドライバー
          ハイライト（FR-046/047/048/050/051/061）。現ドライバーは rotation の識別子で判定。 */}
      <Card>
        {/* 自分のドライバー状態と加入/離脱（2層モデル・途中参加対応・D1）。editor+ のみ。 */}
        {isEditor && currentParticipant && (
          <SelfDriverToggle
            inRotation={room.session.rotation.includes(currentParticipant.participantId)}
            isSkipping={currentParticipant.driverEligible === false}
            canLeave={room.session.rotation.length > 1}
            participantId={currentParticipant.participantId}
            onJoin={onJoinRotation}
            onLeave={onLeaveRotation}
            onSkip={onDriverSkip}
            onResume={onDriverResume}
            // 自己退出は participant.remove に自分の participantId を渡す（新コマンドは不要）。
            onLeaveRoom={onRemoveParticipant}
            // 不変条件（編集者以上が1名以上残る）はサーバーと同じ関数に問う。
            // 押せるボタンを出しておいて拒否するのは FR-080 に反する。
            canLeaveRoom={canRemoveParticipant(room.participants, currentParticipant.participantId)}
            started={started}
            onSelfRoleChange={onSelfRoleChange}
            // 自己降格も自己退出と同じく、押してから拒否されないよう事前に判定する（FR-080）。
            canSpectate={canDemote(room.participants, currentParticipant.participantId)}
          />
        )}
        {/* 見学者には SelfDriverToggle が出ないので、自己解消の導線をここに置く。
            これが無いと開始後に進行へ戻ることも部屋を抜けることもできない（FR-073b/079）。 */}
        {!isEditor && currentParticipant && (
          <SpectatorSelfActions
            participantId={currentParticipant.participantId}
            role={currentParticipant.role}
            started={started}
            onSelfRoleChange={onSelfRoleChange}
            onLeaveRoom={onRemoveParticipant}
          />
        )}
        {/* ホストはセッション中でもロスターからドライバー順をランダム化できる（v2.3 #1）。
            2人以上で意味を持つ。RosterPanel 内の上/下並べ替え（onMove）と対で配置。 */}
        {canManageOthers && onShuffle && rotationLen > 1 && (
          <div className="mb-3 flex justify-end">
            <GhostButton onClick={onShuffle} aria-label="ドライバー順をランダムに並べ替える" className="text-sm">
              <span className="flex items-center gap-1.5"><Shuffle className="w-4 h-4" aria-hidden="true" /> ランダム</span>
            </GhostButton>
          </div>
        )}
        <RosterPanel
          participants={room.participants}
          currentDriverId={currentDriverId}
          myParticipantId={participantId}
          canManage={canManageOthers}
          // 自分の一時離脱/復帰は上の SelfDriverToggle が担うため、行には出さず重複を避ける（#1）。
          selfHasExternalToggle={isEditor}
          rotation={room.session.rotation}
          onMove={onMoveRotation}
          onRename={onRenameParticipant}
          onSkip={onDriverSkip}
          onResume={onDriverResume}
          onAssignDriver={onDriverAssign}
          onAddProxy={onAddProxy}
          onRemove={onRemoveParticipant}
          isShared={room.code !== "SOLO"}
          // 開始後は開始者を「特権の保持者」として扱わないので移譲の概念も出さない（FR-082）。
          onTransferHost={started ? undefined : onTransferHost}
          scrollable
        />
      </Card>

      {/* 共有メモ（§9.1 拡張）。編集/プレビュー・Markdown 表示・閲覧者の読み取りは SharedMemo に集約。 */}
      <SharedMemo note={room.handoffNote} canEdit={isEditor} onCommit={onHandoffNoteSet} />
      </div>{/* /右（サイド） */}
      </div>{/* /2カラムグリッド */}

    </div>
  );

  return (
    <div role="main" aria-label="セッション">
      <Tabs
        ariaLabel="セッション"
        items={[
          { id: "session", label: "セッション", content: sessionPanel },
          {
            id: "room",
            label: "ルーム",
            content: (
              <div className="space-y-6">
                <InvitePanel code={room.code} />
                {/* ルームのパスフレーズ設定/解除（R4-2・host 限定）。招待のすぐ下に置く。 */}
                {can("room.passphrase.set") && onSetPassphrase && (
                  <Card>
                    <PassphrasePanel
                      protectedNow={!!room.passphraseProtected}
                      onSet={onSetPassphrase}
                    />
                  </Card>
                )}
                {/* このタブには SelfDriverToggle が無いため、自分の一時離脱/復帰は行に出す
                    （セッションタブ側は SelfDriverToggle が担うので行には出さない＝#1）。 */}
                <Card>
                  {/* Room タブだけを見ている人が取り残されないよう、同じ導線をここにも置く。 */}
                  {!isEditor && currentParticipant && (
                    <SpectatorSelfActions
                      participantId={currentParticipant.participantId}
                      role={currentParticipant.role}
                      started={started}
                      onSelfRoleChange={onSelfRoleChange}
                      onLeaveRoom={onRemoveParticipant}
                    />
                  )}
                  {/* 編集者以上は Session タブの SelfDriverToggle が自己退出を担うが、
                      Room タブだけを見ている場合に導線が消えないよう、ここにも出す。 */}
                  {isEditor && currentParticipant && onRemoveParticipant && (
                    <div className="mb-3 flex justify-end">
                      <GhostButton
                        onClick={() => onRemoveParticipant(currentParticipant.participantId)}
                        className="text-xs px-3 py-1.5"
                        title="この端末をルームから外します。招待から再参加できます。"
                      >
                        ルームから抜ける
                      </GhostButton>
                    </div>
                  )}
                  {/* ルームタブでもホストはランダム化できる（v2.3 #1・セッションタブと同等）。 */}
                  {canManageOthers && onShuffle && rotationLen > 1 && (
                    <div className="mb-3 flex justify-end">
                      <GhostButton onClick={onShuffle} aria-label="ドライバー順をランダムに並べ替える" className="text-sm">
                        <span className="flex items-center gap-1.5"><Shuffle className="w-4 h-4" aria-hidden="true" /> ランダム</span>
                      </GhostButton>
                    </div>
                  )}
                  <RosterPanel
                    participants={room.participants}
                    currentDriverId={currentDriverId}
                    myParticipantId={participantId}
                    canManage={canManageOthers}
                    selfHasExternalToggle={false}
                    rotation={room.session.rotation}
                    onMove={onMoveRotation}
                    onRename={onRenameParticipant}
                    onSkip={onDriverSkip}
                    onResume={onDriverResume}
                    onAssignDriver={onDriverAssign}
                    onAddProxy={onAddProxy}
                    onRemove={onRemoveParticipant}
                    isShared={room.code !== "SOLO"}
                    // 開始後は開始者を「特権の保持者」として扱わないので移譲の概念も出さない（FR-082）。
                    onTransferHost={started ? undefined : onTransferHost}
                    scrollable
                  />
                </Card>
              </div>
            ),
          },
        ]}
      />
      {/* 交代通知・支援技術アナウンスはどのタブでも有効にする（タブに依存しない重要イベント） */}
      <div aria-live="assertive" role="status" className="sr-only">
        {announcement}
      </div>
      {switchAlertName && (
        <SwitchAlert
          driverName={switchAlertName}
          reducedMotion={reducedMotion}
          onDismiss={dismissSwitchAlert}
        />
      )}
    </div>
  );
}

