/**
 * チームの円周配置（参考デザイン準拠）
 * メンバーをアバター（頭文字）として円周に並べ、現ドライバーをシグナル朱＋Crown で強調、
 * 次ドライバーを朱の枠線で示す。中心に children（タイマー）を置く。計器の周回目盛りの趣。
 */

import React from "react";
import { Crown } from "lucide-react";
import type { RotationMember } from "../rotation-names.js";

interface TeamOrbitProps {
  /** 表示順のメンバー（rotation・識別子＋表示名）。
   *  表示名は同名で衝突しうるため、React の key には識別子を使う。 */
  members: RotationMember[];
  /** 現ドライバーの index */
  currentIndex: number;
  size?: number;
  children?: React.ReactNode;
}

export function TeamOrbit({ members, currentIndex, size = 340, children }: TeamOrbitProps) {
  const center = size / 2;
  const avatarSize = 44;
  const orbitRadius = size / 2 - avatarSize / 2 - 6;
  const len = members.length;
  const nextIdx = len > 0 ? (currentIndex + 1) % len : 0;

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0" aria-hidden="true">
        <circle
          cx={center}
          cy={center}
          r={orbitRadius}
          fill="none"
          stroke="var(--hairline-strong)"
          strokeWidth="1"
          strokeDasharray="2 7"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
      {/* 1 人だけのときは周回アバターを出さない（文字盤 12 時上に孤立した点が乗るのを避ける）。
          現ドライバーは中央の Crown＋名前で十分に伝わる。複数人で初めて周回を可視化する。 */}
      {len > 1 && members.map(({ participantId, displayName, label }, i) => {
        const angle = (i / len) * 2 * Math.PI - Math.PI / 2;
        const x = center + Math.cos(angle) * orbitRadius;
        const y = center + Math.sin(angle) * orbitRadius;
        const isCurrent = i === currentIndex;
        const isNext = i === nextIdx;
        return (
          <div
            key={participantId}
            className={`absolute flex items-center justify-center rounded-full font-bold text-sm tabular transition-all duration-700 animate-pop-in ${
              isCurrent
                ? "bg-[var(--signal)] text-[var(--on-signal)] scale-125 shadow-[0_0_0_2px_var(--signal-edge),0_6px_18px_var(--signal-glow)] z-20"
                : isNext
                  ? "bg-[var(--panel-2)] text-[var(--bone)] border-2 border-[var(--signal-edge)] z-10"
                  : "bg-[var(--panel-2)] text-[var(--bone-subtle)] border border-[var(--hairline-strong)]"
            }`}
            style={{
              width: avatarSize,
              height: avatarSize,
              left: x - avatarSize / 2,
              top: y - avatarSize / 2,
            }}
            title={label}
          >
            {isCurrent && (
              <Crown className="w-3.5 h-3.5 absolute -top-2 -right-1 text-[var(--on-signal)] drop-shadow rotate-12" />
            )}
            <span className="select-none">{displayName.charAt(0).toUpperCase()}</span>
          </div>
        );
      })}
    </div>
  );
}
