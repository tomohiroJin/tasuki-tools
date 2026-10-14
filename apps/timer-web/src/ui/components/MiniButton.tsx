/**
 * 小さなダーク用ボタン（#370 で `RosterPanel.tsx` から分けた。中身は変えていない）。
 */
import React, { useEffect, useRef, useState } from "react";

/** 小さなダーク用ボタン。RosterPanel 内の改名/離脱/外す等のコンパクト操作用。
 * 行操作はサーバー往復で反映されるため、押下フィードバックが無いと「効いていない」ように見える。
 * クリック直後の短時間だけ「送信中」（disabled＋半透明）にし、効いた感の付与と二重送信防止を兼ねる。 */
export function MiniButton({
  children,
  onClick,
  disabled,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) {
  const [pending, setPending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (e) => {
    onClick?.(e);
    setPending(true);
    timer.current = setTimeout(() => setPending(false), 450);
  };
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className="roster-panel-mini-button"
      {...rest}
    >
      {children}
    </button>
  );
}

