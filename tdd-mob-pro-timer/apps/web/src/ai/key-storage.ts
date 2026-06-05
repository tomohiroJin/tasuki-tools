/**
 * BYOK 鍵の保存・読込・削除
 * T053: FR-017 (US4)
 *
 * 既定: sessionStorage（タブを閉じると消える）
 * オプトイン: localStorage（明示的な永続化同意後）
 *
 * 鍵はサーバーへ送信しない。いかなる WS メッセージにも含めない。
 *
 * ⚠ セキュリティ注記（2026-06-05 監査）:
 * 現状この BYOK 一式（key-storage / byok / AiSettingsModal）は **live tree から未参照の
 * 休眠コード**（AI 機能は UI から撤去済み・App は NoAiProvider のみ使用）。テスト維持のため残置。
 * localStorage 永続化（persistent=true）は XSS で漏洩しうる secret 保存経路のため、
 * 再有効化する場合も既定は sessionStorage を維持し、localStorage はユーザの明示同意時のみに限ること。
 */

export const API_KEY_SESSION_STORAGE_KEY = "tdd-mob:ai-key:session";
export const API_KEY_LOCAL_STORAGE_KEY = "tdd-mob:ai-key:local";

/**
 * API キーを保存する。
 * @param key 保存するキー文字列
 * @param persistent true のときのみ localStorage（XSS リスクあり）
 */
export function saveApiKey(key: string, persistent: boolean): void {
  if (persistent) {
    localStorage.setItem(API_KEY_LOCAL_STORAGE_KEY, key);
  } else {
    sessionStorage.setItem(API_KEY_SESSION_STORAGE_KEY, key);
  }
}

/**
 * 保存済み API キーを返す。sessionStorage 優先。
 * どちらにも無ければ null。
 */
export function loadApiKey(): string | null {
  return (
    sessionStorage.getItem(API_KEY_SESSION_STORAGE_KEY) ??
    localStorage.getItem(API_KEY_LOCAL_STORAGE_KEY)
  );
}

/**
 * 両方のストレージから鍵を削除する。
 */
export function clearApiKey(): void {
  sessionStorage.removeItem(API_KEY_SESSION_STORAGE_KEY);
  localStorage.removeItem(API_KEY_LOCAL_STORAGE_KEY);
}
