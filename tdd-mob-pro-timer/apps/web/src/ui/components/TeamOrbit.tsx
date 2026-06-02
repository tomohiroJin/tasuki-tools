/**
 * チームの円周配置（参考デザイン準拠）
 * メンバーをアバター（頭文字）として円周に並べ、現ドライバーを amber グラデ＋Crown で強調、
 * 次ドライバーを枠線で示す。中心に children（タイマー）を置く。
 */

import React from "react";
import { Crown } from "lucide-react";

interface TeamOrbitProps {
  /** 表示順のメンバー名（rotation） */
  members: string[];
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
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="1"
          strokeDasharray="4 6"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
      {members.map((name, i) => {
        const angle = (i / len) * 2 * Math.PI - Math.PI / 2;
        const x = center + Math.cos(angle) * orbitRadius;
        const y = center + Math.sin(angle) * orbitRadius;
        const isCurrent = i === currentIndex;
        const isNext = i === nextIdx;
        return (
          <div
            key={name}
            className={`absolute flex items-center justify-center rounded-full font-bold text-sm transition-all duration-700 animate-pop-in ${
              isCurrent
                ? "bg-gradient-to-br from-amber-300 to-orange-500 text-black scale-125 shadow-lg shadow-amber-400/60 z-20"
                : isNext
                  ? "bg-white/15 text-white border-2 border-amber-400/60 z-10"
                  : "bg-white/10 text-white/60 border border-white/15"
            }`}
            style={{
              width: avatarSize,
              height: avatarSize,
              left: x - avatarSize / 2,
              top: y - avatarSize / 2,
            }}
            title={name}
          >
            {isCurrent && (
              <Crown className="w-3.5 h-3.5 absolute -top-2 -right-1 text-amber-200 drop-shadow rotate-12" />
            )}
            <span className="select-none">{name.charAt(0).toUpperCase()}</span>
          </div>
        );
      })}
    </div>
  );
}
