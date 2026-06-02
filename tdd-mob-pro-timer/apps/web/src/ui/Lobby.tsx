/**
 * ロビー画面（ルームコード・QR・コピー）
 * T058, T059: FR-011 ＋ デザインシステム適用
 */

import React, { useState, useEffect } from "react";
import { Copy, Check, Users, Code, Play } from "lucide-react";
import type { Room, Problem } from "@tdd-mob/core";
import { Card, PrimaryButton, GhostButton, SectionHeader } from "./primitives.js";
import { ProblemEditor } from "./components/ProblemEditor.js";
import { ConfigPanel } from "./components/ConfigPanel.js";
import { presenceDotClass, presenceLabel } from "./presence.js";
import type { SessionConfig } from "@tdd-mob/core";

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
  /** セッション設定の変更（言語/難易度/間隔/オプション）。editor+ のみ。config.set を送る。 */
  onConfigSet?: (patch: Partial<SessionConfig>) => void;
  /** 自分をドライバーローテーションに加える（自名で member.add）。2層モデル。 */
  onJoinRotation?: (displayName: string) => void;
  /** 自分をローテーションから外す（自名を渡し、index は App が最新 snapshot から解決）。 */
  onLeaveRotation?: (displayName: string) => void;
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
  onConfigSet,
  onJoinRotation,
  onLeaveRotation,
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
    <div className="space-y-6">
      {/* ルームコード＋QR＋招待（1操作コピー） */}
      <Card className="text-center">
        <p className="text-sm text-white/50 mb-1">ルームコード</p>
        <div className="flex items-center justify-center gap-3">
          <span className="font-mono text-4xl font-black tracking-widest bg-gradient-to-r from-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
            {room.code}
          </span>
          <GhostButton onClick={() => copyText(room.code)} aria-label="ルームコードをコピー">
            <span className="flex items-center gap-1 text-sm">
              {copied ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
              {copied ? "コピーしました" : "コピー"}
            </span>
          </GhostButton>
        </div>
        {qrDataUrl && (
          <img
            src={qrDataUrl}
            alt={`ルーム ${room.code} の QR コード`}
            className="h-44 w-44 rounded-xl bg-white p-2 mx-auto mt-4"
          />
        )}
        <div className="mt-3">
          <GhostButton onClick={() => copyText(roomUrl)}>
            <span className="flex items-center gap-1 text-sm"><Copy className="w-4 h-4" /> 参加 URL をコピー</span>
          </GhostButton>
        </div>
      </Card>

      {/* 参加者一覧 */}
      <Card>
        <SectionHeader icon={Users} color="text-violet-400" title={`参加者 (${room.participants.length}人)`} />
        <ul className="space-y-1.5">
          {room.participants.map((p) => {
            const rotationIndex = room.session.rotation.indexOf(p.displayName);
            const inRotation = rotationIndex >= 0;
            const isMe = p.participantId === participantId;
            return (
              <li
                key={p.participantId}
                className="flex items-center gap-2 text-sm text-white rounded-xl bg-white/5 border border-white/10 px-3 py-2"
              >
                <span className={`h-2 w-2 rounded-full ${presenceDotClass(p.presence)}`} aria-hidden="true" />
                <span className="flex-1">{p.displayName}</span>
                {/* ドライバー（rotation 内）/ 見学 の区別（§9.2・2層モデル） */}
                <span className={`text-xs font-semibold ${inRotation ? "text-cyan-300" : "text-white/40"}`}>
                  {inRotation ? "ドライバー" : "見学"}
                </span>
                {p.role === "host" && (
                  <span className="text-xs font-semibold text-fuchsia-300">主催者</span>
                )}
                {/* 本人だけ、ローテーション加入/離脱を切り替えられる */}
                {isMe && (
                  inRotation ? (
                    <GhostButton
                      onClick={() => onLeaveRotation?.(p.displayName)}
                      className="text-xs px-2 py-1"
                    >
                      列から外れる
                    </GhostButton>
                  ) : (
                    <PrimaryButton
                      onClick={() => onJoinRotation?.(p.displayName)}
                      className="text-xs px-2 py-1"
                    >
                      ドライバーに加わる
                    </PrimaryButton>
                  )
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      {/* セッション設定（言語/難易度/間隔/詳細設定）。host(editor+) が開始前に決める。 */}
      <Card>
        <ConfigPanel
          config={room.config}
          canEdit={isEditor}
          onChange={(patch) => onConfigSet?.(patch)}
        />
      </Card>

      {/* お題（開始前にここで決める・US3）。確定済みなら editor+ は編集できる。 */}
      <Card>
        <SectionHeader
          icon={Code}
          color="text-fuchsia-400"
          title="お題"
          right={
            onOpenAiSettings ? (
              <GhostButton onClick={onOpenAiSettings} className="text-sm">AI 設定</GhostButton>
            ) : undefined
          }
        />
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
          <div className="py-8 text-center text-white/60">
            <span className="inline-block h-4 w-4 animate-pulse rounded-full bg-fuchsia-400 mb-2" aria-hidden="true" />
            <p>お題を準備中です…</p>
          </div>
        )}
      </Card>

      {isHost ? (
        <PrimaryButton className="w-full" onClick={onStartSession} disabled={!room.problem}>
          <span className="flex items-center justify-center gap-2"><Play className="w-5 h-5" /> セッションを開始</span>
        </PrimaryButton>
      ) : (
        <p className="text-center text-sm text-white/50">主催者のセッション開始を待っています...</p>
      )}
    </div>
  );
}
