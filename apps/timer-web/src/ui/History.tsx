/**
 * 履歴ビュー（端末ローカル記録の可視化）
 * v2.3 #5: 完了記録は IndexedDB に保存されているが閲覧画面が無かった。
 * loadRecords で端末ローカルの完成記録を読み込み、一覧表示・個別削除を提供する。
 * 記録は端末ローカル（IndexedDB）に閉じるため host 限定にせず、誰でも自分の端末の記録を見られる。
 */

import React, { useEffect, useState } from "react";
import { History as HistoryIcon, Trash2, ArrowLeft } from "lucide-react";
import type { CompletionRecord } from "@tasuki/timer-core";
import { Card, GhostButton, SectionHeader } from "./primitives.js";
import { EmptyHint } from "./components/EmptyHint.js";
import { loadRecords, deleteRecord } from "../records/indexeddb.js";

interface HistoryProps {
  /** 一覧から元の画面（Setup）へ戻る。 */
  onBack: () => void;
}

/** 所要時間（秒）を「○分○秒」へ整形する（Summary と同じ体裁）。 */
function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}分${String(s).padStart(2, "0")}秒`;
}

/** 完了日時（epoch ms）を日本語ロケールで整形する。 */
function formatCompletedAt(epochMs: number): string {
  return new Date(epochMs).toLocaleString("ja-JP");
}

export function History({ onBack }: HistoryProps) {
  const [records, setRecords] = useState<CompletionRecord[]>([]);
  // 初回読み込み中は簡易表示を出す（空状態と読み込み中を取り違えないため）。
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    // indexeddb は副作用の境界。テストでは vi.mock で差し替えられる（実 DB に触れない）。
    loadRecords()
      .then((loaded) => {
        if (!active) return;
        // 新しい順（completedAt 降順）に並べる。loadRecords は completedAt 昇順で返すため反転する。
        setRecords([...loaded].sort((a, b) => b.completedAt - a.completedAt));
      })
      .catch((e) => {
        console.error("記録の読み込みに失敗しました:", e); // log-hygiene:allow ブラウザの devtools 向け
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  /** 記録を削除する。永続削除後に一覧から楽観的に取り除く。 */
  const handleDelete = (id: string) => {
    deleteRecord(id)
      .then(() => {
        setRecords((prev) => prev.filter((r) => r.id !== id));
      })
      .catch((e) => {
        console.error("記録の削除に失敗しました:", e); // log-hygiene:allow ブラウザの devtools 向け
      });
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <Card>
        <SectionHeader
          icon={HistoryIcon}
          color="text-[var(--signal)]"
          title="完了記録の履歴"
          right={
            <GhostButton onClick={onBack}>
              <span className="flex items-center gap-2">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                戻る
              </span>
            </GhostButton>
          }
        />

        {loading ? (
          <p className="text-sm text-[var(--bone-muted)]">読み込み中...</p>
        ) : records.length === 0 ? (
          <EmptyHint>
            まだ記録がありません。セッションを完了すると、この端末に記録が残ります。
          </EmptyHint>
        ) : (
          <ul className="flex flex-col gap-3" aria-label="完了記録の一覧">
            {records.map((record) => (
              <li key={record.id}>
                <Card className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-bold text-[var(--bone)]">
                        {record.problemTitle}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--bone-muted)]">
                        {record.language}・{record.difficulty}
                      </p>
                    </div>
                    <GhostButton
                      onClick={() => handleDelete(record.id)}
                      aria-label={`「${record.problemTitle}」の記録を削除`}
                      className="shrink-0"
                    >
                      <span className="flex items-center gap-1.5">
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        削除
                      </span>
                    </GhostButton>
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-4">
                    <div>
                      <dt className="instrument-label">所要時間</dt>
                      <dd className="tabular text-[var(--bone)]">
                        {formatDuration(record.elapsedSeconds)}
                      </dd>
                    </div>
                    <div>
                      <dt className="instrument-label">交代回数</dt>
                      <dd className="tabular text-[var(--bone)]">{record.totalSwitches}回</dd>
                    </div>
                    <div>
                      <dt className="instrument-label">メンバー</dt>
                      <dd className="tabular text-[var(--bone)]">{record.members.length}人</dd>
                    </div>
                    <div>
                      <dt className="instrument-label">日時</dt>
                      <dd className="text-[var(--bone-muted)]">
                        {formatCompletedAt(record.completedAt)}
                      </dd>
                    </div>
                  </dl>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
