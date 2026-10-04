import React from "react";
import { Info } from "lucide-react";

/** 空状態/初回の控えめな案内（R5-2）。calm UI: 装飾を抑え、テキストで導く。 */
export function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="note"
      className="empty-hint"
    >
      <Info className="empty-hint-icon" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}
