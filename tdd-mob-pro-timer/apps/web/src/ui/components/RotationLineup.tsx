/**
 * 並び順ストリップ（#4）。TeamOrbit の直下に常時表示。
 * 各人の「いつ自分の番か」（今/次/あと N 人・約 M 分後）を番号付きで示し、自分の行を強調する。
 * 先頭に自分基準サマリ（あなた: あと N 人・約 M 分後 / あなたの番です）を出す。
 */

import React from "react";
import { computeRotationStatus, type MemberTurn } from "../rotation-status.js";

interface RotationLineupProps {
  rotation: string[];
  currentIndex: number;
  intervalSeconds: number;
  selfName: string;
  isPaused: boolean;
}

/** 各メンバーの「いつ番が来るか」ラベルを返す */
function whenLabel(m: MemberTurn): string {
  if (m.isCurrent) return "▶ 今";
  if (m.isNext) return "⟶ 次";
  const mins = m.minutesAway !== null ? `・約${m.minutesAway}分後` : "";
  return `あと${m.turnsAway}人${mins}`;
}

/** 自分基準のサマリ文字列を返す */
function buildSelfSummary(self: MemberTurn): string {
  if (self.isCurrent) return "あなたの番です";
  const turns = self.isNext ? "次です" : `あと${self.turnsAway}人`;
  const mins = self.minutesAway !== null && !self.isNext ? `・約${self.minutesAway}分後` : "";
  return `あなた: ${turns}${mins}`;
}

export function RotationLineup({ rotation, currentIndex, intervalSeconds, selfName, isPaused }: RotationLineupProps) {
  const { members, self } = computeRotationStatus({ rotation, currentIndex, intervalSeconds, selfName, isPaused });
  // メンバーが空の場合は何も描画しない
  if (members.length === 0) return null;

  const selfSummary = self ? buildSelfSummary(self) : null;

  return (
    <div className="mt-3">
      {selfSummary && (
        <p
          className="mb-2 text-center text-sm font-semibold text-[var(--signal)]"
          aria-live="polite"
        >
          {selfSummary}
        </p>
      )}
      <ol className="flex flex-wrap justify-center gap-1.5">
        {members.map((m) => (
          <li
            key={m.name}
            className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs ${
              m.isCurrent
                ? "bg-[rgba(255,74,46,0.16)] border border-[rgba(255,74,46,0.5)] text-[var(--bone)]"
                : m.isSelf
                ? "bg-[var(--panel-2)] border border-[var(--signal)] text-[var(--bone)]"
                : "bg-[var(--panel-2)] border border-[var(--hairline)] text-[var(--bone-muted)]"
            }`}
          >
            {/* 番号バッジ */}
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[var(--panel)] text-[10px] font-bold tabular">
              {m.order}
            </span>
            {/* 名前 */}
            <span className="font-medium">{m.name}</span>
            {/* 自分マーカー */}
            {m.isSelf && <span className="text-[var(--signal)]">（あなた）</span>}
            {/* いつ番が来るか */}
            <span className={m.isCurrent ? "font-semibold text-[var(--signal)]" : "text-[var(--bone-subtle)]"}>
              {whenLabel(m)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
