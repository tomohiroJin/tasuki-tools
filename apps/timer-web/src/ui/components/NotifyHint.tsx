/** 初回セッション開始時の通知案内（一度だけ表示）。 */
import React from "react";
import { Bell, X } from "lucide-react";

interface NotifyHintProps { onDismiss: () => void; }

export function NotifyHint({ onDismiss }: NotifyHintProps) {
  return (
    <div role="status" className="mb-3 flex items-start gap-2 rounded-md border border-[var(--signal)] bg-[var(--signal-tint)] px-3 py-2 text-sm text-[var(--bone)]">
      <Bell className="mt-0.5 h-4 w-4 shrink-0 text-[var(--signal)]" aria-hidden="true" />
      <span className="flex-1">交代を音で知らせられます。ステータス上部の「🔔 通知」から ON にできます。</span>
      <button type="button" aria-label="閉じる" onClick={onDismiss} className="shrink-0 text-[var(--bone-muted)] hover:text-[var(--bone)]">
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
