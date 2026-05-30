/**
 * セッション画面
 * T057: FR-007, FR-017, FR-030 ＋ デザインシステム適用
 */

import React, { useMemo, useState, useEffect } from "react";
import { secondsLeft, elapsedMs } from "@tdd-mob/core/aggregate";
import type { Room, Participant } from "@tdd-mob/core";
import { Button } from "./components/Button.js";
import { ConfirmDialog } from "./components/ConfirmDialog.js";
import { presenceLabel, presenceDotClass } from "./presence.js";

interface SessionProps {
  room: Room;
  participantId: string;
  clockOffset?: number;
  onSkip: () => void;
  onPause: () => void;
  onResume: () => void;
  onComplete: () => void;
  onReset: () => void;
  onBreakStart: () => void;
  onBreakEnd: () => void;
}

/** 残り時間がこの秒数以下で緊急表示にする */
const URGENT_THRESHOLD_SECONDS = 10;

export function Session({
  room,
  participantId,
  clockOffset = 0,
  onSkip,
  onPause,
  onResume,
  onComplete,
  onReset,
  onBreakStart,
  onBreakEnd,
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

  const [confirmReset, setConfirmReset] = useState(false);

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
      {/* お題 */}
      {room.problem && (
        <div className="w-full rounded-lg border border-line bg-surface p-4 shadow-card">
          <h2 className="text-lg font-bold text-fg">{room.problem.title}</h2>
          <p className="mt-2 text-fg-muted">{room.problem.description}</p>
        </div>
      )}

      {/* タイマー（残り10秒で緊急色） */}
      <div
        className={`font-mono text-timer font-bold tabular-nums ${
          isUrgent ? "text-danger" : "text-fg"
        }`}
        aria-live="polite"
        aria-label={`残り時間 ${formatTime(remaining)}`}
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
          <p className="text-xl font-bold text-fg-muted">{nextDriverName}</p>
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

      {/* ホスト操作 */}
      {isHost && (
        <div className="flex flex-wrap justify-center gap-3 border-t border-line pt-4">
          {room.onBreak ? (
            <Button intent="success" onClick={onBreakEnd}>
              休憩終了
            </Button>
          ) : (
            <Button intent="neutral" onClick={onBreakStart}>
              休憩
            </Button>
          )}
          <Button intent="accent" onClick={onComplete}>
            完成！
          </Button>
          <Button intent="danger" onClick={() => setConfirmReset(true)}>
            リセット
          </Button>
        </div>
      )}

      {/* 参加者一覧（状態は色＋テキスト併記） */}
      <div className="w-full">
        <h3 className="mb-2 text-sm font-semibold text-fg-subtle">参加者</h3>
        <ul className="flex flex-wrap gap-2">
          {room.participants.map((p: Participant) => (
            <li
              key={p.participantId}
              className="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-fg"
            >
              <span
                className={`h-2 w-2 rounded-full ${presenceDotClass(p.presence)}`}
                aria-hidden="true"
              />
              <span>{p.displayName}</span>
              <span className="text-xs text-fg-subtle">
                ({presenceLabel(p.presence)})
              </span>
              {p.role === "host" && (
                <span className="text-xs font-semibold text-primary">主催者</span>
              )}
            </li>
          ))}
        </ul>
      </div>

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
      <div aria-live="assertive" className="sr-only" id="aria-announcer" />

      {/* リセット確認（破壊的操作） */}
      <ConfirmDialog
        open={confirmReset}
        title="セッションをリセットしますか？"
        description="進行中のタイマー・交代回数・お題が初期状態に戻ります。完成記録は保持されます。"
        confirmLabel="リセットする"
        confirmIntent="danger"
        onConfirm={() => {
          setConfirmReset(false);
          onReset();
        }}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}
