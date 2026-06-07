/**
 * セッション締めくくり画面（完成/中断で出し分け）
 * T048: FR-020,021,044 (US5)
 *
 * 完成（complete）: 達成表示 + 記録保存 + 書き出し + 次の行動導線
 * 中断（abort）: 中断表示 + 記録なし + 次の行動導線のみ
 */

import React, { useState } from "react";
import { Trophy, Sparkles, Check } from "lucide-react";
import type { CompletionRecord } from "@tdd-mob/core";
import { Card, PrimaryButton, GhostButton } from "./primitives.js";

export type EndType = "complete" | "abort";

interface SummaryProps {
  endType: EndType;
  /** 完成時のみ存在。中断時は null */
  record: CompletionRecord | null;
  onNewSession: () => void;
  onSaveRecord: (record: CompletionRecord) => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}分${String(s).padStart(2, "0")}秒`;
}

export function Summary({ endType, record, onNewSession, onSaveRecord }: SummaryProps) {
  const isComplete = endType === "complete";
  // 保存ボタンの押下フィードバック（無反応に見えていた #4 の修正）。
  const [saved, setSaved] = useState(false);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-6 text-center">
      {/* タイトル: 完成/中断で明確に出し分け（完成はシグナル朱で達成感） */}
      {isComplete ? (
        <>
          <p className="instrument-label text-[var(--signal)]">Session Complete</p>
          <h2 className="text-3xl font-black text-[var(--bone)]">
            セッション完了
          </h2>
        </>
      ) : (
        <h2 className="text-2xl font-bold text-[var(--bone-muted)]">セッション終了（中断）</h2>
      )}

      {/* 達成バナー（完成時のみ・S1）。中断では出さない（達成として扱わない）。 */}
      {isComplete && (
        <div
          aria-label="達成"
          className="w-full rounded-md border border-[rgba(255,74,46,0.4)] bg-[rgba(255,74,46,0.1)] p-5 text-[var(--signal)]"
        >
          <p className="text-2xl font-bold flex items-center justify-center gap-2">
            <Trophy className="w-7 h-7" /> ナイスワーク！
          </p>
          <p className="mt-1 text-sm text-[var(--bone-muted)]">
            お題をやり遂げました。お疲れさまでした。
          </p>
        </div>
      )}

      {/* 完成時のみ記録詳細を表示 */}
      {isComplete && record && (
        <>
          <div className="grid w-full grid-cols-3 gap-3">
            <Card className="p-4">
              <p className="instrument-label">所要時間</p>
              <p className="whitespace-nowrap text-xl font-bold tabular text-[var(--bone)]">{formatTime(record.elapsedSeconds)}</p>
            </Card>
            <Card className="p-4">
              <p className="instrument-label">交代回数</p>
              <p className="whitespace-nowrap text-xl font-bold tabular text-[var(--bone)]">{record.totalSwitches}回</p>
            </Card>
            <Card className="p-4">
              <p className="instrument-label">周回数</p>
              <p className="whitespace-nowrap text-xl font-bold tabular text-[var(--bone)]">{record.rounds ?? 0}周</p>
            </Card>
          </div>

          {/* 個人別ドライバー回数（偏りが一目で分かるバー・UX 再設計の振り返り） */}
          {record.driverCounts && record.driverCounts.length > 0 && (
            <Card className="w-full p-4 text-left">
              <p className="instrument-label mb-3">ドライバー別の回数</p>
              <ul className="space-y-2">
                {record.members.map((name, i) => {
                  const count = record.driverCounts?.[i] ?? 0;
                  const max = Math.max(1, ...(record.driverCounts ?? [1]));
                  return (
                    <li key={`${name}-${i}`} className="flex items-center gap-3 text-sm">
                      <span className="w-24 truncate text-[var(--bone-muted)]">{name}</span>
                      <span className="flex-1 h-2 rounded-sm bg-[var(--panel-2)] overflow-hidden">
                        <span
                          className="block h-full bg-[var(--signal)]"
                          style={{ width: `${(count / max) * 100}%` }}
                        />
                      </span>
                      <span className="w-10 text-right tabular text-[var(--bone-muted)]">{count}回</span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          <div className="flex w-full flex-col items-center gap-1">
            <GhostButton
              className="w-full"
              onClick={() => {
                onSaveRecord(record);
                setSaved(true);
              }}
            >
              <span className="flex items-center justify-center gap-2">
                {saved ? <Check className="w-4 h-4 text-[var(--ok)]" /> : null}
                {saved ? "保存しました" : "記録を保存"}
              </span>
            </GhostButton>
            <p className="text-xs text-[var(--bone-subtle)]">
              完了時に自動保存されています。手動で再保存もできます。
            </p>
          </div>
        </>
      )}

      {/* 中断時のメッセージ */}
      {!isComplete && (
        <p className="text-[var(--bone-subtle)] text-sm">
          記録は残りません。お疲れさまでした。
        </p>
      )}

      {/* 次の行動導線（共通） */}
      <PrimaryButton className="w-full" onClick={onNewSession}>
        <span className="flex items-center justify-center gap-2">
          <Sparkles className="w-5 h-5" /> 新しいセッション
        </span>
      </PrimaryButton>
    </div>
  );
}
