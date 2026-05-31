/**
 * セッション締めくくり画面（完成/中断で出し分け）
 * T048: FR-020,021,044 (US5)
 *
 * 完成（complete）: 達成表示 + 記録保存 + 書き出し + 次の行動導線
 * 中断（abort）: 中断表示 + 記録なし + 次の行動導線のみ
 */

import React from "react";
import type { CompletionRecord } from "@tdd-mob/core";
import { Button } from "./components/Button.js";

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
    <div className="mx-auto flex max-w-md flex-col items-center gap-6 p-6 text-center">
      {/* タイトル: 完成/中断で明確に出し分け */}
      <h2 className="text-xl font-bold text-fg">
        {isComplete ? "セッション完了" : "セッション終了（中断）"}
      </h2>

      {/* 完成時のみ記録詳細を表示 */}
      {isComplete && record && (
        <>
          <div className="grid w-full grid-cols-2 gap-3">
            <div className="rounded-md border border-line bg-surface p-3">
              <p className="text-sm text-fg-subtle">所要時間</p>
              <p className="text-xl font-bold text-fg">{formatTime(record.elapsedSeconds)}</p>
            </div>
            <div className="rounded-md border border-line bg-surface p-3">
              <p className="text-sm text-fg-subtle">交代回数</p>
              <p className="text-xl font-bold text-fg">{record.totalSwitches}回</p>
            </div>
          </div>

          <div className="flex w-full gap-3">
            <Button
              intent="neutral"
              className="flex-1"
              onClick={() => onSaveRecord(record)}
            >
              記録を保存
            </Button>
          </div>
        </>
      )}

      {/* 中断時のメッセージ */}
      {!isComplete && (
        <p className="text-fg-muted text-sm">
          記録は残りません。お疲れさまでした。
        </p>
      )}

      {/* 次の行動導線（共通） */}
      <Button intent="primary" className="w-full" onClick={onNewSession}>
        新しいセッション
      </Button>
    </div>
  );
}
