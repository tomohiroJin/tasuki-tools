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
  setup: "setup",
  lobby: "lobby",
  session: "session",
  celebration: "celebration",
};

const ROLE_LABEL: Record<string, string> = {
  host: "ホスト (host)",
  editor: "編集者 (editor)",
  viewer: "観覧 (viewer)",
};

// 接続状態の色はデザイントークン（presence-* / intent）に揃える。Tailwind 直値
// （text-green-400 等）はテーマ非依存の AA 保証から外れ、StatusStrip は全画面共通で
// ライト背景にも出るため避ける。online=在席色 / reconnecting=離席色 / lost=危険色。
const CONNECTION_CONFIG: Record<ConnectionStatus, { label: string; className: string }> = {
  online: { label: "接続中 (Connected)", className: "text-presence-online" },
  reconnecting: { label: "再接続中… (Reconnecting)", className: "text-presence-idle" },
  lost: { label: "セッション喪失 (Session Lost)", className: "text-danger" },
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
      className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-surface-2 px-4 py-1.5 text-xs text-fg-muted border-b border-line"
    >
      {/* フェーズ + ルームコード */}
      <span className="flex items-center gap-1">
        <span aria-label="フェーズ">{PHASE_LABEL[phase] ?? phase}</span>
        {roomCode && (
          <span className="font-mono text-fg-subtle">({roomCode})</span>
        )}
      </span>

      {/* 自分の名前と役割 */}
      <span className="flex items-center gap-1">
        <span className="text-fg">{displayName}</span>
        <span className="text-fg-subtle">/ {ROLE_LABEL[role] ?? role}</span>
      </span>

      {/* 接続状態（色＋テキスト併記） */}
      <span className={`flex items-center gap-1 ${conn.className}`} aria-label="接続状態">
        <span aria-hidden="true">●</span>
        <span>{conn.label}</span>
      </span>

      {/* 出題モードチップ */}
      {problemMode !== undefined && (
        <span
          className={`rounded px-1.5 py-0.5 font-medium ${
            problemMode === "ai"
              ? "bg-primary/15 text-primary"
              : "bg-surface text-fg-muted"
          }`}
          aria-label="出題モード"
        >
          {problemMode === "ai" ? "AI 生成" : "定型 (fallback)"}
        </span>
      )}
    </div>
  );
}
