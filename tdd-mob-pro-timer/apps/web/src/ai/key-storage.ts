/**
 * BYOK 鍵の保存・読込・削除
 * T053: FR-017 (US4)
 *
 * 既定: sessionStorage（タブを閉じると消える）
 * オプトイン: localStorage（明示的な永続化同意後）
 *
 * 鍵はサーバーへ送信しない。いかなる WS メッセージにも含めない。
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
