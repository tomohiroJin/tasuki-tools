import React from "react";
import { Info } from "lucide-react";

/** 空状態/初回の控えめな案内（R5-2）。calm UI: 装飾を抑え、テキストで導く。 */
export function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="note"
      className="flex items-start gap-2 rounded-md border border-dashed border-[var(--hairline-strong)] bg-[var(--panel-2)] px-3 py-2 text-xs text-[var(--bone-muted)]"
    >
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--bone-subtle)]" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}
