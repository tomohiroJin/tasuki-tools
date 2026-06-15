/**
 * セッション設定のローカル保存
 * T063: FR-053,054 (US10)
 *
 * 前回の設定（表示名・言語・難易度・メンバー・交代間隔）を
 * localStorage に保存し、再訪時に自動充填する。
 */

const PREFS_KEY = "tdd-mob:preferences:v1";

export interface SavedPreferences {
  displayName: string;
  language: string;
  difficulty: string;
  members: string[];
  intervalMinutes: number;
}

/** 設定を localStorage に保存する（FR-053） */
export function savePreferences(prefs: SavedPreferences): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

/** 保存済み設定を返す。未保存なら null（FR-054） */
export function loadPreferences(): SavedPreferences | null {
  const raw = localStorage.getItem(PREFS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SavedPreferences;
  } catch {
    return null;
  }
}

/** 設定を削除する */
export function clearPreferences(): void {
  localStorage.removeItem(PREFS_KEY);
}

/** ランダム対象にする言語プール（ホストローカル設定）。SessionConfig には載せない。 */
const RANDOM_LANG_POOL_KEY = "tdd-mob:random-language-pool:v1";

/** 既定の言語プール（常用5言語）。未保存・破損時のフォールバックにも使う。 */
export const DEFAULT_RANDOM_LANGUAGE_POOL: string[] = [
  "TypeScript", "JavaScript", "Python", "Go", "Java",
];

/** 言語プールを localStorage に保存する。空配列も許容する。 */
export function saveRandomLanguagePool(pool: string[]): void {
  localStorage.setItem(RANDOM_LANG_POOL_KEY, JSON.stringify(pool));
}

/** 言語プールを返す。未保存・破損なら既定プールのコピーを返す。 */
export function loadRandomLanguagePool(): string[] {
  const raw = localStorage.getItem(RANDOM_LANG_POOL_KEY);
  if (raw === null) return [...DEFAULT_RANDOM_LANGUAGE_POOL];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
      return parsed as string[];
    }
    return [...DEFAULT_RANDOM_LANGUAGE_POOL];
  } catch {
    return [...DEFAULT_RANDOM_LANGUAGE_POOL];
  }
}
