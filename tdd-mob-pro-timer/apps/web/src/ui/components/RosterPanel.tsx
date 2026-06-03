/**
 * 在席一覧パネル
 * T057: FR-046,047,048,050,051,052,061 (US9)
 *
 * 全参加者の在席状況・現ドライバー・役割を常時一覧表示。
 * 代理追加・改名・スキップ/復帰操作を提供する。
 * 色＋テキスト併記（FR-032）。
 */

import React, { useState } from "react";
import { Users } from "lucide-react";
import type { Participant } from "@tdd-mob/core";
import { GhostButton, PrimaryButton, SectionHeader } from "../primitives.js";
import { presenceLabel, presenceDotClass, presenceTextClass } from "../presence.js";

/** 小さなダーク用ボタン（glass）。RosterPanel 内の改名/スキップ等のコンパクト操作用。 */
function MiniButton({
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-medium bg-white/10 hover:bg-white/20 border border-white/10 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
      {...rest}
    >
      {children}
    </button>
  );
}

interface RosterPanelProps {
  participants: Participant[];
  /** 現ドライバーの表示名（session.rotation[currentIndex]）。
   *  participants 配列のインデックスと rotation のインデックスは一致しないため、
   *  配列位置ではなく名前で現ドライバーを判定する。重複名は member.add/addProxy で
   *  拒否されるため displayName は一意。 */
  currentDriverName: string;
  myParticipantId: string;
  canHostAction: boolean;
  onRename: (participantId: string, displayName: string) => void;
  onSkip: (participantId: string) => void;
  onResume: (participantId: string) => void;
  onAddProxy: (displayName: string) => void;
  /** ホストが参加者を退出させる（⑪・host 限定）。 */
  onRemove?: (participantId: string) => void;
}

export function RosterPanel({
  participants,
  currentDriverName,
  myParticipantId,
  canHostAction,
  onRename,
  onSkip,
  onResume,
  onAddProxy,
  onRemove,
}: RosterPanelProps) {
  const [proxyName, setProxyName] = useState("");
  const [showProxyInput, setShowProxyInput] = useState(false);
  // 改名中の参加者 ID と編集中の名前（同時に1人だけ編集できる）
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const handleAddProxy = () => {
    if (!proxyName.trim()) return;
    onAddProxy(proxyName.trim());
    setProxyName("");
    setShowProxyInput(false);
  };

  const startRename = (participantId: string, current: string) => {
    setEditingId(participantId);
    setEditName(current);
  };

  const submitRename = (participantId: string) => {
    const trimmed = editName.trim();
    if (trimmed) onRename(participantId, trimmed);
    setEditingId(null);
    setEditName("");
  };

  return (
    <div className="w-full">
      <SectionHeader
        icon={Users}
        color="text-violet-400"
        title="参加者"
        right={
          canHostAction ? (
            <GhostButton onClick={() => setShowProxyInput((v) => !v)} aria-label="代理参加者を追加" className="text-sm">
              代理追加
            </GhostButton>
          ) : undefined
        }
      />

      {/* 代理追加フォーム */}
      {showProxyInput && (
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={proxyName}
            onChange={(e) => setProxyName(e.target.value)}
            placeholder="Web 非接続のメンバー名"
            aria-label="代理参加者の名前"
            className="flex-1 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white outline-none focus:border-fuchsia-400"
          />
          <PrimaryButton onClick={handleAddProxy} className="px-4 py-2 text-sm">追加</PrimaryButton>
        </div>
      )}

      <ul className="flex flex-col gap-1.5">
        {participants.map((p) => {
          const isCurrentDriver =
            currentDriverName !== "" && p.displayName === currentDriverName;
          const isMine = p.participantId === myParticipantId;
          const isSkipping = p.driverEligible === false;
          // 改名は本人 or ホストが可能（観覧者でも自分自身は改名可: FR-046）
          const canRename = isMine || canHostAction;
          const isEditing = editingId === p.participantId;

          return (
            <li
              key={p.participantId}
              className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors ${
                isCurrentDriver
                  ? "bg-amber-400/15 border border-amber-400/40"
                  : "bg-white/5 border border-white/10"
              }`}
            >
              {/* 在席ドット（色＋ラベル） */}
              <span
                className={`h-2 w-2 rounded-full flex-shrink-0 ${presenceDotClass(p.presence)}`}
                aria-hidden="true"
              />

              {/* 名前（改名中は入力＋保存/キャンセル） */}
              {isEditing ? (
                <span className="flex flex-1 gap-1">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    aria-label={`${p.displayName} の新しい名前`}
                    className="flex-1 rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-sm text-white outline-none focus:border-fuchsia-400"
                  />
                  <MiniButton onClick={() => submitRename(p.participantId)}>保存</MiniButton>
                  <MiniButton onClick={() => setEditingId(null)}>取消</MiniButton>
                </span>
              ) : (
                <span className="flex-1 text-white">{p.displayName}</span>
              )}

              {/* バッジ（改名中は隠す） */}
              {!isEditing && (
                <span className="flex items-center gap-1.5 text-xs">
                  <span className="sr-only">{presenceLabel(p.presence)}</span>
                  <span className={presenceTextClass(p.presence)}>
                    {presenceLabel(p.presence)}
                  </span>
                  {p.role === "host" && (
                    <span className="text-fuchsia-300 font-semibold">主催者</span>
                  )}
                  {p.role === "viewer" && (
                    <span className="text-white/60">観覧</span>
                  )}
                  {p.isPlaceholder && (
                    <span className="text-amber-300">代理</span>
                  )}
                  {isSkipping && (
                    <span className="text-white/60">離脱中</span>
                  )}
                  {isCurrentDriver && (
                    <span className="text-amber-300 font-semibold">▶ 現在</span>
                  )}
                </span>
              )}

              {/* アクション（本人 or ホスト）。改名は観覧者の自己にも許可、
                  スキップ/復帰はローテーション対象（非観覧者）のみ。 */}
              {!isEditing && canRename && (
                <span className="flex gap-1">
                  <MiniButton onClick={() => startRename(p.participantId, p.displayName)}>改名</MiniButton>
                  {p.role !== "viewer" &&
                    (isSkipping ? (
                      <MiniButton onClick={() => onResume(p.participantId)}>復帰</MiniButton>
                    ) : (
                      <MiniButton onClick={() => onSkip(p.participantId)}>スキップ</MiniButton>
                    ))}
                  {/* ホストは他の参加者を退出させられる（⑪） */}
                  {canHostAction && !isMine && onRemove && (
                    <MiniButton
                      onClick={() => onRemove(p.participantId)}
                      aria-label={`${p.displayName} を退出させる`}
                    >
                      外す
                    </MiniButton>
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
