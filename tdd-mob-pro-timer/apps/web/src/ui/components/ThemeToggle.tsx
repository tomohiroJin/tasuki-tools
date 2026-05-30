/**
 * テーマ切替トグル（ライト/ダーク）
 */

import React, { useEffect, useState } from "react";
import { getInitialTheme, applyTheme, type Theme } from "../theme.js";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggle = () => setTheme((t) => (t === "dark" ? "light" : "dark"));
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "ライトモードに切り替え" : "ダークモードに切り替え"}
      aria-pressed={isDark}
      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md
        border border-line bg-surface text-fg
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
        focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
    >
      <span aria-hidden="true">{isDark ? "☀️" : "🌙"}</span>
    </button>
  );
}
