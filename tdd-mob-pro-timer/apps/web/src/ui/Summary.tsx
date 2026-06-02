/**
 * セッション締めくくり画面（完成/中断で出し分け）
 * T048: FR-020,021,044 (US5)
 *
 * 完成（complete）: 達成表示 + 記録保存 + 書き出し + 次の行動導線
 * 中断（abort）: 中断表示 + 記録なし + 次の行動導線のみ
 */

import React from "react";
import { Trophy, Sparkles } from "lucide-react";
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

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-6 text-center">
      {/* タイトル: 完成/中断で明確に出し分け（完成はグラデで祝祭感） */}
      {isComplete ? (
        <h2 className="text-3xl font-black bg-gradient-to-r from-amber-300 via-orange-400 to-fuchsia-400 bg-clip-text text-transparent">
          セッション完了
        </h2>
      ) : (
        <h2 className="text-2xl font-bold text-white/80">セッション終了（中断）</h2>
      )}

      {/* 達成バナー（完成時のみ・S1）。中断では出さない（達成として扱わない）。 */}
      {isComplete && (
        <div
          aria-label="達成"
          className="w-full rounded-2xl border border-amber-400/40 bg-amber-400/10 p-5 text-amber-200"
        >
          <p className="text-2xl font-bold flex items-center justify-center gap-2">
            <Trophy className="w-7 h-7" /> ナイスワーク！
          </p>
          <p className="mt-1 text-sm text-white/70">
            お題をやり遂げました。お疲れさまでした。
          </p>
        </div>
      )}

      {/* 完成時のみ記録詳細を表示 */}
      {isComplete && record && (
        <>
          <div className="grid w-full grid-cols-2 gap-3">
            <Card className="p-4">
              <p className="text-sm text-white/50">所要時間</p>
              <p className="text-2xl font-bold text-white">{formatTime(record.elapsedSeconds)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-white/50">交代回数</p>
              <p className="text-2xl font-bold text-white">{record.totalSwitches}回</p>
            </Card>
          </div>

          <div className="flex w-full gap-3">
            <GhostButton className="flex-1" onClick={() => onSaveRecord(record)}>
              記録を保存
            </GhostButton>
          </div>
        </>
      )}

      {/* 中断時のメッセージ */}
      {!isComplete && (
        <p className="text-white/60 text-sm">
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
