/**
 * 在席一覧パネル
 * T057: FR-046,047,048,050,051,052,061 (US9)
 *
 * 全参加者の在席状況・現ドライバー・役割を常時一覧表示。
 * 代理追加・改名・スキップ/復帰操作を提供する。
 * 色＋テキスト併記（FR-032）。
 */

import React, { useState } from "react";
import type { Participant } from "@tdd-mob/core";
import { Button } from "./Button.js";
import { presenceLabel, presenceDotClass, presenceTextClass } from "../presence.js";

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

  const rotation = participants.filter(
    (p) => !p.isPlaceholder && p.driverEligible !== false && p.role !== "viewer",
  );

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-fg-subtle">参加者</h3>
        {canHostAction && (
          <Button
            intent="neutral"
            size="sm"
            onClick={() => setShowProxyInput((v) => !v)}
            aria-label="代理参加者を追加"
          >
            代理追加
          </Button>
        )}
      </div>

      {/* 代理追加フォーム */}
      {showProxyInput && (
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={proxyName}
            onChange={(e) => setProxyName(e.target.value)}
            placeholder="Web 非接続のメンバー名"
            aria-label="代理参加者の名前"
            className="flex-1 rounded-md border border-line bg-surface px-2 py-1 text-sm text-fg"
          />
          <Button intent="primary" size="sm" onClick={handleAddProxy}>追加</Button>
        </div>
      )}

      <ul className="flex flex-col gap-1">
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
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm ${
                isCurrentDriver
                  ? "bg-primary/10 border border-primary/30"
                  : "bg-surface"
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
                    className="flex-1 rounded-md border border-line bg-surface px-2 py-0.5 text-sm text-fg"
                  />
                  <Button intent="primary" size="sm" onClick={() => submitRename(p.participantId)}>
                    保存
                  </Button>
                  <Button intent="neutral" size="sm" onClick={() => setEditingId(null)}>
                    取消
                  </Button>
                </span>
              ) : (
                <span className="flex-1 text-fg">{p.displayName}</span>
              )}

              {/* バッジ（改名中は隠す） */}
              {!isEditing && (
              <span className="flex items-center gap-1 text-xs">
                <span className="sr-only">{presenceLabel(p.presence)}</span>
                <span className={presenceTextClass(p.presence)}>
                  {presenceLabel(p.presence)}
                </span>

                {p.role === "host" && (
                  <span className="text-primary font-semibold">主催者</span>
                )}
                {p.role === "viewer" && (
                  <span className="text-fg-subtle">観覧 (viewer)</span>
                )}
                {p.isPlaceholder && (
                  <span className="text-warning">代理 (Proxy)</span>
                )}
                {isSkipping && (
                  <span className="text-fg-subtle">離脱中 (skip)</span>
                )}
                {isCurrentDriver && (
                  <span className="text-primary font-semibold">▶ 現在</span>
                )}
              </span>
              )}

              {/* アクション（本人 or ホスト）。改名は観覧者の自己にも許可、
                  スキップ/復帰はローテーション対象（非観覧者）のみ。 */}
              {!isEditing && canRename && (
                <span className="flex gap-1">
                  <Button
                    intent="neutral"
                    size="sm"
                    onClick={() => startRename(p.participantId, p.displayName)}
                  >
                    改名
                  </Button>
                  {p.role !== "viewer" &&
                    (isSkipping ? (
                      <Button
                        intent="neutral"
                        size="sm"
                        onClick={() => onResume(p.participantId)}
                      >
                        復帰
                      </Button>
                    ) : (
                      <Button
                        intent="neutral"
                        size="sm"
                        onClick={() => onSkip(p.participantId)}
                      >
                        スキップ
                      </Button>
                    ))}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
