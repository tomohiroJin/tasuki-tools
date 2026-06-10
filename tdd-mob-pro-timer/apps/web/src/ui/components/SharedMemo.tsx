/**
 * 共有メモ（§9.1 拡張）
 *
 * editor+ は「編集／プレビュー」を切替でき、プレビューは Markdown 表示。
 * 途中参加者への Live Share リンクやルール提示が主用途のため表示領域を広めに取る。
 * viewer はメモがある時だけ Markdown で読み取り表示する。
 *
 * 入力確定（blur／プレビュー切替）時にだけ onCommit を呼ぶ（楽観更新は最小・§5.3）。
 * 親（Session）は room 単位で key を付けて再マウントするため、内部状態は room ごとに初期化される。
 */

import React, { useState, useEffect } from "react";
import { ArrowRight } from "lucide-react";
import { MAX_HANDOFF_NOTE } from "@tdd-mob/core/aggregate";
import { Card } from "../primitives.js";
import { Markdown } from "./Markdown.js";

interface SharedMemoProps {
  /** サーバー権威のメモ本文（snapshot 由来）。 */
  note: string;
  /** 編集できるか（editor+）。false の閲覧者にはメモがある時だけ読み取り表示する。 */
  canEdit: boolean;
  /** 確定時にメモを送信する（handoff.note.set）。 */
  onCommit?: (text: string) => void;
}

export function SharedMemo({ note, canEdit, onCommit }: SharedMemoProps) {
  // ローカル編集状態。サーバー snapshot が来たら追従し、確定時にだけ送信する。
  const [draft, setDraft] = useState(note);
  useEffect(() => setDraft(note), [note]);
  const commit = () => {
    if (draft !== note) onCommit?.(draft);
  };
  // 編集/プレビュー切替。内容があれば既定でプレビュー（読み手向け）。
  const [mode, setMode] = useState<"edit" | "preview">(
    note.trim() ? "preview" : "edit",
  );

  // 閲覧者: メモがある時だけ Markdown で表示。
  if (!canEdit) {
    if (!note) return null;
    return (
      <Card>
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--bone)]">
          <ArrowRight className="w-4 h-4 text-[var(--signal)]" aria-hidden="true" />
          共有メモ
        </div>
        <div aria-live="polite">
          <Markdown source={note} />
        </div>
      </Card>
    );
  }

  const segClass = (active: boolean) =>
    `px-3 py-1.5 transition-colors ${
      active
        ? "bg-[var(--signal)] text-[#160603] font-semibold"
        : "bg-[var(--panel-2)] text-[var(--bone-muted)] hover:bg-[#252934]"
    }`;

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold text-[var(--bone)]">
          <ArrowRight className="w-4 h-4 text-[var(--signal)]" aria-hidden="true" />
          共有メモ
          <span className="instrument-label">Markdown</span>
        </span>
        {/* 編集/プレビュー切替（セグメント）。プレビュー切替時に未確定分を送信する。 */}
        <span
          className="flex rounded-md border border-[var(--hairline)] overflow-hidden text-xs"
          role="group"
          aria-label="メモの表示モード切替"
        >
          <button type="button" aria-pressed={mode === "edit"} onClick={() => setMode("edit")} className={segClass(mode === "edit")}>
            編集
          </button>
          <button
            type="button"
            aria-pressed={mode === "preview"}
            onClick={() => { commit(); setMode("preview"); }}
            className={segClass(mode === "preview")}
          >
            プレビュー
          </button>
        </span>
      </div>
      {mode === "edit" ? (
        <textarea
          id="shared-memo"
          aria-label="共有メモ"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          rows={10}
          maxLength={MAX_HANDOFF_NOTE}
          placeholder={"例（Markdown 可）:\n## 参加方法\nVSCode Live Share に参加してください:\nhttps://prod.liveshare.vsengsaas.visualstudio.com/...\n\n## ルール\n- 5分で交代\n- 困ったら一時停止"}
          className="w-full min-h-[200px] resize-y rounded-md bg-[var(--panel-2)] border border-[var(--hairline-strong)] px-3 py-2 text-sm font-mono text-[var(--bone)] outline-none focus:border-[var(--signal)] transition-colors focus-visible:ring-2 focus-visible:ring-[var(--signal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ink)]"
        />
      ) : (
        <div className="min-h-[200px] rounded-md bg-[var(--panel-2)] border border-[var(--hairline)] px-3 py-2" aria-live="polite">
          {draft.trim() ? (
            <Markdown source={draft} />
          ) : (
            <p className="text-sm text-[var(--bone-subtle)]">
              メモはまだありません。「編集」から Markdown で記入できます（リンク・箇条書き・見出しなど）。
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
