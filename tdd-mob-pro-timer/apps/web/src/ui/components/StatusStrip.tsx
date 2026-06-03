/**
 * 永続ステータスストリップ
 * T040: FR-035,036,042,032 (US8)
 *
 * 全フェーズに共通して固定表示。フェーズ・自分の名前/役割・接続状態・出題モードを
 * 色＋テキスト併記（FR-032）で常時提示する。
 */

import React from "react";
import type { RoomPhase } from "@tdd-mob/core";

export type ConnectionStatus = "online" | "reconnecting" | "lost";

interface StatusStripProps {
  phase: RoomPhase | "lobby";
  displayName: string;
  role: "host" | "editor" | "viewer";
  connectionStatus: ConnectionStatus;
  problemMode?: "ai" | "fallback";
  roomCode?: string;
}

const PHASE_LABEL: Record<string, string> = {
  setup: "準備",
  lobby: "ロビー",
  ready: "準備完了",
  session: "セッション中",
  celebration: "完了",
};

const ROLE_LABEL: Record<string, string> = {
  host: "ホスト (host)",
  editor: "編集者 (editor)",
  viewer: "観覧 (viewer)",
};

// 接続状態の色（ダークステージ上で視認できる明るめの値・色＋テキスト併記）。
const CONNECTION_CONFIG: Record<ConnectionStatus, { label: string; className: string }> = {
  online: { label: "接続中 (Connected)", className: "text-emerald-300" },
  reconnecting: { label: "再接続中… (Reconnecting)", className: "text-amber-300" },
  lost: { label: "セッション喪失 (Session Lost)", className: "text-red-300" },
};

export function StatusStrip({
  phase,
  displayName,
  role,
  connectionStatus,
  problemMode,
  roomCode,
}: StatusStripProps) {
  const conn = CONNECTION_CONFIG[connectionStatus];

  return (
    <div
      role="status"
      aria-label="ステータス情報"
      className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 px-4 py-2 text-xs text-white/60"
    >
      {/* フェーズ + ルームコード */}
      <span className="flex items-center gap-1">
        <span aria-label="フェーズ">{PHASE_LABEL[phase] ?? phase}</span>
        {roomCode && (
          <span className="font-mono text-white/60">({roomCode})</span>
        )}
      </span>

      {/* 自分の名前と役割 */}
      <span className="flex items-center gap-1">
        <span className="text-white">{displayName}</span>
        <span className="text-white/60">/ {ROLE_LABEL[role] ?? role}</span>
      </span>

      {/* 接続状態（色＋テキスト併記） */}
      <span className={`flex items-center gap-1 ${conn.className}`} aria-label="接続状態">
        <span aria-hidden="true">●</span>
        <span>{conn.label}</span>
      </span>

      {/* 出題モードチップ */}
      {problemMode !== undefined && (
        <span
          className={`rounded-lg px-2 py-0.5 font-medium ${
            problemMode === "ai"
              ? "bg-fuchsia-500/20 text-fuchsia-200"
              : "bg-white/10 text-white/60"
          }`}
          aria-label="出題モード"
        >
          {problemMode === "ai" ? "AI 生成" : "定型 (fallback)"}
        </span>
      )}
    </div>
  );
}
