/**
 * 共有メモ（§9.1 拡張）
 *
 * editor+ は「編集／プレビュー」を切替でき、プレビューは Markdown 表示。
 * 途中参加者への Live Share リンクやルール提示が主用途のため表示領域を広めに取る。
 * viewer はメモがある時だけ Markdown で読み取り表示する。
 *
 * 入力確定（blur／プレビュー切替）時にだけ onCommit を呼ぶ（楽観更新は最小・§5.3）。
 * 親（Session）は room 単位で key を付けて再マウントするため、内部状態は room ごとに初期化される。
 *
 * §10 外部更新の可視化:
 * - note が外部（他クライアント）から変わった場合、1.5s ハイライト＋aria-live アナウンスを出す。
 * - 自分の commit と同値の更新では通知しない（二重通知の抑制）。
 */

import React, { useState, useEffect, useRef } from "react";
import { ArrowRight } from "lucide-react";
import { MAX_HANDOFF_NOTE } from "@tasuki/timer-core/aggregate";
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

  // 自分が最後に commit した値を記録。外部更新との区別に使う。
  const lastCommittedRef = useRef<string>(note);

  // note の前回値を追跡し、外部更新かどうかを判定する。
  const prevNoteRef = useRef(note);

  // 外部更新フラグ。true の間はハイライトと aria-live アナウンスを表示する。
  const [updated, setUpdated] = useState(false);

  // note 変化を検知: draft を追従し、外部更新なら 1.5s のハイライトを立てる。
  // 既存の `useEffect(() => setDraft(note), [note])` はこの effect に統合済み（重複なし）。
  useEffect(() => {
    const prev = prevNoteRef.current;
    prevNoteRef.current = note;
    setDraft(note);
    if (prev !== note && note !== lastCommittedRef.current) {
      setUpdated(true);
      const id = setTimeout(() => setUpdated(false), 1500);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [note]);

  const commit = () => {
    if (draft !== note) {
      // 送信前に lastCommittedRef を更新し、自己 commit 判定に備える。
      lastCommittedRef.current = draft;
      onCommit?.(draft);
    }
  };

  // 編集/プレビュー切替。内容の有無に依らず常にプレビュー始まり（読み手優先）。
  const [mode, setMode] = useState<"edit" | "preview">("preview");

  // 更新時のハイライトクラス
  const highlightClass = updated ? "ring-1 ring-[var(--signal)]" : "";

  // 外部更新アナウンス（aria-live）。両分岐で共通利用する sr-only スパン。
  const updateAnnouncement = (
    <span className="sr-only" aria-live="polite">
      {updated ? "共有メモが更新されました" : ""}
    </span>
  );

  // 閲覧者: メモがある時だけ Markdown で表示。
  if (!canEdit) {
    if (!note) return null;
    return (
      <Card className={highlightClass}>
        {updateAnnouncement}
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
    <Card className={highlightClass}>
      {updateAnnouncement}
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold text-[var(--bone)]">
          <ArrowRight className="w-4 h-4 text-[var(--signal)]" aria-hidden="true" />
          共有メモ
          <span className="instrument-label">Markdown</span>
        </span>
        {/* モード切替ボタン。プレビュー時→「編集」、編集時→「プレビューに戻る」（未確定分を送信してから切替）。 */}
        {mode === "preview" ? (
          <button
            type="button"
            onClick={() => setMode("edit")}
            className={segClass(false)}
          >
            編集
          </button>
        ) : (
          <button
            type="button"
            onClick={() => { commit(); setMode("preview"); }}
            className={segClass(false)}
          >
            プレビューに戻る
          </button>
        )}
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
          {note.trim() ? (
            <Markdown source={note} />
          ) : (
            <p className="text-sm text-[var(--bone-subtle)]">
              メモはまだありません。「編集」ボタンから Markdown で記入できます（リンク・箇条書き・見出しなど）。
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
