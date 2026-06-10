/**
 * セッション画面
 * T057: FR-007, FR-017, FR-030 ＋ デザインシステム適用
 */

import React, { useMemo } from "react";
import {
  Crown, ArrowRight, Play, Pause, SkipForward, Flag, RotateCcw, Coffee,
} from "lucide-react";
import { secondsLeft, elapsedMs } from "@tdd-mob/core/aggregate";
import type { Room, Problem } from "@tdd-mob/core";
import { Card, GhostButton, PrimaryButton } from "./primitives.js";
import { CircularProgress } from "./components/CircularProgress.js";
import { TeamOrbit } from "./components/TeamOrbit.js";
import { RosterPanel } from "./components/RosterPanel.js";
import { ProblemEditor } from "./components/ProblemEditor.js";
import { EndSessionZone } from "./components/EndSessionZone.js";
import { SelfDriverToggle } from "./components/SelfDriverToggle.js";
import { SwitchAlert } from "./components/SwitchAlert.js";
import { SharedMemo } from "./components/SharedMemo.js";
import { useNowTick } from "./use-now-tick.js";
import { useDiscreteAnnouncement } from "./use-discrete-announcement.js";
import { usePrefersReducedMotion } from "./use-reduced-motion.js";
import { useSwitchAlert } from "./use-switch-alert.js";
import { useIsWide, useViewportWidth } from "./use-breakpoint.js";
import { formatRemaining, formatElapsed } from "./format-time.js";
import { Tabs } from "./components/Tabs.js";
import { InvitePanel } from "./components/InvitePanel.js";
import { PassphrasePanel } from "./components/PassphrasePanel.js";

interface SessionProps {
  room: Room;
  participantId: string;
  clockOffset?: number;
  /** お題の代表生成を待っている間 true（共有時のみ）。生成中表示に使う */
  awaitingProblem?: boolean;
  onSkip: () => void;
  onPause: () => void;
  onResume: () => void;
  onComplete: () => void;
  onAbort: () => void;
  onReset: () => void;
  onBreakStart: () => void;
  onBreakEnd: () => void;
  /** 在席一覧（RosterPanel）の操作ハンドラ（FR-046/047/048/051）。
   *  既存の onSkip（= SWITCH 交代）とは別物の driver.skip/resume を扱う。 */
  onRenameParticipant: (participantId: string, displayName: string) => void;
  onDriverSkip: (participantId: string) => void;
  onDriverResume: (participantId: string) => void;
  onAddProxy: (displayName: string) => void;
  /** 引き継ぎメモの更新（editor+ のみ・§9.1）。handoff.note.set を送る。 */
  onHandoffNoteSet?: (text: string) => void;
  /** 自分をドライバーローテーションに加える（自名で member.add・2層モデル）。途中参加対応。 */
  onJoinRotation?: (displayName: string) => void;
  /** 自分をローテーションから外す（自名を渡し、index は App が最新 snapshot から解決）。 */
  onLeaveRotation?: (displayName: string) => void;
  /** ホストが参加者を退出させる（⑪・host 限定）。 */
  onRemoveParticipant?: (participantId: string) => void;
  /** ホストを任意のオンライン参加者へ明示移譲する（R2-3・host 限定）。 */
  onTransferHost?: (participantId: string) => void;
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
  onSkip,
  onPause,
  onResume,
  onComplete,
  onAbort,
  onReset,
  onBreakStart,
  onBreakEnd,
  onRenameParticipant,
  onDriverSkip,
  onDriverResume,
  onAddProxy,
  onHandoffNoteSet,
  onJoinRotation,
  onLeaveRotation,
  onRemoveParticipant,
  onTransferHost,
  onEditProblem,
  onCopyProblem,
  onRegenerateProblem,
  onPasteProblem,
  onSetPassphrase,
}: SessionProps) {
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

  const rotationLen = room.session.rotation.length;
  const nextIndex =
    rotationLen > 0 ? (room.session.currentIndex + 1) % rotationLen : 0;
  const currentDriverName =
    room.session.rotation[room.session.currentIndex] ?? "—";
  const nextDriverName =
    rotationLen > 0 ? (room.session.rotation[nextIndex] ?? "—") : "—";
  // ナビゲーター（⑦）。次ドライバーと別概念にし、既定では「現ドライバーの前の人
  //（直前に運転していた退役ドライバー）」をメインナビとする。文脈を最も持つ人。
  // rotation が1人のときは現ドライバーと一致するため表示しない。
  const prevIndex = rotationLen > 0 ? (room.session.currentIndex - 1 + rotationLen) % rotationLen : 0;
  const navigatorName =
    room.config.navigatorEnabled && rotationLen > 1
      ? room.session.rotation[prevIndex]
      : null;

  const isUrgent = room.clock.running && displayRemaining <= URGENT_THRESHOLD_SECONDS;

  // 支援技術向けの離散アナウンス（FR-035・フックに分離）。
  const announcement = useDiscreteAnnouncement({
    running: room.clock.running,
    isPaused: room.session.isPaused,
    onBreak: room.onBreak,
    currentIndex: room.session.currentIndex,
    isUrgent,
    driverName: currentDriverName,
  });


  // 強い交代通知（§9.1 assertiveSwitch）はカスタムフックに集約。reduced-motion は
  // SwitchAlert の描画にのみ使う（アニメ抑制）。
  const reducedMotion = usePrefersReducedMotion();
  const { switchAlertName, dismissSwitchAlert } = useSwitchAlert(
    room.session.currentIndex,
    room.config.assertiveSwitch === true,
    currentDriverName,
  );

  const intervalSeconds = room.clock.intervalSeconds || 1;
  const progress = ((intervalSeconds - displayRemaining) / intervalSeconds) * 100;
  const isPaused = room.session.isPaused;
  const running = room.clock.running;

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
      {/* お題（確定後）。editor+ は ProblemEditor で各フィールドを編集できる
          （FR-009/013/038/040/041）。未確定で生成待ちなら生成中表示（FR-003, US3-AC5）。 */}
      {room.problem ? (
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
          />
        </Card>
      ) : (
        awaitingProblem && (
          <Card>
            <div className="py-8 text-center text-[var(--bone-subtle)]" aria-live="polite">
              <span className="inline-block h-4 w-4 animate-pulse rounded-full bg-[var(--signal)] mb-2" aria-hidden="true" />
              <p>お題を生成中…</p>
            </div>
          </Card>
        )
      )}

      {/* PC（lg+）は「左＝タイマー主役＋ホスト操作 / 右＝参加者・引き継ぎ」の2カラム。
          モバイルは素直に縦積み（space-y-6）になる。 */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6 lg:items-start space-y-6 lg:space-y-0">
      {/* ── 左（メイン）: タイマー＋ホスト操作 ── */}
      <div className="space-y-6 lg:min-w-0">
      {/* ドライバーパネル（タイマー＝円形プログレス、人＝円周配置、現ドライバー＝Crown） */}
      <Card className={`relative overflow-hidden transition-all`}>
        {/* 現ドライバー背後の微かな朱の発光（計器の照明）。虹色グラデは廃止。 */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_22%,rgba(255,74,46,0.1),transparent_58%)] pointer-events-none" />
        <div className="relative text-center py-4">
          <div className="instrument-label mb-3">Current Driver</div>
          <div
            key={currentDriverName}
            className="driver-name-fluid font-black mb-5 text-[var(--bone)] animate-fade-up"
          >
            <Crown className="w-10 h-10 md:w-12 md:h-12 inline mr-3 text-[var(--signal)]" aria-hidden="true" />
            {currentDriverName}
          </div>

          <div className="flex justify-center mb-4 boot-reveal" style={{ animationDelay: "60ms" }}>
            <TeamOrbit members={room.session.rotation} currentIndex={room.session.currentIndex} size={orbitSize}>
              <CircularProgress
                progress={progress}
                warning={isUrgent}
                running={running && !isPaused && !room.onBreak}
                size={ringSize}
                strokeWidth={isWide ? 14 : 11}
              >
                {/* タイマー（残り10秒で緊急色）。role="timer" で意味付与、aria-live は off。 */}
                <div
                  role="timer"
                  aria-live="off"
                  aria-label={`残り時間 ${formatRemaining(displayRemaining)}`}
                  className={`text-6xl lg:text-7xl font-black tabular tracking-tight ${
                    isUrgent ? "text-[var(--urgent)] animate-pulse" : "text-white"
                  } ${isPaused || room.onBreak ? "opacity-50" : ""}`}
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
            次: <span className="text-[var(--bone)] font-bold">{nextDriverName}</span>
            {room.config.navigatorEnabled && navigatorName && (
              <span className="ml-3 text-[var(--bone-subtle)]">ナビ: <span className="text-[var(--bone-muted)]">{navigatorName}</span></span>
            )}
          </div>

          {/* 統計（等幅タビュラーで計測値らしく） */}
          <div className="mt-4 flex justify-center gap-6 text-base text-[var(--bone-subtle)]">
            <span>経過 <span className="tabular text-[var(--bone-muted)]">{formatElapsed(elapsed)}</span></span>
            <span>交代 <span className="tabular text-[var(--bone-muted)]">{room.session.totalSwitches}</span>回</span>
          </div>
        </div>

        {/* 操作（編集者：スキップ／一時停止・再開、ホスト：休憩） */}
        <div className="relative flex flex-wrap justify-center gap-2 pt-2 boot-reveal" style={{ animationDelay: "230ms" }}>
          {isEditor && (
            <>
              {isPaused || !running ? (
                <PrimaryButton onClick={onResume} disabled={!isPaused}>
                  <span className="flex items-center gap-2"><Play className="w-5 h-5" /> 再開</span>
                </PrimaryButton>
              ) : (
                <GhostButton onClick={onPause}>
                  <span className="flex items-center gap-2"><Pause className="w-4 h-4" /> 一時停止</span>
                </GhostButton>
              )}
              <GhostButton onClick={onSkip} disabled={!running}>
                <span className="flex items-center gap-2"><SkipForward className="w-4 h-4" /> スキップ</span>
              </GhostButton>
            </>
          )}
          {isHost && (
            <GhostButton onClick={room.onBreak ? onBreakEnd : onBreakStart}>
              <span className="flex items-center gap-2"><Coffee className="w-4 h-4" /> {room.onBreak ? "休憩終了" : "休憩"}</span>
            </GhostButton>
          )}
        </div>
      </Card>

      {/* ホスト操作: 終了系3操作の隔離ゾーン（完成/中断/リセット・確認つき・FR-018/019/044） */}
      {isHost && (
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
          ハイライト（FR-046/047/048/050/051/061）。現ドライバーは rotation の名前で判定。 */}
      <Card>
        {/* 自分のドライバー状態と加入/離脱（2層モデル・途中参加対応・D1）。editor+ のみ。 */}
        {isEditor && currentParticipant && (
          <SelfDriverToggle
            inRotation={room.session.rotation.includes(currentParticipant.displayName)}
            isSkipping={currentParticipant.driverEligible === false}
            canLeave={room.session.rotation.length > 1}
            displayName={currentParticipant.displayName}
            participantId={currentParticipant.participantId}
            onJoin={onJoinRotation}
            onLeave={onLeaveRotation}
            onSkip={onDriverSkip}
            onResume={onDriverResume}
          />
        )}
        <RosterPanel
          participants={room.participants}
          currentDriverName={room.session.rotation[room.session.currentIndex] ?? ""}
          myParticipantId={participantId}
          canHostAction={isHost}
          // 自分の一時離脱/復帰は上の SelfDriverToggle が担うため、行には出さず重複を避ける（#1）。
          selfHasExternalToggle={isEditor}
          onRename={onRenameParticipant}
          onSkip={onDriverSkip}
          onResume={onDriverResume}
          onAddProxy={onAddProxy}
          onRemove={onRemoveParticipant}
          onTransferHost={onTransferHost}
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
      {/* 休憩中バナー（§9.1）。Tabs の外に置きどのタブを表示中でも常に見える
          （SwitchAlert / aria-live アナウンスと同様の配置方針）。 */}
      {room.onBreak && (
        <div
          role="status"
          className="flex items-center justify-center gap-2 rounded-md border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-amber-200 font-bold"
        >
          <Coffee className="w-5 h-5" aria-hidden="true" />
          休憩中 — タイマーは停止しています
        </div>
      )}
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
                {isHost && onSetPassphrase && (
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
                  <RosterPanel
                    participants={room.participants}
                    currentDriverName={room.session.rotation[room.session.currentIndex] ?? ""}
                    myParticipantId={participantId}
                    canHostAction={isHost}
                    selfHasExternalToggle={false}
                    onRename={onRenameParticipant}
                    onSkip={onDriverSkip}
                    onResume={onDriverResume}
                    onAddProxy={onAddProxy}
                    onRemove={onRemoveParticipant}
                    onTransferHost={onTransferHost}
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

