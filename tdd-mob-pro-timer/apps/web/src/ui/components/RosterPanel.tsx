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
import { presenceLabel, presenceDotClass } from "../presence.js";

interface RosterPanelProps {
  participants: Participant[];
  currentDriverIndex: number;
  myParticipantId: string;
  canHostAction: boolean;
  onRename: (participantId: string, displayName: string) => void;
  onSkip: (participantId: string) => void;
  onResume: (participantId: string) => void;
  onAddProxy: (displayName: string) => void;
}

export function RosterPanel({
  participants,
  currentDriverIndex,
  myParticipantId,
  canHostAction,
  onRename,
  onSkip,
  onResume,
  onAddProxy,
}: RosterPanelProps) {
  const [proxyName, setProxyName] = useState("");
  const [showProxyInput, setShowProxyInput] = useState(false);

  const handleAddProxy = () => {
    if (!proxyName.trim()) return;
    onAddProxy(proxyName.trim());
    setProxyName("");
    setShowProxyInput(false);
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
        {participants.map((p, idx) => {
          const isCurrentDriver = idx === currentDriverIndex;
          const isMine = p.participantId === myParticipantId;
          const isSkipping = p.driverEligible === false;

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

              {/* 名前 */}
              <span className="flex-1 text-fg">{p.displayName}</span>

              {/* バッジ */}
              <span className="flex items-center gap-1 text-xs">
                <span className="sr-only">{presenceLabel(p.presence)}</span>
                <span className={presenceDotClass(p.presence).replace("bg-", "text-").replace("rounded-full", "").trim()}>
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

              {/* アクション（本人 or ホスト） */}
              {(isMine || canHostAction) && p.role !== "viewer" && (
                <span className="flex gap-1">
                  {isSkipping ? (
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
