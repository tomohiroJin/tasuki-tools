/**
 * お題エディタ/持ち込みコンポーネント
 * T051: FR-009,012,013,038,039,040,041 (US3)
 *
 * お題の表示・出所バッジ・コピー・再生成・持ち込みを提供する。
 * 各フィールドの編集は problem.edit コマンドで onEdit 経由で送る。
 * 編集・やり直し・持ち込みは editor+ のみ（canEdit）。コピーは全員可（FR-013/055）。
 */

import React, { useState, useEffect } from "react";
import type { Problem } from "@tdd-mob/core";
import { Button } from "./Button.js";

interface ProblemEditorProps {
  problem: Problem;
  /** editor+ のとき true。編集・やり直し・持ち込みを許可する（FR-055）。既定 true。 */
  canEdit?: boolean;
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

/** 改行区切りテキストを配列へ（空行は除去・前後空白トリム） */
function linesToArray(text: string): string[] {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function ProblemEditor({
  problem,
  canEdit = true,
  onEdit,
  onCopy,
  onRegenerate,
  onPaste,
}: ProblemEditorProps) {
  const [editing, setEditing] = useState(false);
  // 編集中の下書き。外部からお題が更新（やり直し/持ち込み/他者編集の snapshot 反映）
  // されたら同期する。コミットは各フィールドの blur で onEdit へ送る。
  const [draft, setDraft] = useState<Problem>(problem);
  useEffect(() => {
    setDraft(problem);
  }, [problem]);

  const inputClass =
    "w-full rounded-md border border-line bg-surface-2 px-2 py-1 text-sm text-fg " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

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
          {canEdit && (
            <Button
              intent={editing ? "primary" : "neutral"}
              size="sm"
              onClick={() => setEditing((v) => !v)}
            >
              {editing ? "編集を閉じる" : "編集"}
            </Button>
          )}
          {canEdit && (
            <Button intent="neutral" size="sm" onClick={onRegenerate} aria-label="お題をやり直す">
              やり直す
            </Button>
          )}
          {canEdit && (
            <Button intent="neutral" size="sm" onClick={onPaste} aria-label="お題を持ち込む">
              持ち込み
            </Button>
          )}
        </div>
      </div>

      {editing ? (
        /* 編集フォーム（各フィールドの blur で problem.edit を送る: FR-038） */
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-fg-subtle">タイトル</span>
            <input
              aria-label="お題タイトル"
              className={inputClass}
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              onBlur={(e) => onEdit({ title: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-fg-subtle">説明</span>
            <textarea
              aria-label="お題の説明"
              className={inputClass}
              rows={2}
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              onBlur={(e) => onEdit({ description: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-fg-subtle">要件（1行に1件）</span>
            <textarea
              aria-label="要件（1行に1件）"
              className={inputClass}
              rows={3}
              value={draft.requirements.join("\n")}
              onChange={(e) =>
                setDraft({ ...draft, requirements: e.target.value.split("\n") })
              }
              onBlur={(e) => onEdit({ requirements: linesToArray(e.target.value) })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-fg-subtle">例示テスト</span>
            <textarea
              aria-label="例示テスト"
              className={`${inputClass} font-mono`}
              rows={3}
              value={draft.exampleTest ?? ""}
              onChange={(e) => setDraft({ ...draft, exampleTest: e.target.value })}
              onBlur={(e) => onEdit({ exampleTest: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-fg-subtle">ヒント（1行に1件）</span>
            <textarea
              aria-label="ヒント（1行に1件）"
              className={inputClass}
              rows={2}
              value={draft.hints.join("\n")}
              onChange={(e) => setDraft({ ...draft, hints: e.target.value.split("\n") })}
              onBlur={(e) => onEdit({ hints: linesToArray(e.target.value) })}
            />
          </label>
        </div>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
