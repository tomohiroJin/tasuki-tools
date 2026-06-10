/**
 * アクセシブルなタブ（WAI-ARIA Tabs パターン）。
 * tablist/tab/tabpanel・aria-selected・左右矢印で移動・選択タブのみ tabIndex=0。
 * オプションを増やしても items を足すだけで拡張できる（v2.2 Epic 1・拡張前提）。
 */
import React, { useId, useState } from "react";

export interface TabItem {
  id: string;
  label: string;
  content: React.ReactNode;
}

interface TabsProps {
  items: TabItem[];
  ariaLabel: string;
  defaultTabId?: string;
}

export function Tabs({ items, ariaLabel, defaultTabId }: TabsProps) {
  const baseId = useId();
  const [active, setActive] = useState(defaultTabId ?? items[0]?.id);

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const dir = e.key === "ArrowRight" ? 1 : -1;
    const next = items[(index + dir + items.length) % items.length];
    if (next) {
      setActive(next.id);
      // focus follows selection（WAI-ARIA automatic activation）。次タブのボタンへ
      // 実フォーカスも移す。要素は常時描画済みなので id で取得して focus できる。
      document.getElementById(`${baseId}-tab-${next.id}`)?.focus();
    }
  };

  return (
    <div>
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="flex gap-1 border-b border-[var(--hairline)] mb-4"
      >
        {items.map((it, i) => {
          const selected = it.id === active;
          return (
            <button
              key={it.id}
              role="tab"
              type="button"
              id={`${baseId}-tab-${it.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${it.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(it.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={`px-4 py-2 text-sm font-semibold rounded-t-md -mb-px border-b-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--signal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ink)] ${
                selected
                  ? "border-[var(--signal)] text-[var(--bone)]"
                  : "border-transparent text-[var(--bone-subtle)] hover:text-[var(--bone-muted)]"
              }`}
            >
              {it.label}
            </button>
          );
        })}
      </div>
      {items.map((it) => (
        <div
          key={it.id}
          role="tabpanel"
          id={`${baseId}-panel-${it.id}`}
          aria-labelledby={`${baseId}-tab-${it.id}`}
          hidden={it.id !== active}
        >
          {it.id === active ? it.content : null}
        </div>
      ))}
    </div>
  );
}
