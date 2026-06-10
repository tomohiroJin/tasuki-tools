/**
 * 在席一覧パネル
 * T057: FR-046,047,048,050,051,052,061 (US9)
 *
 * 全参加者の在席状況・現ドライバー・役割を常時一覧表示。
 * 代理追加・改名・スキップ/復帰操作を提供する。
 * 色＋テキスト併記（FR-032）。
 */

import React, { useState, useEffect, useRef } from "react";
import { Users } from "lucide-react";
import type { Participant } from "@tdd-mob/core";
import { MAX_DISPLAY_NAME } from "@tdd-mob/core/aggregate";
import { GhostButton, PrimaryButton, SectionHeader } from "../primitives.js";
import { presenceLabel, presenceDotClass, presenceTextClass } from "../presence.js";

/** 小さなダーク用ボタン。RosterPanel 内の改名/離脱/外す等のコンパクト操作用。
 * 行操作はサーバー往復で反映されるため、押下フィードバックが無いと「効いていない」ように見える。
 * クリック直後の短時間だけ「送信中」（disabled＋半透明）にし、効いた感の付与と二重送信防止を兼ねる。 */
function MiniButton({
  children,
  onClick,
  disabled,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) {
  const [pending, setPending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (e) => {
    onClick?.(e);
    setPending(true);
    timer.current = setTimeout(() => setPending(false), 450);
  };
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className="px-3 py-2 min-h-[44px] sm:min-h-[36px] shrink-0 whitespace-nowrap rounded-md text-xs font-medium text-[var(--bone-muted)] bg-[var(--panel-2)] hover:bg-[#252934] border border-[var(--hairline)] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-wait focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--signal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ink)]"
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
  /** ホストを当該参加者へ移譲する（host 限定・オンライン・自分以外のみ表示）。 */
  onTransferHost?: (participantId: string) => void;
  /** 自分のローテーション操作（一時離脱/復帰）を外部の自己トグルが担うか。
   *  true（Session）なら自分の行には一時離脱/復帰を出さず重複を避ける。
   *  false/未指定（Solo 等・自己トグル無し）なら自分の行にも出す。 */
  selfHasExternalToggle?: boolean;
}

export function RosterPanel({
  participants,
  currentDriverName,
  myParticipantId,
  canHostAction,
  selfHasExternalToggle = false,
  onRename,
  onSkip,
  onResume,
  onAddProxy,
  onRemove,
  onTransferHost,
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
        color="text-[var(--signal)]"
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
            maxLength={MAX_DISPLAY_NAME}
            className="flex-1 rounded-md border border-[var(--hairline-strong)] bg-[var(--panel-2)] px-3 py-2 text-sm text-[var(--bone)] outline-none focus:border-[var(--signal)] focus-visible:ring-2 focus-visible:ring-[var(--signal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ink)]"
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
              className={`rounded-md px-3 py-2 text-sm transition-colors ${
                isCurrentDriver
                  ? "bg-[rgba(255,74,46,0.12)] border border-[rgba(255,74,46,0.4)]"
                  : "bg-[var(--panel-2)] border border-[var(--hairline)]"
              }`}
            >
              {isEditing ? (
                /* 改名中は入力＋保存/キャンセルで行を専有する。 */
                <div className="flex w-full min-w-0 gap-1">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    aria-label={`${p.displayName} の新しい名前`}
                    maxLength={MAX_DISPLAY_NAME}
                    className="min-w-0 flex-1 rounded-md border border-[var(--hairline-strong)] bg-[var(--panel-2)] px-2 py-1 text-sm text-[var(--bone)] outline-none focus:border-[var(--signal)] focus-visible:ring-2 focus-visible:ring-[var(--signal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ink)]"
                  />
                  <MiniButton onClick={() => submitRename(p.participantId)}>保存</MiniButton>
                  <MiniButton onClick={() => setEditingId(null)}>取消</MiniButton>
                </div>
              ) : (
                <>
                  {/* 1段目: 在席ドット＋名前（最優先情報）。名前は省略せず全表示し、
                      長名は折り返してでも必ず見せる（バッジ/操作と幅を奪い合わせない）。 */}
                  <div className="flex items-start gap-2">
                    <span
                      className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${presenceDotClass(p.presence)}`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 font-medium text-[var(--bone)] break-words">
                      {p.displayName}
                    </span>
                  </div>

                  {/* 2段目: 在席/役割バッジ＋操作。チップは改行禁止で塊のまま折り返す（共通運命）。 */}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 pl-4 text-xs [&>span]:whitespace-nowrap">
                    <span className="sr-only">{presenceLabel(p.presence)}</span>
                    <span className={presenceTextClass(p.presence)}>
                      {presenceLabel(p.presence)}
                    </span>
                    {p.role === "host" && (
                      <span className="text-[var(--bone-muted)] font-semibold">主催者</span>
                    )}
                    {p.role === "viewer" && (
                      <span className="text-[var(--bone-subtle)]">観覧</span>
                    )}
                    {p.isPlaceholder && (
                      <span className="text-amber-300">代理</span>
                    )}
                    {isSkipping && (
                      <span className="text-[var(--bone-subtle)]">離脱中</span>
                    )}
                    {isCurrentDriver && (
                      <span className="text-[var(--signal)] font-semibold">▶ 現在</span>
                    )}

                    {/* アクション。改名は本人 or ホスト。一時離脱/復帰は driver.skip で、
                        自分の分は外部の自己トグルがあるなら出さず重複を避ける（#1）。他人分はホストのみ。
                        語は自己トグルと統一して「一時離脱」（状態バッジ「離脱中」とも整合）。右寄せ・塊で折返し。 */}
                    {canRename && (
                      <span className="ml-auto flex shrink-0 gap-1">
                        <MiniButton onClick={() => startRename(p.participantId, p.displayName)}>改名</MiniButton>
                        {/* 一時離脱/復帰の表示可否: 自分=外部トグルが無いときのみ／他人=ホストのみ。観覧者は対象外。 */}
                        {p.role !== "viewer" &&
                          (isMine ? !selfHasExternalToggle : canHostAction) &&
                          (isSkipping ? (
                            <MiniButton onClick={() => onResume(p.participantId)}>復帰</MiniButton>
                          ) : (
                            <MiniButton onClick={() => onSkip(p.participantId)}>一時離脱</MiniButton>
                          ))}
                        {/* ホストを他のオンライン参加者へ譲る（R2-3）。自分・オフライン・現ホストには出さない。 */}
                        {canHostAction && !isMine && p.role !== "host" && p.presence !== "offline" && onTransferHost && (
                          <MiniButton
                            onClick={() => onTransferHost(p.participantId)}
                            aria-label={`${p.displayName} にホストを譲る`}
                          >
                            ホストを譲る
                          </MiniButton>
                        )}
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
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
