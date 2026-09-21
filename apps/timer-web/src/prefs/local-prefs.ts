/**
 * timer の端末ローカル設定（言語プール・交代通知・ヒント既読）。
 *
 * **セッション設定の保存（`SavedPreferences` / `savePreferences` / `loadPreferences` /
 * `clearPreferences`・鍵 `tdd-mob:preferences:v1`）は #272 で畳んだ。** 唯一の呼び手
 * だった timer の旧入口（`Setup.tsx` / `Join.tsx`）を #95 S5c（#249）で撤去し、
 * 保存された値を読む画面がどこにも無くなったためである。要求（FR-053 / FR-054
 * 「再訪時に前回の設定を既定として自動提示する」）は timer からは降ろし、
 * **玄関（`apps/landing`）側の要求として別 Issue へ預けた**
 * （`docs/plans/tdd-mob-pro-timer-v2-experience/spec.md` の FR-053 / FR-054 の注記）。
 * **移管先は #284 で確定した** —— 範囲は表示名だけで、鍵は `tasuki:display-name`
 * （`packages/sync-client/src/resume-identity.ts`）。**旧鍵 `tdd-mob:preferences:v1` は
 * 玄関が落とす**ので、この鍵はもうどこからも書かれない。
 *
 * ここに残る 3 つは**生きている**（`ProblemConfigPanel` / `Lobby` / `Session` などが
 * 読み書きする）。
 */

/** ランダム対象にする言語プール（この端末のローカル設定）。SessionConfig には載せない。 */
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
  /** 交代前カウントダウンの方式。既定 "tone"（Issue #5）。 */
  countdownMode: "tone" | "voice";
  /** 音声読み上げ選択時に使う話者。既定 "voice-male"（Issue #5）。 */
  countdownVoiceId: "voice-male" | "voice-female";
}

export const DEFAULT_NOTIFY_PREFERENCES: NotifyPreferences = {
  enabled: false,
  soundId: "department",
  osNotify: true,
  volume: 0.6,
  countdownEnabled: false,
  countdownSeconds: 15,
  countdownMode: "tone",
  countdownVoiceId: "voice-male",
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
      countdownMode: parsed.countdownMode === "tone" || parsed.countdownMode === "voice" ? parsed.countdownMode : DEFAULT_NOTIFY_PREFERENCES.countdownMode,
      countdownVoiceId: parsed.countdownVoiceId === "voice-male" || parsed.countdownVoiceId === "voice-female" ? parsed.countdownVoiceId : DEFAULT_NOTIFY_PREFERENCES.countdownVoiceId,
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
