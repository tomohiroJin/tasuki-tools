/**
 * 自分のドライバー状態と操作（2層モデル・D1）。
 *
 * 「一時離脱／復帰」(driver.skip/resume・順番を保持して一時的に飛ばす) と
 * 「列から外れる／ドライバーに加わる」(rotation の出入り・恒久) を併記し、
 * 「ちょっと抜ける」と「もう運転しない」を明確に分ける。
 * 自分の一時離脱はこのトグルが正本（参加者一覧では自分の行に重複表示しない）。
 */

import React from "react";
import { GhostButton, PrimaryButton } from "../primitives.js";

interface SelfDriverToggleProps {
  inRotation: boolean;
  /** 一時離脱中（driverEligible=false）。順番は保持され、復帰で戻れる。 */
  isSkipping: boolean;
  /** 列から外れられるか（最後の1人は外れられないため false）。 */
  canLeave: boolean;
  displayName: string;
  participantId: string;
  onJoin?: (displayName: string) => void;
  onLeave?: (displayName: string) => void;
  onSkip?: (participantId: string) => void;
  onResume?: (participantId: string) => void;
  /** ルームそのものから抜ける（自己退出・FR-079）。未指定なら導線を出さない。 */
  onLeaveRoom?: (participantId: string) => void;
}

export function SelfDriverToggle({
  inRotation,
  isSkipping,
  canLeave,
  displayName,
  participantId,
  onJoin,
  onLeave,
  onSkip,
  onResume,
  onLeaveRoom,
}: SelfDriverToggleProps) {
  /**
   * ルームから抜ける導線。自分の操作なので確認は課さない（FR-079）。
   * 他人向けの「退出させる」（RosterPanel）とは配置を分ける。誤タップで他人を巻き込む
   * 事故と、自分が抜けるだけの操作は取り返しのつき方が違う（FR-078）。
   */
  const leaveRoomButton = onLeaveRoom ? (
    <GhostButton
      onClick={() => onLeaveRoom(participantId)}
      className="text-xs px-3 py-1.5"
      title="この端末をルームから外します。招待から再参加できます。"
    >
      ルームから抜ける
    </GhostButton>
  ) : null;
  // rotation 外の場合は目立つ見学者バナーを表示（加入を促す）
  if (!inRotation) {
    return (
      <div className="mb-3 rounded-md border border-[var(--signal)] bg-[rgba(255,74,46,0.10)] px-3 py-3">
        <p className="text-sm font-semibold text-[var(--bone)]">あなたは見学中です</p>
        <p className="mt-0.5 text-xs text-[var(--bone-muted)]">
          交代の輪に入ると、ドライバーとして順番が回ってきます。
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <PrimaryButton onClick={() => onJoin?.(displayName)} className="text-sm px-4 py-2">
            ドライバーに加わる
          </PrimaryButton>
          {/* 見学中でも部屋からは抜けられる。ここに導線が無いと見学者が取り残される。 */}
          {leaveRoomButton}
        </div>
      </div>
    );
  }

  // rotation 内の場合は従来の状態表示＋操作ボタン
  const status = isSkipping ? (
    <span className="font-semibold text-amber-300">離脱中</span>
  ) : (
    <span className="font-semibold text-[var(--signal)]">ドライバー</span>
  );
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md bg-[var(--panel-2)] border border-[var(--hairline)] px-3 py-2">
      <span className="text-sm">あなた: {status}</span>
      <span className="flex flex-wrap items-center gap-1.5">
        {isSkipping && (
          <PrimaryButton onClick={() => onResume?.(participantId)} className="text-xs px-3 py-1.5">
            復帰
          </PrimaryButton>
        )}
        {!isSkipping && (
          <GhostButton onClick={() => onSkip?.(participantId)} className="text-xs px-3 py-1.5">
            一時離脱
          </GhostButton>
        )}
        <GhostButton
          onClick={() => onLeave?.(displayName)}
          disabled={!canLeave}
          title={canLeave ? undefined : "最後のドライバーは外れられません"}
          className="text-xs px-3 py-1.5"
        >
          列から外れる
        </GhostButton>
        {leaveRoomButton}
      </span>
    </div>
  );
}
