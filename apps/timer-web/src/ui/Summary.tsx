/**
 * セッション締めくくり画面（完成/中断で出し分け）
 * T048: FR-020,021,044 (US5)
 *
 * 完成（complete）: 達成表示 + 記録保存 + 書き出し + 次の行動導線
 * 中断（abort）: 中断表示 + 記録なし + 次の行動導線のみ
 */

import React, { useState } from "react";
import { Trophy, Sparkles, Check } from "lucide-react";
import type { CompletionRecord } from "@tasuki/timer-core";
import { Card } from "./primitives.js";

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
    <div className="summary">
      {/* タイトル: 完成/中断で明確に出し分け（完成はシグナル朱で達成感） */}
      {isComplete ? (
        <>
          <p className="instrument-label">Session Complete</p>
          <h2 className="summary-title">
            セッション完了
          </h2>
        </>
      ) : (
        <h2 className="summary-title-abort">セッション終了（中断）</h2>
      )}

      {/* 達成バナー（完成時のみ・S1）。中断では出さない（達成として扱わない）。 */}
      {isComplete && (
        <div
          aria-label="達成"
          className="summary-banner"
        >
          <p className="summary-banner-title">
            <Trophy className="summary-banner-icon" aria-hidden="true" /> ナイスワーク！
          </p>
          <p className="summary-banner-note">
            お題をやり遂げました。お疲れさまでした。
          </p>
        </div>
      )}

      {/* 完成時のみ記録詳細を表示 */}
      {isComplete && record && (
        <>
          {/* 統計の札 3 枚（#352・設計 D2）。40rem 未満と 64rem 以上（ドライバー別があるとき）は縦に積み、札の中はラベルを左・値を右の 1 行にする。
              40rem 以上 64rem 未満は横に 3 枚。並びは `summary.css` が持つ。2 列の配置は `.summary` の直下の子に掛けるので、
              統計とドライバー別の札を別の要素で包まない。 */}
          <div className="summary-stats">
            <Card className="summary-stat">
              <p className="instrument-label">所要時間</p>
              <p className="summary-stat-value tabular">{formatTime(record.elapsedSeconds)}</p>
            </Card>
            <Card className="summary-stat">
              <p className="instrument-label">交代回数</p>
              <p className="summary-stat-value tabular">{record.totalSwitches}回</p>
            </Card>
            <Card className="summary-stat">
              <p className="instrument-label">周回数</p>
              <p className="summary-stat-value tabular">{record.rounds ?? 0}周</p>
            </Card>
          </div>

          {/* 個人別ドライバー回数（偏りが一目で分かるバー・UX 再設計の振り返り） */}
          {record.driverCounts && record.driverCounts.length > 0 && (
            <Card className="summary-drivers">
              <p className="instrument-label summary-drivers-label">ドライバー別の回数</p>
              <ul className="summary-drivers-list">
                {record.members.map((name, i) => {
                  const count = record.driverCounts?.[i] ?? 0;
                  const max = Math.max(1, ...(record.driverCounts ?? [1]));
                  return (
                    <li key={`${name}-${i}`} className="summary-driver">
                      <span className="summary-driver-name">{name}</span>
                      <span className="summary-driver-bar">
                        <span
                          className="summary-driver-fill"
                          style={{ width: `${(count / max) * 100}%` }}
                        />
                      </span>
                      <span className="summary-driver-count tabular">{count}回</span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </>
      )}

      {/* 中断時のメッセージ */}
      {!isComplete && (
        <p className="summary-abort-note">
          記録は残りません。お疲れさまでした。
        </p>
      )}

      {/* 次の行動導線。並びは保存 → 新しいセッション（主は最後）。保存の添え書きは並びの下。 */}
      <div className="summary-next">
      <div className="ui-actions summary-actions">
        {isComplete && record && (
          <button
            type="button"
            className="ui-button ui-button--secondary"
            onClick={() => {
              onSaveRecord(record);
              setSaved(true);
            }}
          >
            <span className="summary-button-label">
              {saved ? <Check className="summary-saved-icon" aria-hidden="true" /> : null}
              {saved ? "保存しました" : "記録を保存"}
            </span>
          </button>
        )}
        <button type="button" className="ui-button ui-button--lg" onClick={onNewSession}>
          <span className="summary-button-label">
            <Sparkles className="summary-new-icon" aria-hidden="true" /> 新しいセッション
          </span>
        </button>
      </div>
      {isComplete && record && (
        <p className="summary-hint">
          完了時に自動保存されています。手動で再保存もできます。
        </p>
      )}
      </div>
    </div>
  );
}
