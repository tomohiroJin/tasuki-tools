/**
 * ロビー画面（ルームコード・QR・コピー）
 * T058, T059: FR-011 ＋ デザインシステム適用
 */

import React, { useState, useEffect } from "react";
import type { Room, Problem } from "@tdd-mob/core";
import { Button } from "./components/Button.js";
import { ProblemEditor } from "./components/ProblemEditor.js";
import { presenceDotClass, presenceLabel } from "./presence.js";

interface LobbyProps {
  room: Room;
  participantId: string;
  onStartSession: () => void;
  /** お題まわり（開始前にロビーでお題を決める・US3）。editor+ のみ編集できる。 */
  onEditProblem?: (patch: Partial<Omit<Problem, "source" | "edited">>) => void;
  onRegenerateProblem?: () => void;
  onPasteProblem?: () => void;
  onCopyProblem?: () => void;
  onOpenAiSettings?: () => void;
}

export function Lobby({
  room,
  participantId,
  onStartSession,
  onEditProblem,
  onRegenerateProblem,
  onPasteProblem,
  onCopyProblem,
  onOpenAiSettings,
}: LobbyProps) {
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const roomUrl = `${window.location.origin}?room=${room.code}`;
  const myRole = room.participants.find((p) => p.participantId === participantId)?.role;
  const isHost = myRole === "host";
  const isEditor = myRole === "host" || myRole === "editor";

  // クリップボード API が無い環境では黙って無視する
  const copyText = async (text: string) => {
    if (!navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* 権限拒否等は無視 */
    }
  };

  useEffect(() => {
    let cancelled = false;
    import("qrcode")
      .then((QRCode) => QRCode.toDataURL(roomUrl, { width: 200 }))
      .then((url: string) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        /* QR 生成失敗は無視 */
      });
    return () => {
      cancelled = true;
    };
  }, [roomUrl]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-6 p-6">
      <h2 className="text-xl font-bold text-fg">ロビー</h2>

      {/* ルームコード */}
      <div className="w-full text-center">
        <p className="mb-1 text-sm text-fg-subtle">ルームコード</p>
        <div className="flex items-center justify-center gap-3">
          <span className="font-mono text-4xl font-bold tracking-widest text-fg">
            {room.code}
          </span>
          <Button size="sm" intent="neutral" onClick={() => copyText(room.code)}>
            {copied ? "コピーしました" : "コピー"}
          </Button>
        </div>
      </div>

      {/* QR コード（白背景固定で読み取り保証） */}
      {qrDataUrl && (
        <img
          src={qrDataUrl}
          alt={`ルーム ${room.code} の QR コード`}
          className="h-48 w-48 rounded-md bg-white p-2"
        />
      )}

      <Button size="sm" intent="neutral" onClick={() => copyText(roomUrl)}>
        参加 URL をコピー
      </Button>

      {/* 参加者一覧 */}
      <div className="w-full">
        <h3 className="mb-2 text-sm font-semibold text-fg-subtle">
          参加者 ({room.participants.length}人)
        </h3>
        <ul className="space-y-1">
          {room.participants.map((p) => (
            <li key={p.participantId} className="flex items-center gap-2 text-sm text-fg">
              <span
                className={`h-2 w-2 rounded-full ${presenceDotClass(p.presence)}`}
                aria-hidden="true"
              />
              <span>{p.displayName}</span>
              <span className="text-xs text-fg-subtle">({presenceLabel(p.presence)})</span>
              {p.role === "host" && (
                <span className="text-xs font-semibold text-primary">主催者</span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* お題（開始前にここで決める・US3）。確定済みなら editor+ は編集できる。
          未確定なら準備中を示す。お題を見て納得してからタイマーを開始する流れ。 */}
      <div className="w-full">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-fg-subtle">お題</h3>
          {onOpenAiSettings && (
            <Button size="sm" intent="neutral" onClick={onOpenAiSettings}>
              AI 設定
            </Button>
          )}
        </div>
        {room.problem ? (
          <ProblemEditor
            problem={room.problem}
            canEdit={isEditor}
            onEdit={onEditProblem ?? (() => {})}
            onRegenerate={onRegenerateProblem ?? (() => {})}
            onPaste={onPasteProblem ?? (() => {})}
            onCopy={onCopyProblem ?? (() => {})}
          />
        ) : (
          <p className="rounded-md border border-line bg-surface p-3 text-sm text-fg-muted">
            お題を準備中です…
          </p>
        )}
      </div>

      {isHost ? (
        <Button
          intent="primary"
          className="w-full"
          onClick={onStartSession}
          disabled={!room.problem}
        >
          セッションを開始
        </Button>
      ) : (
        <p className="text-sm text-fg-subtle">主催者のセッション開始を待っています...</p>
      )}
    </div>
  );
}
