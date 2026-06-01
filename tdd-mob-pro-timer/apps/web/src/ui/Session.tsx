/**
 * セッション画面
 * T057: FR-007, FR-017, FR-030 ＋ デザインシステム適用
 */

import React, { useMemo, useState, useEffect, useRef } from "react";
import { secondsLeft, elapsedMs } from "@tdd-mob/core/aggregate";
import type { Room, Problem } from "@tdd-mob/core";
import { Button } from "./components/Button.js";
import { RosterPanel } from "./components/RosterPanel.js";
import { ProblemEditor } from "./components/ProblemEditor.js";
import { EndSessionZone } from "./components/EndSessionZone.js";
import { deriveAnnouncement, type AnnounceState } from "./announce.js";

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
    const id = setInterval(() => setNowTick(Date.now()), 250);
    return () => clearInterval(id);
  }, [room.clock.running, room.clock.anchorServerTime]);

  const now = nowTick;
  const remaining = useMemo(
    () => secondsLeft(room.clock, now, clockOffset),
    [room.clock, now, clockOffset],
  );
  const elapsed = useMemo(
    () => elapsedMs(room.clock, now, clockOffset),
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
  const navigatorName =
    room.config.navigatorEnabled && rotationLen > 0
      ? room.session.rotation[nextIndex]
      : null;

  const isUrgent = room.clock.running && remaining <= URGENT_THRESHOLD_SECONDS;

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

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };
  const formatElapsed = (ms: number) => {
    const total = Math.floor(ms / 1000);
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  };

  return (
    <div
      role="main"
      aria-label="セッション"
      className="mx-auto flex max-w-2xl flex-col items-center gap-6 p-6"
    >
      {/* お題（確定後）。ProblemEditor を本番接続し、editor+ は各フィールドを編集できる
          （FR-009/013/038/040/041）。未確定で生成待ちなら生成中表示（FR-003, US3-AC5）。 */}
      {room.problem ? (
        <div className="w-full rounded-lg border border-line bg-surface p-4 shadow-card">
          <ProblemEditor
            problem={room.problem}
            canEdit={isEditor}
            onEdit={(patch) => onEditProblem?.(patch)}
            onCopy={() => onCopyProblem?.()}
            onRegenerate={() => onRegenerateProblem?.()}
            onPaste={() => onPasteProblem?.()}
          />
        </div>
      ) : (
        awaitingProblem && (
          <div
            className="w-full rounded-lg border border-line bg-surface p-4 shadow-card"
            aria-live="polite"
          >
            <div className="flex items-center gap-3 text-fg-muted">
              <span
                className="h-4 w-4 animate-pulse rounded-full bg-primary"
                aria-hidden="true"
              />
              <span>お題を生成中…</span>
            </div>
            {/* スケルトン（reduced-motion 時は静止） */}
            <div className="mt-3 space-y-2" aria-hidden="true">
              <div className="h-3 w-3/4 animate-pulse rounded bg-surface-2" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-surface-2" />
            </div>
          </div>
        )
      )}

      {/* タイマー（残り10秒で緊急色）
          role="timer" で意味を与えつつ aria-live は off（毎秒の読み上げ過多を防ぐ）。
          残り10秒等の節目は下部の離散アナウンサーが伝える（FR-035）。 */}
      <div
        role="timer"
        aria-live="off"
        aria-label={`残り時間 ${formatTime(remaining)}`}
        className={`font-mono text-timer font-bold tabular-nums ${
          isUrgent ? "text-danger" : "text-fg"
        }`}
      >
        {formatTime(remaining)}
      </div>

      {/* ドライバー情報 */}
      <div className="flex flex-wrap justify-center gap-8 text-center">
        <div>
          <p className="text-sm text-fg-subtle">ドライバー</p>
          <p className="text-xl font-bold text-fg">{currentDriverName}</p>
        </div>
        {room.config.navigatorEnabled && navigatorName && (
          <div>
            <p className="text-sm text-fg-subtle">ナビゲーター</p>
            <p className="text-xl font-bold text-fg">{navigatorName}</p>
          </div>
        )}
        <div>
          <p className="text-sm text-fg-subtle">次</p>
          {/* 「次」は現ドライバーより一段下げ、図と地の階層差を明確にする（サイズ・明度とも） */}
          <p className="text-lg font-medium text-fg-subtle">{nextDriverName}</p>
        </div>
      </div>

      {/* 統計 */}
      <div className="flex gap-6 text-sm text-fg-subtle">
        <span>経過: {formatElapsed(elapsed)}</span>
        <span>交代: {room.session.totalSwitches}回</span>
      </div>

      {/* 編集者操作 */}
      {isEditor && (
        <div className="flex flex-wrap justify-center gap-3">
          <Button intent="primary" onClick={onSkip} disabled={!room.clock.running}>
            スキップ
          </Button>
          {room.clock.running && !room.session.isPaused ? (
            <Button intent="warning" onClick={onPause}>
              一時停止
            </Button>
          ) : (
            <Button
              intent="success"
              onClick={onResume}
              disabled={!room.session.isPaused}
            >
              再開
            </Button>
          )}
        </div>
      )}

      {/* ホスト操作: 休憩（副操作）と、終了系3操作の隔離ゾーン（完成/中断/リセット）。
          終了系は EndSessionZone が確認ダイアログを内蔵し、語彙と意味差を明確にする（FR-018/019/044）。 */}
      {isHost && (
        <>
          <div className="flex flex-wrap justify-center gap-3">
            {room.onBreak ? (
              <Button intent="neutral" onClick={onBreakEnd}>
                休憩終了
              </Button>
            ) : (
              <Button intent="neutral" onClick={onBreakStart}>
                休憩
              </Button>
            )}
          </div>
          <EndSessionZone
            onComplete={onComplete}
            onAbort={onAbort}
            onReset={onReset}
            isShared={room.code !== "SOLO"}
          />
        </>
      )}

      {/* 在席一覧（RosterPanel）。改名・一時離脱・代理追加・観覧表示・現ドライバー
          ハイライトを提供（FR-046/047/048/050/051/061）。現ドライバーは rotation の
          名前で判定する（participants 配列の位置とはずれるため）。 */}
      <RosterPanel
        participants={room.participants}
        currentDriverName={room.session.rotation[room.session.currentIndex] ?? ""}
        myParticipantId={participantId}
        canHostAction={isHost}
        onRename={onRenameParticipant}
        onSkip={onDriverSkip}
        onResume={onDriverResume}
        onAddProxy={onAddProxy}
      />

      {/* 引き継ぎメモ */}
      {room.handoffNote && (
        <div
          className="w-full rounded-md border border-line bg-surface-2 p-3 text-sm text-fg"
          aria-live="polite"
        >
          <strong>引き継ぎメモ:</strong> {room.handoffNote}
        </div>
      )}

      {/* 交代・残り10秒・一時停止・休憩を支援技術へ通知（FR-035） */}
      <div aria-live="assertive" role="status" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}
