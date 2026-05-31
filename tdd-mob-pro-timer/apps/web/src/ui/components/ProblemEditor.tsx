/**
 * お題エディタ/持ち込みコンポーネント
 * T051: FR-009,012,013,038,039,040,041 (US3)
 *
 * お題の表示・出所バッジ・コピー・再生成・持ち込みを提供する。
 * 各フィールドの編集は problem.edit コマンドで onEdit 経由で送る。
 */

import React from "react";
import type { Problem } from "@tdd-mob/core";
import { Button } from "./Button.js";

interface ProblemEditorProps {
  problem: Problem;
  onEdit: (patch: Partial<Omit<Problem, "source" | "edited">>) => void;
  onCopy: () => void;
  onRegenerate: () => void;
  onPaste: () => void;
}

function SourceBadge({ source, edited }: { source?: string; edited?: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-xs">
      {source === "ai" && (
        <span className="rounded bg-primary/15 px-1.5 py-0.5 font-medium text-primary">
          AI 生成
        </span>
      )}
      {source === "fallback" && (
        <span className="rounded bg-surface-2 px-1.5 py-0.5 text-fg-muted">
          定型 (fallback)
        </span>
      )}
      {source === "custom" && (
        <span className="rounded bg-success/15 px-1.5 py-0.5 text-success">
          持ち込み
        </span>
      )}
      {edited && (
        <span className="rounded bg-warning/15 px-1.5 py-0.5 text-warning">
          編集済
        </span>
      )}
    </span>
  );
}

export function ProblemEditor({
  problem,
  onCopy,
  onRegenerate,
  onPaste,
}: ProblemEditorProps) {
  return (
    <div className="flex flex-col gap-3">
      {/* ヘッダー: タイトル + 出所バッジ + アクション */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-bold text-fg">{problem.title}</h3>
          <SourceBadge source={problem.source} edited={problem.edited} />
        </div>
        <div className="flex gap-2">
          <Button intent="neutral" size="sm" onClick={onCopy} aria-label="お題をコピー">
            コピー
          </Button>
          <Button intent="neutral" size="sm" onClick={onRegenerate} aria-label="お題をやり直す">
            やり直す
          </Button>
          <Button intent="neutral" size="sm" onClick={onPaste} aria-label="お題を持ち込む">
            持ち込み
          </Button>
        </div>
      </div>

      {/* 説明 */}
      <p className="text-sm text-fg-muted">{problem.description}</p>

      {/* 要件 */}
      {problem.requirements.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold text-fg-subtle">要件</p>
          <ul className="space-y-1">
            {problem.requirements.map((req, i) => (
              <li key={i} className="flex items-start gap-1.5 text-sm text-fg">
                <span className="mt-0.5 text-fg-subtle">·</span>
                <span>{req}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 例示テスト */}
      {problem.exampleTest && (
        <div>
          <p className="mb-1 text-xs font-semibold text-fg-subtle">例示テスト</p>
          <pre className="rounded-md bg-surface-2 p-3 text-xs font-mono text-fg overflow-x-auto">
            {problem.exampleTest}
          </pre>
        </div>
      )}

      {/* ヒント */}
      {problem.hints.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold text-fg-subtle">ヒント</p>
          <ul className="space-y-1">
            {problem.hints.map((hint, i) => (
              <li key={i} className="text-sm text-fg-muted">💡 {hint}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
