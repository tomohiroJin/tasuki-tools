/**
 * 強い交代通知の全画面オーバーレイ（§9.1 assertiveSwitch）
 *
 * 交代の瞬間に画面全体へ割り込み、新ドライバーを大きく提示する。
 * prefers-reduced-motion 時はアニメーションを外した控えめ版にする（§10.4）。
 */

import React from "react";
import { Crown } from "lucide-react";

interface SwitchAlertProps {
  driverName: string;
  reducedMotion: boolean;
  onDismiss: () => void;
}

export function SwitchAlert({ driverName, reducedMotion, onDismiss }: SwitchAlertProps) {
  return (
    <div
      role="alertdialog"
      aria-label="ドライバー交代通知"
      data-reduced-motion={reducedMotion ? "true" : "false"}
      onClick={onDismiss}
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-sm cursor-pointer ${
        reducedMotion ? "" : "animate-pop-in"
      }`}
    >
      <div className="text-sm uppercase tracking-widest text-white/60 mb-3">ドライバー交代</div>
      <div
        className={`flex items-center gap-4 text-5xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-orange-400 ${
          reducedMotion ? "" : "animate-fade-up"
        }`}
      >
        <Crown className="w-12 h-12 md:w-16 md:h-16 text-amber-400 shrink-0" aria-hidden="true" />
        {driverName}
      </div>
      <p className="mt-8 text-white/60 text-sm">画面をタップで閉じる</p>
    </div>
  );
}
