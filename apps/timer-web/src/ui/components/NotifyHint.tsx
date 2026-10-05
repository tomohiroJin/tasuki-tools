/** 初回セッション開始時の通知案内（一度だけ表示）。 */
import React from "react";
import { Bell, X } from "lucide-react";

interface NotifyHintProps { onDismiss: () => void; }

export function NotifyHint({ onDismiss }: NotifyHintProps) {
  return (
    <div role="status" className="notify-hint">
      <Bell className="notify-hint-icon" aria-hidden="true" />
      <span className="notify-hint-text">交代を音で知らせられます。ステータス上部の「🔔 通知」から ON にできます。</span>
      <button type="button" aria-label="閉じる" onClick={onDismiss} className="notify-hint-close">
        <X className="notify-hint-close-icon" aria-hidden="true" />
      </button>
    </div>
  );
}
