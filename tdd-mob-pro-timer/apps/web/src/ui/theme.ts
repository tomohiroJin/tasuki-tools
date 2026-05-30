/**
 * テーマ（ライト/ダーク）解決と適用
 * 優先順位: 手動保存値 > システム設定（prefers-color-scheme）
 */

export type Theme = "light" | "dark";

const STORAGE_KEY = "theme";

/**
 * 初期テーマを決定する純粋関数。
 * @param stored localStorage の保存値（未設定なら null）
 * @param prefersDark システムがダークを好むか
 */
export function resolveInitialTheme(
  stored: string | null,
  prefersDark: boolean,
): Theme {
  if (stored === "dark" || stored === "light") return stored;
  return prefersDark ? "dark" : "light";
}

/** 現在の環境から初期テーマを取得する */
export function getInitialTheme(): Theme {
  const stored =
    typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
  const prefersDark =
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-color-scheme: dark)").matches;
  return resolveInitialTheme(stored, prefersDark);
}

/** テーマを DOM に適用し、保存する */
export function applyTheme(theme: Theme): void {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", theme);
  }
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(STORAGE_KEY, theme);
  }
}
