/**
 * お題エディタ/持ち込みコンポーネント（課題シート型）
 * T051: FR-009,012,013,038,039,040,041 (US3)
 *
 * 難易度/言語バッジ＋タイトル、要件・テスト例・ヒントは折りたたみ。
 * アクションは言葉＋アイコンで明快に（別のお題/編集/貼り付け/コピー）。
 * compact=true（セッション中）は1行バーに畳み、目立たせない（⑫）。
 * 編集・やり直し・持ち込みは editor+ のみ（canEdit）。コピーは全員可（FR-013/055）。
 */

import React, { useState, useEffect } from "react";
import { Dices, Pencil, ClipboardPaste, Copy, ChevronDown, ChevronRight } from "lucide-react";
import type { Problem } from "@tdd-mob/core";
import { MAX_PROBLEM_TITLE, MAX_PROBLEM_TEXT } from "@tdd-mob/core/aggregate";
import { GhostButton } from "../primitives.js";

interface ProblemEditorProps {
  problem: Problem;
  /** editor+ のとき true。編集・やり直し・持ち込みを許可する（FR-055）。既定 true。 */
  canEdit?: boolean;
  /** 出題の難易度（room.config 由来）。バッジ表示用。 */
  difficulty?: string;
  /** 出題の言語（room.config 由来）。バッジ表示用。 */
  language?: string;
  /** セッション中など、1行バーに畳んで表示する（⑫ 目立たせない）。 */
  compact?: boolean;
  onEdit: (patch: Partial<Omit<Problem, "source" | "edited">>) => void;
  onCopy: () => void;
  onRegenerate: () => void;
  onPaste: () => void;
}

const DIFFICULTY_LABEL: Record<string, string> = { easy: "初級", medium: "中級", hard: "上級" };
// 難易度は計器の「危険度」表示として段階色を残す（緑→琥珀→朱赤・色のみ依存はラベル併記で回避）。
const DIFFICULTY_CLASS: Record<string, string> = {
  easy: "bg-[rgba(63,178,127,0.15)] text-[var(--ok)] border border-[rgba(63,178,127,0.3)]",
  medium: "bg-amber-400/15 text-amber-300 border border-amber-400/30",
  hard: "bg-[rgba(255,74,46,0.15)] text-[var(--signal)] border border-[rgba(255,74,46,0.3)]",
};

function Badges({
  difficulty,
  language,
  edited,
  source,
}: { difficulty?: string; language?: string; edited?: boolean; source?: string }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-xs">
      {difficulty && (
        <span className={`rounded-sm px-2 py-0.5 font-semibold tabular ${DIFFICULTY_CLASS[difficulty] ?? "bg-[var(--panel-2)] text-[var(--bone-muted)] border border-[var(--hairline)]"}`}>
          {DIFFICULTY_LABEL[difficulty] ?? difficulty}
        </span>
      )}
      {language && (
        <span className="rounded-sm bg-[var(--panel-2)] px-2 py-0.5 font-semibold text-[var(--bone-muted)] border border-[var(--hairline)]">{language}</span>
      )}
      {/* 持ち込み（自前のお題）は明示する。定型/AI はバッジ化しない（出題源が一意のため）。 */}
      {source === "custom" && (
        <span className="rounded-sm bg-[rgba(63,178,127,0.15)] px-2 py-0.5 text-[var(--ok)] border border-[rgba(63,178,127,0.3)]">持ち込み</span>
      )}
      {edited && (
        <span className="rounded-sm bg-[rgba(255,74,46,0.14)] px-2 py-0.5 text-[var(--signal)] border border-[rgba(255,74,46,0.3)]">編集済</span>
      )}
    </span>
  );
}

/** 改行区切りテキストを配列へ（空行は除去・前後空白トリム） */
function linesToArray(text: string): string[] {
  return text.split("\n").map((s) => s.trim()).filter((s) => s.length > 0);
}

export function ProblemEditor({
  problem,
  canEdit = true,
  difficulty,
  language,
  compact = false,
  onEdit,
  onCopy,
  onRegenerate,
  onPaste,
}: ProblemEditorProps) {
  const [editing, setEditing] = useState(false);
  // compact（セッション中）の1行バーを開いたか。非 compact では常にフルカード。
  const [barOpen, setBarOpen] = useState(false);
  // 要件・テスト例・ヒントの開閉。既定は閉じ（ロビーの縦長を抑える・スペック準拠）。
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [draft, setDraft] = useState<Problem>(problem);
  useEffect(() => {
    setDraft(problem);
  }, [problem]);

  const inputClass =
    "w-full rounded-md border border-[var(--hairline-strong)] bg-[var(--panel-2)] px-2 py-1 text-sm text-[var(--bone)] " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--signal)]";

  const hasDetails =
    problem.requirements.length > 0 || !!problem.exampleTest || problem.hints.length > 0;

  // compact かつ未展開 = 1行バーのみ（難易度＋タイトル＋開く）。
  if (compact && !barOpen) {
    return (
      <button
        type="button"
        onClick={() => setBarOpen(true)}
        aria-expanded={false}
        className="flex w-full items-center gap-2 text-left text-sm text-white/80 hover:text-white"
      >
        <Badges difficulty={difficulty} edited={problem.edited} source={problem.source} />
        <span className="font-semibold text-white truncate">{problem.title}</span>
        <span className="ml-auto flex items-center gap-1 text-white/60">詳細を開く <ChevronDown className="w-4 h-4" /></span>
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* ヘッダー: バッジ＋タイトル＋アクション */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1.5">
          <Badges difficulty={difficulty} language={language} edited={problem.edited} source={problem.source} />
          <h3 className="text-lg font-bold text-white">{problem.title}</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <GhostButton onClick={onRegenerate} aria-label="別のお題にする" className="text-sm">
              <span className="flex items-center gap-1.5"><Dices className="w-4 h-4" /> 別のお題にする</span>
            </GhostButton>
          )}
          {canEdit && (
            <GhostButton
              onClick={() => setEditing((v) => !v)}
              className={`text-sm ${editing ? "ring-2 ring-[var(--signal)]" : ""}`}
            >
              <span className="flex items-center gap-1.5"><Pencil className="w-4 h-4" aria-hidden="true" /> {editing ? "編集を閉じる" : "内容を編集"}</span>
            </GhostButton>
          )}
          {canEdit && (
            <GhostButton onClick={onPaste} aria-label="お題を持ち込む（貼り付け）" className="text-sm">
              <span className="flex items-center gap-1.5"><ClipboardPaste className="w-4 h-4" /> 貼り付け</span>
            </GhostButton>
          )}
          <GhostButton onClick={onCopy} aria-label="お題をコピー" className="text-sm">
            <span className="flex items-center gap-1.5"><Copy className="w-4 h-4" /> コピー</span>
          </GhostButton>
        </div>
      </div>

      {editing ? (
        /* 編集フォーム（各フィールドの blur で problem.edit を送る: FR-038） */
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-white/60">タイトル</span>
            <input
              aria-label="お題タイトル"
              className={inputClass}
              maxLength={MAX_PROBLEM_TITLE}
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              onBlur={(e) => onEdit({ title: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-white/60">説明</span>
            <textarea
              aria-label="お題の説明"
              className={inputClass}
              rows={2}
              maxLength={MAX_PROBLEM_TEXT}
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              onBlur={(e) => onEdit({ description: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-white/60">要件（1行に1件）</span>
            <textarea
              aria-label="要件（1行に1件）"
              className={inputClass}
              rows={3}
              value={draft.requirements.join("\n")}
              onChange={(e) => setDraft({ ...draft, requirements: e.target.value.split("\n") })}
              onBlur={(e) => onEdit({ requirements: linesToArray(e.target.value) })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-white/60">例示テスト</span>
            <textarea
              aria-label="例示テスト"
              className={`${inputClass} font-mono`}
              rows={3}
              maxLength={MAX_PROBLEM_TEXT}
              value={draft.exampleTest ?? ""}
              onChange={(e) => setDraft({ ...draft, exampleTest: e.target.value })}
              onBlur={(e) => onEdit({ exampleTest: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-white/60">ヒント（1行に1件）</span>
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
          <p className="text-sm text-white/80">{problem.description}</p>

          {/* 詳細トグル（要件件数を明示・既定は閉じ） */}
          {hasDetails && (
            <button
              type="button"
              onClick={() => setDetailsOpen((v) => !v)}
              aria-expanded={detailsOpen}
              className="flex items-center gap-1 self-start text-sm text-white/70 hover:text-white"
            >
              {detailsOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              {detailsOpen ? "詳細を隠す" : "詳細を表示"}（要件 {problem.requirements.length}・テスト例・ヒント）
            </button>
          )}

          {detailsOpen && hasDetails && (
            <>
              {problem.requirements.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold text-white/60">要件</p>
                  <ul className="space-y-1">
                    {problem.requirements.map((req) => (
                      <li key={req} className="flex items-start gap-1.5 text-sm text-white">
                        <span className="mt-0.5 text-white/60">·</span>
                        <span>{req}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {problem.exampleTest && (
                <div>
                  <p className="mb-1 text-xs font-semibold text-white/60">例示テスト</p>
                  <pre className="rounded-md bg-[var(--panel-2)] border border-[var(--hairline)] p-3 text-xs font-mono text-[var(--bone)] overflow-x-auto">
                    {problem.exampleTest}
                  </pre>
                </div>
              )}
              {problem.hints.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold text-white/60">ヒント</p>
                  <ul className="space-y-1">
                    {problem.hints.map((hint) => (
                      <li key={hint} className="text-sm text-white/70">💡 {hint}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {/* compact 展開時はバーへ畳むボタン */}
          {compact && (
            <button
              type="button"
              onClick={() => setBarOpen(false)}
              className="flex items-center gap-1 self-start text-xs text-white/60 hover:text-white"
            >
              <ChevronDown className="w-3 h-3 rotate-180" /> 畳む
            </button>
          )}
        </>
      )}
    </div>
  );
}
