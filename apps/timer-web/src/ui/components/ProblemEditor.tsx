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
import { Dices, Loader2, Pencil, Sparkles, ClipboardPaste, Copy, ChevronDown, ChevronRight } from "lucide-react";
import type { Problem } from "@tasuki/timer-core";
import { MAX_PROBLEM_TITLE, MAX_PROBLEM_TEXT } from "@tasuki/timer-core/aggregate";
import { GhostButton } from "../primitives.js";
import { Markdown } from "./Markdown.js";

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
  /** AI/定型のお題を生成中（「別のお題にする」押下〜確定まで）。スピナー＋減光に使う。 */
  generating?: boolean;
  onEdit: (patch: Partial<Omit<Problem, "source" | "edited">>) => void;
  onCopy: () => void;
  onRegenerate: () => void;
  onPaste: () => void;
}

const DIFFICULTY_LABEL: Record<string, string> = { easy: "初級", medium: "中級", hard: "上級" };
// 難易度は計器の「危険度」表示として段階色を残す（緑→琥珀→朱赤・色のみ依存はラベル併記で回避）。
const DIFFICULTY_CLASS: Record<string, string> = {
  easy: "bg-[var(--ok-tint)] text-[var(--ok)] border border-[var(--ok-veil)]",
  medium: "bg-amber-400/15 text-amber-300 border border-amber-400/30",
  hard: "bg-[var(--signal-tint)] text-[var(--signal)] border border-[var(--signal-veil)]",
};

function Badges({
  difficulty,
  language,
  edited,
  source,
}: {
  difficulty?: string | undefined;
  language?: string | undefined;
  edited?: boolean | undefined;
  source?: string | undefined;
}) {
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
      {/* 出題元を必ず明示する（AI 生成 / 定型 / 持ち込み）。無印を作らない。 */}
      {source === "ai" ? (
        <span className="inline-flex items-center gap-1 rounded-sm bg-[var(--signal-tint)] px-2 py-0.5 font-semibold text-[var(--signal)] border border-[var(--signal-veil)]">
          <Sparkles className="w-3 h-3" aria-hidden="true" /> AI 生成
        </span>
      ) : source === "custom" ? (
        <span className="rounded-sm bg-[var(--ok-tint)] px-2 py-0.5 font-semibold text-[var(--ok)] border border-[var(--ok-veil)]">持ち込み</span>
      ) : (
        <span className="rounded-sm bg-[var(--panel-2)] px-2 py-0.5 font-semibold text-[var(--bone-muted)] border border-[var(--hairline)]">定型</span>
      )}
      {edited && (
        <span className="rounded-sm bg-[var(--signal-tint)] px-2 py-0.5 font-semibold text-[var(--signal)] border border-[var(--signal-veil)]">編集済</span>
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
  generating = false,
  onEdit,
  onCopy,
  onRegenerate,
  onPaste,
}: ProblemEditorProps) {
  const [editing, setEditing] = useState(false);
  // compact（セッション中）の1行バーを開いたか。非 compact では常にフルカード。
  const [barOpen, setBarOpen] = useState(false);
  // 要件・テスト例・ヒントの開閉。Lobby（非 compact）は既定で開いて内容をしっかり見せ、
  // セッション中（compact）は縦長を抑えるため既定で閉じる。
  const [detailsOpen, setDetailsOpen] = useState(!compact);
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
        className="flex w-full items-center gap-2 text-left text-sm text-[var(--bone-muted)] hover:text-[var(--bone)]"
      >
        <Badges difficulty={difficulty} edited={problem.edited} source={problem.source} />
        <span className="font-semibold text-[var(--bone)] truncate">{problem.title}</span>
        <span className="ml-auto flex items-center gap-1 text-[var(--bone-muted)]">詳細を開く <ChevronDown className="w-4 h-4" aria-hidden="true" /></span>
      </button>
    );
  }

  return (
    // 生成中は減光し、別のお題/編集/貼り付けを無効化（pointer-events + 各ボタン disabled）。コピーは害がないので許容
    <div
      role="group"
      aria-label="お題"
      aria-busy={generating || undefined}
      className={`flex flex-col gap-3 ${generating ? "opacity-50 pointer-events-none" : ""}`}
    >
      {/* ヘッダー: バッジ＋タイトル＋アクション */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1.5">
          <Badges difficulty={difficulty} language={language} edited={problem.edited} source={problem.source} />
          <h3 className="text-lg font-bold text-[var(--bone)]">{problem.title}</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <GhostButton onClick={onRegenerate} disabled={generating} aria-label={generating ? "生成中" : "別のお題にする"} className="text-sm">
              {generating ? (
                <span className="flex items-center gap-1.5"><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> 生成中…</span>
              ) : (
                <span className="flex items-center gap-1.5"><Dices className="w-4 h-4" aria-hidden="true" /> 別のお題にする</span>
              )}
            </GhostButton>
          )}
          {canEdit && (
            <GhostButton
              onClick={() => setEditing((v) => !v)}
              disabled={generating}
              className={`text-sm ${editing ? "ring-2 ring-[var(--signal)]" : ""}`}
            >
              <span className="flex items-center gap-1.5"><Pencil className="w-4 h-4" aria-hidden="true" /> {editing ? "編集を閉じる" : "内容を編集"}</span>
            </GhostButton>
          )}
          {canEdit && (
            <GhostButton onClick={onPaste} disabled={generating} aria-label="お題を持ち込む（貼り付け）" className="text-sm">
              <span className="flex items-center gap-1.5"><ClipboardPaste className="w-4 h-4" aria-hidden="true" /> 貼り付け</span>
            </GhostButton>
          )}
          <GhostButton onClick={onCopy} aria-label="お題をコピー" className="text-sm">
            <span className="flex items-center gap-1.5"><Copy className="w-4 h-4" aria-hidden="true" /> コピー</span>
          </GhostButton>
        </div>
      </div>

      {editing ? (
        /* 編集フォーム（各フィールドの blur で problem.edit を送る: FR-038） */
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-[var(--bone-muted)]">タイトル</span>
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
            <span className="text-xs font-semibold text-[var(--bone-muted)]">説明</span>
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
            <span className="text-xs font-semibold text-[var(--bone-muted)]">要件（1行に1件）</span>
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
            <span className="text-xs font-semibold text-[var(--bone-muted)]">例示テスト</span>
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
            <span className="text-xs font-semibold text-[var(--bone-muted)]">ヒント（1行に1件）</span>
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
          <Markdown source={problem.description} />

          {/* 詳細トグル（要件件数を明示・既定は閉じ） */}
          {hasDetails && (
            <button
              type="button"
              onClick={() => setDetailsOpen((v) => !v)}
              aria-expanded={detailsOpen}
              className="flex items-center gap-1 self-start text-sm text-[var(--bone-muted)] hover:text-[var(--bone)]"
            >
              {detailsOpen ? <ChevronDown className="w-4 h-4" aria-hidden="true" /> : <ChevronRight className="w-4 h-4" aria-hidden="true" />}
              {detailsOpen ? "詳細を隠す" : "詳細を表示"}（要件 {problem.requirements.length}・テスト例・ヒント）
            </button>
          )}

          {detailsOpen && hasDetails && (
            <>
              {problem.requirements.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold text-[var(--bone-muted)]">要件</p>
                  <ul className="space-y-1">
                    {problem.requirements.map((req) => (
                      <li key={req} className="flex items-start gap-1.5 text-sm text-[var(--bone)]">
                        <span className="mt-0.5 text-[var(--bone-muted)]">·</span>
                        <span>{req}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {problem.exampleTest && (
                <div>
                  <p className="mb-1 text-xs font-semibold text-[var(--bone-muted)]">例示テスト</p>
                  <pre className="rounded-md bg-[var(--panel-2)] border border-[var(--hairline)] p-3 text-xs font-mono text-[var(--bone)] overflow-x-auto">
                    {problem.exampleTest}
                  </pre>
                </div>
              )}
              {problem.hints.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold text-[var(--bone-muted)]">ヒント</p>
                  <ul className="space-y-1">
                    {problem.hints.map((hint) => (
                      <li key={hint} className="text-sm text-[var(--bone-muted)]">💡 {hint}</li>
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
              className="flex items-center gap-1 self-start text-xs text-[var(--bone-muted)] hover:text-[var(--bone)]"
            >
              <ChevronDown className="w-3 h-3 rotate-180" aria-hidden="true" /> 畳む
            </button>
          )}
        </>
      )}
    </div>
  );
}
