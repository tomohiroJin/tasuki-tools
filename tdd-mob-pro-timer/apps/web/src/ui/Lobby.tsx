/**
 * ロビー画面（ルームコード・QR・コピー）
 * T058, T059: FR-011 ＋ デザインシステム適用
 */

import React, { useState, useEffect } from "react";
import { Copy, Check, Users, Code, Play, UserPlus, UserMinus, ChevronUp, ChevronDown, X } from "lucide-react";
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
  /** セッション設定の変更（言語/難易度/間隔/オプション）。editor+ のみ。config.set を送る。 */
  onConfigSet?: (patch: Partial<SessionConfig>) => void;
  /** 自分をドライバーローテーションに加える（自名で member.add）。2層モデル。 */
  onJoinRotation?: (displayName: string) => void;
  /** 自分をローテーションから外す（自名を渡し、index は App が最新 snapshot から解決）。 */
  onLeaveRotation?: (displayName: string) => void;
  /** ホストが参加者を退出させる（⑪・host 限定）。 */
  onRemoveParticipant?: (participantId: string) => void;
  /** ドライバー順の入れ替え（④・host）。fromIndex→toIndex（rotation 内の位置）。 */
  onMoveRotation?: (fromIndex: number, toIndex: number) => void;
}

/** 参加者行のコンパクトなアイコンボタン（行が改行だらけにならないよう小さく揃える）。 */
function RowIconButton({
  icon: Icon,
  label,
  onClick,
  disabled,
}: { icon: typeof UserPlus; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed border border-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}

export function Lobby({
  room,
  participantId,
  onStartSession,
  onEditProblem,
  onRegenerateProblem,
  onPasteProblem,
  onCopyProblem,
  onConfigSet,
  onJoinRotation,
  onLeaveRotation,
  onRemoveParticipant,
  onMoveRotation,
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
    // PC（lg+）は「左＝招待＋参加者 / 右＝設定＋お題＋開始」の2カラム。モバイルは縦積み。
    <div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start space-y-6 lg:space-y-0">
      {/* ── 左: 招待（コード/QR）＋参加者 ── */}
      <div className="space-y-6 lg:min-w-0">
      {/* ルームコード＋QR＋招待（1操作コピー） */}
      <Card className="text-center">
        <p className="text-sm text-white/50 mb-2">ルームコード</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <span className="font-mono text-4xl md:text-5xl font-black tracking-wider break-all bg-gradient-to-r from-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
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
            className="h-52 w-52 rounded-xl bg-white p-2.5 mx-auto mt-4"
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
            const rotationLen = room.session.rotation.length;
            const isLastDriver = inRotation && rotationLen <= 1;
            return (
              <li
                key={p.participantId}
                className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${presenceDotClass(p.presence)}`} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate font-medium">{p.displayName}</span>
                {/* ドライバー（順番つき）/ 見学 の区別（§9.2・④ 順番可視化） */}
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                    inRotation ? "bg-cyan-500/20 text-cyan-200" : "bg-white/10 text-white/60"
                  }`}
                >
                  {inRotation ? `ドライバー${rotationIndex + 1}` : "見学"}
                </span>
                {p.role === "host" && (
                  <span className="shrink-0 rounded-full bg-fuchsia-500/20 px-2 py-0.5 text-xs font-semibold text-fuchsia-300">主催者</span>
                )}

                {/* 操作エリア（本人＝加入/離脱、ホスト＝他人の加入/離脱・並び替え・退出） */}
                <span className="ml-auto flex shrink-0 items-center gap-1">
                  {isMe && (
                    inRotation ? (
                      <GhostButton
                        onClick={() => onLeaveRotation?.(p.displayName)}
                        disabled={isLastDriver}
                        title={isLastDriver ? "最後のドライバーは外れられません" : undefined}
                        className="text-xs px-3 py-1.5"
                      >
                        列から外れる
                      </GhostButton>
                    ) : (
                      <PrimaryButton onClick={() => onJoinRotation?.(p.displayName)} className="text-xs px-3 py-1.5">
                        ドライバーに加わる
                      </PrimaryButton>
                    )
                  )}
                  {/* ホストは他参加者のドライバー加入/離脱を制御できる（②） */}
                  {!isMe && isHost && (
                    inRotation ? (
                      <RowIconButton
                        icon={UserMinus}
                        label={`${p.displayName} をドライバーから外す`}
                        onClick={() => onLeaveRotation?.(p.displayName)}
                        disabled={isLastDriver}
                      />
                    ) : (
                      <RowIconButton
                        icon={UserPlus}
                        label={`${p.displayName} をドライバーに追加`}
                        onClick={() => onJoinRotation?.(p.displayName)}
                      />
                    )
                  )}
                  {/* ホストはドライバー順を入れ替えられる（④） */}
                  {isHost && inRotation && rotationLen > 1 && onMoveRotation && (
                    <>
                      <RowIconButton
                        icon={ChevronUp}
                        label={`${p.displayName} を前の順番へ`}
                        onClick={() => onMoveRotation(rotationIndex, rotationIndex - 1)}
                        disabled={rotationIndex === 0}
                      />
                      <RowIconButton
                        icon={ChevronDown}
                        label={`${p.displayName} を後の順番へ`}
                        onClick={() => onMoveRotation(rotationIndex, rotationIndex + 1)}
                        disabled={rotationIndex === rotationLen - 1}
                      />
                    </>
                  )}
                  {/* ホストは他参加者を退出させられる（⑪） */}
                  {!isMe && isHost && onRemoveParticipant && (
                    <RowIconButton
                      icon={X}
                      label={`${p.displayName} を退出させる`}
                      onClick={() => onRemoveParticipant(p.participantId)}
                    />
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>
      </div>{/* /左 */}

      {/* ── 右: セッション設定＋お題＋開始 ── */}
      <div className="space-y-6 lg:min-w-0">
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
        <SectionHeader icon={Code} color="text-fuchsia-400" title="お題" />
        {room.problem ? (
          <ProblemEditor
            problem={room.problem}
            canEdit={isEditor}
            difficulty={room.config.difficulty}
            language={room.config.language}
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
        <p className="text-center text-sm text-white/60">主催者のセッション開始を待っています...</p>
      )}
      </div>{/* /右 */}
    </div>
  );
}
