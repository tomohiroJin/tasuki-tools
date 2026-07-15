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

/** 交代通知の個人設定（ルーム設定 assertiveSwitch とは独立した自分のデバイス設定）。 */
const NOTIFY_KEY = "tdd-mob:notify:v1";

export interface NotifyPreferences {
  /** 通知（音・振動・OS通知）を有効にするか。既定 false。 */
  enabled: boolean;
  /** 選択中のチャイム ID（platform/sound.ts の CHIMES に対応）。 */
  soundId: string;
  /** タブが隠れている時に OS 通知も出すか。enabled 時のみ意味を持つ。 */
  osNotify: boolean;
  /** 通知音の音量（0–1）。既定 0.6。 */
  volume: number;
  /** 交代前カウントダウン予告音を鳴らすか。既定 false（Issue #2）。 */
  countdownEnabled: boolean;
  /** カウントダウンを開始する残り秒数のしきい値（5〜15）。既定 15（Issue #2）。 */
  countdownSeconds: number;
}

export const DEFAULT_NOTIFY_PREFERENCES: NotifyPreferences = {
  enabled: false,
  soundId: "department",
  osNotify: true,
  volume: 0.6,
  countdownEnabled: false,
  countdownSeconds: 15,
};

/** 通知設定の変更を同一タブの購読者へ知らせるイベント名。
 *  storage イベントは別タブにしか飛ばないため、同一タブ内の即時反映にはこれを使う。 */
export const NOTIFY_CHANGED_EVENT = "tdd-mob:notify-changed";

/** 通知設定を保存する。保存後、同一タブの購読者へ変更イベントを発行する。 */
export function saveNotifyPreferences(prefs: NotifyPreferences): void {
  localStorage.setItem(NOTIFY_KEY, JSON.stringify(prefs));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(NOTIFY_CHANGED_EVENT));
  }
}

/** 通知設定を返す。未保存・破損・欠損は既定で補完する。 */
export function loadNotifyPreferences(): NotifyPreferences {
  const raw = localStorage.getItem(NOTIFY_KEY);
  if (raw === null) return { ...DEFAULT_NOTIFY_PREFERENCES };
  try {
    const parsed = JSON.parse(raw) as Partial<NotifyPreferences>;
    return {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : DEFAULT_NOTIFY_PREFERENCES.enabled,
      soundId: typeof parsed.soundId === "string" ? parsed.soundId : DEFAULT_NOTIFY_PREFERENCES.soundId,
      osNotify: typeof parsed.osNotify === "boolean" ? parsed.osNotify : DEFAULT_NOTIFY_PREFERENCES.osNotify,
      volume: typeof parsed.volume === "number" ? parsed.volume : DEFAULT_NOTIFY_PREFERENCES.volume,
      countdownEnabled: typeof parsed.countdownEnabled === "boolean" ? parsed.countdownEnabled : DEFAULT_NOTIFY_PREFERENCES.countdownEnabled,
      countdownSeconds: typeof parsed.countdownSeconds === "number" ? parsed.countdownSeconds : DEFAULT_NOTIFY_PREFERENCES.countdownSeconds,
    };
  } catch {
    return { ...DEFAULT_NOTIFY_PREFERENCES };
  }
}

/** 通知ヒントを表示済みか（初回案内の抑制）。 */
const NOTIFY_HINT_KEY = "tdd-mob:notify-hint-seen:v1";
export function loadNotifyHintSeen(): boolean {
  return localStorage.getItem(NOTIFY_HINT_KEY) === "1";
}
export function saveNotifyHintSeen(): void {
  localStorage.setItem(NOTIFY_HINT_KEY, "1");
}
