/**
 * 並び順ストリップ（#4）。TeamOrbit の直下に常時表示。
 * 各人の「いつ自分の番か」（今/次/あと N 人・約 M 分後）を番号付きで示し、自分の行を強調する。
 * 先頭に自分基準サマリ（あなた: あと N 人・約 M 分後 / あなたの番です）を出す。
 */

import React from "react";
import { computeRotationStatus, type MemberTurn } from "../rotation-status.js";
import type { RotationMember } from "../rotation-names.js";
import { SKIP_TEXT } from "../skip-reason-text.js";

interface RotationLineupProps {
  /** rotation の各枠（識別子＋表示名・D6b）。 */
  rotation: RotationMember[];
  currentIndex: number;
  /** 次に実際にドライバーになる席の添字。サーバー権威（#276 D6）。 */
  nextIndex: number | null;
  intervalSeconds: number;
  /** rotation 内での自分の位置（輪の外なら -1）。 */
  selfIndex: number;
  isPaused: boolean;
}

/** 各メンバーの「いつ番が来るか」ラベルを返す */
function whenLabel(m: MemberTurn): string {
  if (m.isCurrent) return "▶ 今";
  if (m.isNext) return "⟶ 次";
  // 飛ばされる席は turnsAway を持たない（#276 D13）。現ドライバー以外は上の
  // isNext 分岐までに終わらない限りここへは来ない設計だが、念のため防御する
  // （でないと「あとnull人」を描画しうる）。
  if (m.skipReason !== null) return "";
  const mins = m.minutesAway !== null ? `・約${m.minutesAway}分後` : "";
  return `あと${m.turnsAway}人${mins}`;
}

/** 自分基準のサマリ文字列を返す */
function buildSelfSummary(self: MemberTurn): string {
  if (self.isCurrent) return "あなたの番です";
  // 飛ばされる席は順番を持たない（#276 D11）。「あとnull人」を出さない。
  if (self.skipReason !== null) return `あなた: 番が回りません（${SKIP_TEXT[self.skipReason].label}）`;
  const turns = self.isNext ? "次です" : `あと${self.turnsAway}人`;
  const mins = self.minutesAway !== null && !self.isNext ? `・約${self.minutesAway}分後` : "";
  return `あなた: ${turns}${mins}`;
}

export function RotationLineup({ rotation, currentIndex, nextIndex, intervalSeconds, selfIndex, isPaused }: RotationLineupProps) {
  const { members, self } = computeRotationStatus({ rotation, currentIndex, nextIndex, intervalSeconds, selfIndex, isPaused });
  // メンバーが空の場合は何も描画しない
  if (members.length === 0) return null;

  const selfSummary = self ? buildSelfSummary(self) : null;

  return (
    <div className="mt-3">
      {selfSummary && (
        <p
          className="mb-2 text-center text-lg font-bold text-[var(--signal)]"
          aria-live="polite"
        >
          {selfSummary}
        </p>
      )}
      <ol className="flex flex-wrap justify-center gap-1.5">
        {members.map((m) => (
          <li
            // 同名参加者が居ても行を取り違えないよう識別子を key にする（表示名は一意でない）
            key={m.participantId}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm ${
              m.skipReason !== null ? "opacity-70 " : ""
            }${
              m.isCurrent
                ? "bg-[var(--signal-tint)] border border-[var(--signal-edge)] text-[var(--bone)]"
                : m.isSelf
                ? "bg-[var(--panel-2)] border border-[var(--signal)] text-[var(--bone)]"
                : "bg-[var(--panel-2)] border border-[var(--hairline)] text-[var(--bone-muted)]"
            }`}
          >
            {/* 番号バッジ */}
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--panel)] text-xs font-bold tabular">
              {m.order}
            </span>
            {/* 名前 */}
            <span className="font-medium">{m.name}</span>
            {/* 自分マーカー */}
            {m.isSelf && <span className="text-[var(--signal)]">（あなた）</span>}
            {/* 番が回らない理由の印（#276 D11）。現ドライバーには「運転中である」言い方にする。 */}
            {m.skipReason !== null && (
              <span
                className="text-[var(--bone-subtle)]"
                title={m.isCurrent ? SKIP_TEXT[m.skipReason].current : SKIP_TEXT[m.skipReason].reason}
              >
                {SKIP_TEXT[m.skipReason].label}
              </span>
            )}
            {/* いつ番が来るか。飛ばされる席には回ってこないので、現ドライバー以外は予告しない。 */}
            {(m.skipReason === null || m.isCurrent) && (
              <span className={m.isCurrent ? "font-semibold text-[var(--signal)]" : "text-[var(--bone-subtle)]"}>
                {whenLabel(m)}
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
