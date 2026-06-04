/**
 * クロノグラフ・ダイヤル（計器デザイン）
 * 残り時間を「計測弧」で表す精密計器の文字盤。盤面の外周に 60 目盛り（5 つおきに長い主目盛り）、
 * 内側にシグナル朱の経過弧を描く。中心に children（残り時間表示）を置く。
 * 通常は朱、残りわずか(warning)は赤＋強い発光。
 */

import React, { useState, useEffect } from "react";

interface CircularProgressProps {
  /** 進捗 0-100（経過率） */
  progress: number;
  /** 残りわずか（緊急表示） */
  warning?: boolean;
  /** 計測中（稼働中）。運針ピップの回転を駆動し、停止中は静止させる。 */
  running?: boolean;
  size?: number;
  strokeWidth?: number;
  children?: React.ReactNode;
}

/** 文字盤の 60 目盛り（i%5===0 を主目盛りとして長く・明るく描く）。
 * props（size/tickOuterR）が不変なら再描画不要なため memo 化し、稼働中の毎フレーム再生成を避ける。 */
const DialTicks = React.memo(function DialTicks({
  size,
  tickOuterR,
}: {
  size: number;
  tickOuterR: number;
}) {
  const cx = size / 2;
  const ticks: React.ReactNode[] = [];
  for (let i = 0; i < 60; i++) {
    const major = i % 5 === 0;
    const len = major ? 11 : 6;
    const theta = ((-90 + i * 6) * Math.PI) / 180; // 12 時位置を起点に時計回り
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const r2 = tickOuterR;
    const r1 = tickOuterR - len;
    ticks.push(
      <line
        key={i}
        x1={cx + r1 * cos}
        y1={cx + r1 * sin}
        x2={cx + r2 * cos}
        y2={cx + r2 * sin}
        stroke={major ? "var(--bone-muted)" : "var(--steel)"}
        strokeWidth={major ? 1.6 : 1}
        strokeLinecap="butt"
        opacity={major ? 0.85 : 0.5}
      />,
    );
  }
  return <g>{ticks}</g>;
});

export function CircularProgress({
  progress,
  warning = false,
  running = false,
  size = 280,
  strokeWidth = 14,
  children,
}: CircularProgressProps) {
  // 外周に目盛りリングを確保するため、弧の半径を内側へ寄せる。
  const tickOuterR = size / 2 - 3;
  const radius = tickOuterR - 18;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.max(0, Math.min(100, progress)) / 100);
  const arcColor = warning ? "var(--urgent)" : "var(--signal)";

  // 校正スイープ: マウント直後は弧を空（offset=円周）で 1 フレーム描き、その後に実値へ
  // 変えることで CSS transition が 0→現在値へ一掃する（電源投入時のキャリブレーション）。
  // useEffect（描画後に発火）で十分。rAF を使わないためテストの act 警告も避けられ、
  // prefers-reduced-motion 環境では transition 自体が無効化され一瞬で確定する。
  const [armed, setArmed] = useState(false);
  useEffect(() => setArmed(true), []);
  const shownOffset = armed ? offset : circumference;

  const cx = size / 2;
  const pipR = radius; // 運針ピップは弧の中心線上を周回する（中央の数字は覆わない）

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      {/* 目盛り盤（回転なし。12 時に主目盛りが来る） */}
      <svg width={size} height={size} className="absolute inset-0">
        <DialTicks size={size} tickOuterR={tickOuterR} />
      </svg>
      {/* 計測弧（12 時起点で時計回りに進めるため -90deg 回転） */}
      <svg width={size} height={size} className="absolute inset-0 -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(236,232,220,0.06)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={arcColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={shownOffset}
          className="transition-all duration-1000 ease-linear"
          style={{
            filter: warning
              ? "drop-shadow(0 0 10px rgba(255,53,42,0.7))"
              : "drop-shadow(0 0 6px var(--signal-glow))",
          }}
        />
      </svg>
      {/* 運針ピップ: 稼働中は rim を 60s/周で回り「計測している」生命感を出す。
          停止中は静止（animation-play-state）、reduced-motion では CSS 側で非表示。 */}
      <svg width={size} height={size} className="absolute inset-0" aria-hidden="true">
        <g
          className="chrono-hand"
          data-running={running ? "true" : "false"}
          style={{ transformOrigin: `${cx}px ${cx}px` }}
        >
          <circle
            cx={cx}
            cy={cx - pipR}
            r={size > 260 ? 3 : 2.4}
            fill={arcColor}
            style={{ filter: "drop-shadow(0 0 5px var(--signal-glow))" }}
          />
        </g>
      </svg>
      <div className="relative z-10 flex flex-col items-center justify-center">
        {children}
      </div>
    </div>
  );
}
