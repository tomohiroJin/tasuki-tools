/**
 * 円形プログレス（参考デザイン準拠）
 * タイマーの残り時間を円弧で表す。中心に children（残り時間表示）を置く。
 * 通常は fuchsia→violet→cyan グラデ、残りわずか(warning)は赤＋発光。
 */

import React, { useMemo } from "react";

interface CircularProgressProps {
  /** 進捗 0-100（経過率） */
  progress: number;
  /** 残りわずか（緊急表示） */
  warning?: boolean;
  size?: number;
  strokeWidth?: number;
  children?: React.ReactNode;
}

export function CircularProgress({
  progress,
  warning = false,
  size = 280,
  strokeWidth = 14,
  children,
}: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.max(0, Math.min(100, progress)) / 100);
  // SVG グラデ id は要素ごとに一意にする（同一ページに複数置いても干渉しない）。
  const gradId = useMemo(
    () => `prog-grad-${Math.random().toString(36).slice(2, 8)}`,
    [],
  );

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="absolute inset-0 -rotate-90">
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#d946ef" />
            <stop offset="50%" stopColor="#a855f7" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={warning ? "#ef4444" : `url(#${gradId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-1000 ease-linear"
          style={{
            filter: warning ? "drop-shadow(0 0 8px rgba(239,68,68,0.6))" : "none",
          }}
        />
      </svg>
      <div className="relative z-10 flex flex-col items-center justify-center">
        {children}
      </div>
    </div>
  );
}
