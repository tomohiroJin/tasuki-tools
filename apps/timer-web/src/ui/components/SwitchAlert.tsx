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
      className={reducedMotion ? "switch-alert" : "switch-alert animate-pop-in"}
    >
      <div className="instrument-label switch-alert-label">ドライバー交代</div>
      <div
        className={reducedMotion ? "switch-alert-driver" : "switch-alert-driver animate-fade-up"}
      >
        <Crown className="switch-alert-crown" aria-hidden="true" />
        {driverName}
      </div>
      <p className="switch-alert-hint">画面をタップで閉じる</p>
    </div>
  );
}
