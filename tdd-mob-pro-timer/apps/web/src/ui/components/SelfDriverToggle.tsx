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
}: SelfDriverToggleProps) {
  const status = !inRotation ? (
    <span className="text-[var(--bone-subtle)]">見学中</span>
  ) : isSkipping ? (
    <span className="font-semibold text-amber-300">離脱中</span>
  ) : (
    <span className="font-semibold text-[var(--signal)]">ドライバー</span>
  );
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md bg-[var(--panel-2)] border border-[var(--hairline)] px-3 py-2">
      <span className="text-sm">あなた: {status}</span>
      <span className="flex flex-wrap items-center gap-1.5">
        {!inRotation && (
          <PrimaryButton onClick={() => onJoin?.(displayName)} className="text-xs px-3 py-1.5">
            ドライバーに加わる
          </PrimaryButton>
        )}
        {inRotation && isSkipping && (
          <PrimaryButton onClick={() => onResume?.(participantId)} className="text-xs px-3 py-1.5">
            復帰
          </PrimaryButton>
        )}
        {inRotation && !isSkipping && (
          <GhostButton onClick={() => onSkip?.(participantId)} className="text-xs px-3 py-1.5">
            一時離脱
          </GhostButton>
        )}
        {inRotation && (
          <GhostButton
            onClick={() => onLeave?.(displayName)}
            disabled={!canLeave}
            title={canLeave ? undefined : "最後のドライバーは外れられません"}
            className="text-xs px-3 py-1.5"
          >
            列から外れる
          </GhostButton>
        )}
      </span>
    </div>
  );
}
