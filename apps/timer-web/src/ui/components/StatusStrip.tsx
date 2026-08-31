/**
 * 永続ステータスストリップ
 * T040: FR-035,036,042,032 (US8)
 *
 * 全フェーズに共通して固定表示。フェーズ・自分の名前/役割・接続状態・出題モードを
 * 色＋テキスト併記（FR-032）で常時提示する。
 */

import React from "react";
import type { RoomPhase } from "@tasuki/timer-core";
import { NotifySettings } from "./NotifySettings.js";

export type ConnectionStatus = "online" | "reconnecting" | "lost" | "stale";

interface StatusStripProps {
  phase: RoomPhase | "lobby";
  displayName: string;
  role: "host" | "editor" | "viewer";
  connectionStatus: ConnectionStatus;
  roomCode?: string | undefined;
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
//
// `stale` は「接続は生きているのに、契約に合わない同期フレームを捨てていて
// 画面が古いままになっている」状態（#209）。**再読込を促す文言は置かない** ——
// 継続する棄却の原因はサーバー側のルームに残った値なので、再読込しても直らず
// 嘘の導線になる。ここは「起きていること」だけを述べる。
const CONNECTION_CONFIG: Record<ConnectionStatus, { label: string; className: string }> = {
  online: { label: "接続中 (Connected)", className: "text-[var(--ok)]" },
  reconnecting: { label: "再接続中… (Reconnecting)", className: "text-[var(--caution)]" },
  lost: { label: "セッション喪失 (Session Lost)", className: "text-[var(--urgent)]" },
  stale: { label: "同期不整合 (Out of Sync)", className: "text-[var(--caution)]" },
};

/**
 * 接続状態の一覧。**検査が状態を取りこぼしていないことを機械的に確かめるために公開する。**
 * 表示の設定そのもの（`CONNECTION_CONFIG`）から導くので、状態を足して設定を書けば
 * ここも自動で増える。テスト側の表に足し忘れると `color-only-invariants` が落ちる。
 */
export const CONNECTION_STATUSES = Object.keys(CONNECTION_CONFIG) as readonly ConnectionStatus[];

export function StatusStrip({
  phase,
  displayName,
  role,
  connectionStatus,
  roomCode,
}: StatusStripProps) {
  const conn = CONNECTION_CONFIG[connectionStatus];

  return (
    <div
      role="status"
      aria-label="ステータス情報"
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-md bg-[var(--panel)] border border-[var(--hairline)] px-4 py-2 text-xs text-[var(--bone-subtle)]"
    >
      {/* フェーズ + ルームコード */}
      <span className="flex items-center gap-1">
        <span aria-label="フェーズ">{PHASE_LABEL[phase] ?? phase}</span>
        {roomCode && (
          <span className="tabular text-[var(--signal)]">({roomCode})</span>
        )}
      </span>

      {/* 自分の名前と役割 */}
      <span className="flex items-center gap-1">
        <span className="text-[var(--bone)]">{displayName}</span>
        <span className="text-[var(--bone-subtle)]">/ {ROLE_LABEL[role] ?? role}</span>
      </span>

      {/* 接続状態（色＋テキスト併記） */}
      <span className={`flex items-center gap-1 ${conn.className}`} aria-label="接続状態">
        <span aria-hidden="true">●</span>
        <span>{conn.label}</span>
      </span>

      {/* 個人通知設定（音/OS通知）。ルーム設定 assertiveSwitch とは独立。 */}
      <NotifySettings />
    </div>
  );
}
