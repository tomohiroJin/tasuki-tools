/**
 * セッション画面
 * T057: FR-007, FR-017, FR-030 ＋ デザインシステム適用
 */

import React, { useMemo, useState, useEffect, useRef } from "react";
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
import { SwitchAlert } from "./components/SwitchAlert.js";
import { deriveAnnouncement, type AnnounceState } from "./announce.js";
import { usePrefersReducedMotion } from "./use-reduced-motion.js";
import { useIsWide } from "./use-breakpoint.js";
import { playSwitchChime, vibrateSwitch } from "../platform/sound.js";

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
  /** お題編集まわり（editor+）。お題が確定している間のみ ProblemEditor から呼ばれる（US3）。
   *  共有時は problem.edit/submit/request、ソロ時は LocalEngine 経由で App が処理する。 */
  onEditProblem?: (patch: Partial<Omit<Problem, "source" | "edited">>) => void;
  onCopyProblem?: () => void;
  onRegenerateProblem?: () => void;
  onPasteProblem?: () => void;
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
  onEditProblem,
  onCopyProblem,
  onRegenerateProblem,
  onPasteProblem,
}: SessionProps) {
  // 稼働中は定期的に再レンダリングしてカウントダウンを進める（FR-007）
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (!room.clock.running) {
      setNowTick(Date.now());
      return;
    }
    const id = setInterval(() => setNowTick(Date.now()), 200);
    return () => clearInterval(id);
  }, [room.clock.running, room.clock.anchorServerTime]);

  const now = nowTick;
  const elapsed = useMemo(
    () => elapsedMs(room.clock, now, clockOffset),
    [room.clock, now, clockOffset],
  );

  // 表示用の残り時間。サーバー権威の secondsLeft をそのまま使う（0 でクランプ）。
  // 交代＝サーバーの新アンカー snapshot で「ドライバー変更」と「時間リセット」が同時に
  // 反映されるため、二重リセットや先走りロールオーバーは行わない（⑥ 致命傷の修正）。
  const displayRemaining = useMemo(
    () => secondsLeft(room.clock, now, clockOffset),
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

  // 支援技術向けの離散アナウンス（FR-035）。
  // 連続カウントは読み上げず、状態変化だけを assertive リージョンへ流す。
  // 同一文言が連続しても再読み上げされるよう、不可視のゼロ幅スペースを末尾に
  // 交互付与して DOM テキストを必ず変化させる（aria-live はテキスト変化時のみ発火）。
  const [announcement, setAnnouncement] = useState("");
  const prevStateRef = useRef<AnnounceState | null>(null);
  const seqRef = useRef(0);
  useEffect(() => {
    const next: AnnounceState = {
      running: room.clock.running,
      isPaused: room.session.isPaused,
      onBreak: room.onBreak,
      currentIndex: room.session.currentIndex,
      isUrgent,
      driverName: currentDriverName,
    };
    const prev = prevStateRef.current;
    prevStateRef.current = next;
    if (!prev) return;
    const msg = deriveAnnouncement(prev, next);
    if (msg) {
      seqRef.current += 1;
      setAnnouncement(msg + "​".repeat(seqRef.current % 2));
    }
  }, [
    room.clock.running,
    room.session.isPaused,
    room.onBreak,
    room.session.currentIndex,
    isUrgent,
    currentDriverName,
  ]);

  // 引き継ぎメモのローカル編集状態（§9.1）。サーバー snapshot が来たら追従し、
  // 入力確定（blur）時にだけ handoff.note.set を送る（楽観更新は最小・§5.3）。
  const [noteDraft, setNoteDraft] = useState(room.handoffNote);
  useEffect(() => {
    setNoteDraft(room.handoffNote);
  }, [room.handoffNote]);
  const commitNote = () => {
    if (noteDraft !== room.handoffNote) onHandoffNoteSet?.(noteDraft);
  };

  // 強い交代通知（§9.1 assertiveSwitch）。currentIndex の変化を交代と見なし、
  // 設定が ON のときだけ全画面オーバーレイ＋音＋振動で割り込む。
  // reduced-motion 時は SwitchAlert 側でアニメを外す。
  const reducedMotion = usePrefersReducedMotion();
  const [switchAlertName, setSwitchAlertName] = useState<string | null>(null);
  const prevIndexRef = useRef(room.session.currentIndex);
  useEffect(() => {
    const prev = prevIndexRef.current;
    prevIndexRef.current = room.session.currentIndex;
    if (prev === room.session.currentIndex) return;
    if (!room.config.assertiveSwitch) return;
    setSwitchAlertName(currentDriverName);
    playSwitchChime();
    vibrateSwitch();
  }, [room.session.currentIndex, room.config.assertiveSwitch, currentDriverName]);

  // 自動消滅タイマーは表示状態だけに依存させる（検知 effect と分離・レビュー #2）。
  // こうしないと表示中に currentDriverName だけ変化した際、cleanup でタイマーが消え
  // 新規分が張られず、オーバーレイが閉じなくなる。
  useEffect(() => {
    if (!switchAlertName) return;
    const id = setTimeout(() => setSwitchAlertName(null), 2500);
    return () => clearTimeout(id);
  }, [switchAlertName]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };
  const formatElapsed = (ms: number) => {
    const total = Math.floor(ms / 1000);
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  };

  const intervalSeconds = room.clock.intervalSeconds || 1;
  const progress = ((intervalSeconds - displayRemaining) / intervalSeconds) * 100;
  const isPaused = room.session.isPaused;
  const running = room.clock.running;

  // PC ではタイマーを主役として大きく見せる（ステージ感・モバイルは収まるサイズに）。
  const isWide = useIsWide();
  const orbitSize = isWide ? 460 : 340;
  const ringSize = isWide ? 300 : 224;

  return (
    <div role="main" aria-label="セッション" className="space-y-6">
      {/* 休憩中バナー（§9.1）。タイマー停止中であることを明示する。 */}
      {room.onBreak && (
        <div
          role="status"
          className="flex items-center justify-center gap-2 rounded-2xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-amber-200 font-bold"
        >
          <Coffee className="w-5 h-5" aria-hidden="true" />
          休憩中 — タイマーは停止しています
        </div>
      )}

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
            <div className="py-8 text-center text-white/60" aria-live="polite">
              <span className="inline-block h-4 w-4 animate-pulse rounded-full bg-fuchsia-400 mb-2" aria-hidden="true" />
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
        <div className="absolute inset-0 bg-gradient-to-br from-fuchsia-500/20 via-transparent to-violet-500/20 pointer-events-none" />
        <div className="relative text-center py-4">
          <div className="text-sm uppercase tracking-[0.2em] text-white/50 mb-3">Current Driver</div>
          <div
            key={currentDriverName}
            className="driver-name-fluid font-black mb-5 bg-gradient-to-r from-amber-300 to-orange-400 bg-clip-text text-transparent animate-fade-up"
          >
            <Crown className="w-10 h-10 md:w-12 md:h-12 inline mr-3 text-amber-400" aria-hidden="true" />
            {currentDriverName}
          </div>

          <div className="flex justify-center mb-4">
            <TeamOrbit members={room.session.rotation} currentIndex={room.session.currentIndex} size={orbitSize}>
              <CircularProgress progress={progress} warning={isUrgent} size={ringSize} strokeWidth={isWide ? 14 : 11}>
                {/* タイマー（残り10秒で緊急色）。role="timer" で意味付与、aria-live は off。 */}
                <div
                  role="timer"
                  aria-live="off"
                  aria-label={`残り時間 ${formatTime(displayRemaining)}`}
                  className={`text-6xl lg:text-7xl font-black font-mono tabular-nums tracking-tight ${
                    isUrgent ? "text-red-400 animate-pulse" : "text-white"
                  } ${isPaused || room.onBreak ? "opacity-50" : ""}`}
                >
                  {formatTime(displayRemaining)}
                </div>
                {isPaused && (
                  <div className="text-[10px] uppercase tracking-widest text-white/60 mt-1">Paused</div>
                )}
              </CircularProgress>
            </TeamOrbit>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 text-lg text-white/70">
            <ArrowRight className="w-5 h-5" aria-hidden="true" />
            次: <span className="text-white font-bold">{nextDriverName}</span>
            {room.config.navigatorEnabled && navigatorName && (
              <span className="ml-3 text-white/60">ナビ: <span className="text-white/90">{navigatorName}</span></span>
            )}
          </div>

          {/* 統計 */}
          <div className="mt-4 flex justify-center gap-6 text-base text-white/60">
            <span>経過 {formatElapsed(elapsed)}</span>
            <span>交代 {room.session.totalSwitches}回</span>
          </div>
        </div>

        {/* 操作（編集者：スキップ／一時停止・再開、ホスト：休憩） */}
        <div className="relative flex flex-wrap justify-center gap-2 pt-2">
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
            canLeave={room.session.rotation.length > 1}
            displayName={currentParticipant.displayName}
            onJoin={onJoinRotation}
            onLeave={onLeaveRotation}
          />
        )}
        <RosterPanel
          participants={room.participants}
          currentDriverName={room.session.rotation[room.session.currentIndex] ?? ""}
          myParticipantId={participantId}
          canHostAction={isHost}
          onRename={onRenameParticipant}
          onSkip={onDriverSkip}
          onResume={onDriverResume}
          onAddProxy={onAddProxy}
          onRemove={onRemoveParticipant}
        />
      </Card>

      {/* 引き継ぎメモ（§9.1）。editor+ は編集でき、交代時に次ドライバーへ提示される。
          viewer はメモがある時だけ読み取り表示する。 */}
      {isEditor ? (
        <Card>
          <label htmlFor="shared-memo" className="flex items-center gap-2 text-sm font-semibold text-white mb-2">
            <ArrowRight className="w-4 h-4 text-cyan-400" aria-hidden="true" />
            共有メモ
          </label>
          <textarea
            id="shared-memo"
            aria-label="共有メモ"
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            onBlur={commitNote}
            rows={2}
            placeholder="例: API のモックまで完了。残タスクやメモを全員で共有。"
            className="w-full resize-y rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400 transition-colors"
          />
        </Card>
      ) : (
        room.handoffNote && (
          <Card>
            <p className="text-sm text-white/80" aria-live="polite">
              <strong className="text-white">共有メモ:</strong> {room.handoffNote}
            </p>
          </Card>
        )
      )}
      </div>{/* /右（サイド） */}
      </div>{/* /2カラムグリッド */}

      {/* 交代・残り10秒・一時停止・休憩を支援技術へ通知（FR-035） */}
      <div aria-live="assertive" role="status" className="sr-only">
        {announcement}
      </div>

      {/* 強い交代通知の全画面オーバーレイ（§9.1） */}
      {switchAlertName && (
        <SwitchAlert
          driverName={switchAlertName}
          reducedMotion={reducedMotion}
          onDismiss={() => setSwitchAlertName(null)}
        />
      )}
    </div>
  );
}

interface SelfDriverToggleProps {
  inRotation: boolean;
  /** 列から外れられるか（最後の1人は外れられないため false）。 */
  canLeave: boolean;
  displayName: string;
  onJoin?: (displayName: string) => void;
  onLeave?: (displayName: string) => void;
}

/** 自分のドライバー状態（ドライバー/見学中）と加入・離脱の切替（2層モデル・D1）。 */
function SelfDriverToggle({ inRotation, canLeave, displayName, onJoin, onLeave }: SelfDriverToggleProps) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2 rounded-xl bg-white/5 border border-white/10 px-3 py-2">
      <span className="text-sm">
        あなた: {inRotation
          ? <span className="font-semibold text-cyan-300">ドライバー</span>
          : <span className="text-white/50">見学中</span>}
      </span>
      {inRotation ? (
        <GhostButton
          onClick={() => onLeave?.(displayName)}
          disabled={!canLeave}
          title={canLeave ? undefined : "最後のドライバーは外れられません"}
          className="text-xs px-3 py-1.5"
        >
          列から外れる
        </GhostButton>
      ) : (
        <PrimaryButton onClick={() => onJoin?.(displayName)} className="text-xs px-3 py-1.5">
          ドライバーに加わる
        </PrimaryButton>
      )}
    </div>
  );
}
