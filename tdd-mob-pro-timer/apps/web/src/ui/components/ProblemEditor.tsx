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
import { GhostButton } from "../primitives.js";

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
        <span className="rounded bg-fuchsia-500/20 px-1.5 py-0.5 font-medium text-fuchsia-200">
          AI 生成
        </span>
      )}
      {source === "fallback" && (
        <span className="rounded bg-white/10 px-1.5 py-0.5 text-white/70">
          定型 (fallback)
        </span>
      )}
      {source === "custom" && (
        <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-emerald-200">
          持ち込み
        </span>
      )}
      {edited && (
        <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-amber-200">
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
  // 詳細（要件・例示テスト・ヒント）の開閉。既定は折りたたみ、ロビーの縦長を抑える（S2）。
  // タイトル・説明は常時表示し「何の問題か」は一目で分かる。
  const [showDetails, setShowDetails] = useState(false);
  // 編集中の下書き。外部からお題が更新（やり直し/持ち込み/他者編集の snapshot 反映）
  // されたら同期する。コミットは各フィールドの blur で onEdit へ送る。
  const [draft, setDraft] = useState<Problem>(problem);
  useEffect(() => {
    setDraft(problem);
  }, [problem]);

  const inputClass =
    "w-full rounded-md border border-white/20 bg-white/10 px-2 py-1 text-sm text-white " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400";

  return (
    <div className="flex flex-col gap-3">
      {/* ヘッダー: タイトル + 出所バッジ + アクション */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-bold text-white">{problem.title}</h3>
          <SourceBadge source={problem.source} edited={problem.edited} />
        </div>
        <div className="flex gap-2">
          <GhostButton onClick={onCopy} aria-label="お題をコピー">
            コピー
          </GhostButton>
          {canEdit && (
            <GhostButton
              onClick={() => setEditing((v) => !v)}
              className={editing ? "ring-2 ring-fuchsia-400" : ""}
            >
              {editing ? "編集を閉じる" : "編集"}
            </GhostButton>
          )}
          {canEdit && (
            <GhostButton onClick={onRegenerate} aria-label="お題をやり直す">
              やり直す
            </GhostButton>
          )}
          {canEdit && (
            <GhostButton onClick={onPaste} aria-label="お題を持ち込む">
              持ち込み
            </GhostButton>
          )}
        </div>
      </div>

      {editing ? (
        /* 編集フォーム（各フィールドの blur で problem.edit を送る: FR-038） */
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-white/50">タイトル</span>
            <input
              aria-label="お題タイトル"
              className={inputClass}
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              onBlur={(e) => onEdit({ title: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-white/50">説明</span>
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
            <span className="text-xs font-semibold text-white/50">要件（1行に1件）</span>
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
            <span className="text-xs font-semibold text-white/50">例示テスト</span>
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
            <span className="text-xs font-semibold text-white/50">ヒント（1行に1件）</span>
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
          {/* 説明（常時表示・何の問題か一目で分かる） */}
          <p className="text-sm text-white/70">{problem.description}</p>

          {/* 詳細（要件・例示テスト・ヒント）の開閉トグル。詳細が1つでもあるときのみ表示。
              既定は折りたたみで、ロビーが縦に伸びすぎないようにする（S2）。 */}
          {(problem.requirements.length > 0 ||
            !!problem.exampleTest ||
            problem.hints.length > 0) && (
            <GhostButton
              onClick={() => setShowDetails((v) => !v)}
              aria-expanded={showDetails}
            >
              {showDetails ? "詳細を隠す" : "詳細を表示"}
            </GhostButton>
          )}

          {showDetails && (
            <>
              {/* 要件 */}
              {problem.requirements.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold text-white/50">要件</p>
                  <ul className="space-y-1">
                    {problem.requirements.map((req) => (
                      <li key={req} className="flex items-start gap-1.5 text-sm text-white">
                        <span className="mt-0.5 text-white/50">·</span>
                        <span>{req}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 例示テスト */}
              {problem.exampleTest && (
                <div>
                  <p className="mb-1 text-xs font-semibold text-white/50">例示テスト</p>
                  <pre className="rounded-md bg-white/10 p-3 text-xs font-mono text-white overflow-x-auto">
                    {problem.exampleTest}
                  </pre>
                </div>
              )}

              {/* ヒント */}
              {problem.hints.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold text-white/50">ヒント</p>
                  <ul className="space-y-1">
                    {problem.hints.map((hint) => (
                      <li key={hint} className="text-sm text-white/70">💡 {hint}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
