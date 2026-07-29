import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  loadNotifyPreferences,
  saveNotifyPreferences,
  DEFAULT_NOTIFY_PREFERENCES,
} from "../../src/prefs/local-prefs.js";
import type { NotifyPreferences } from "../../src/prefs/local-prefs.js";

describe("通知設定の永続化", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("未保存なら既定（enabled=false）を返す", () => {
    expect(loadNotifyPreferences()).toEqual(DEFAULT_NOTIFY_PREFERENCES);
    expect(loadNotifyPreferences().enabled).toBe(false);
  });

  it("保存して読み戻せる", () => {
    // Given
    const prefs: NotifyPreferences = {
      enabled: true, soundId: "bell", osNotify: false, volume: 0.5,
      countdownEnabled: false, countdownSeconds: 15, countdownMode: "tone" as const, countdownVoiceId: "voice-male",
    };
    // When
    saveNotifyPreferences(prefs);
    // Then
    expect(loadNotifyPreferences()).toEqual(prefs);
  });

  it("破損データは既定にフォールバックする", () => {
    localStorage.setItem("tdd-mob:notify:v1", "{not json");
    expect(loadNotifyPreferences()).toEqual(DEFAULT_NOTIFY_PREFERENCES);
  });

  it("欠損フィールドは既定で補完する", () => {
    // Given
    localStorage.setItem("tdd-mob:notify:v1", JSON.stringify({ enabled: true }));
    // When
    const p = loadNotifyPreferences();
    // Then
    expect(p.enabled).toBe(true);
    expect(p.soundId).toBe(DEFAULT_NOTIFY_PREFERENCES.soundId);
    expect(p.osNotify).toBe(DEFAULT_NOTIFY_PREFERENCES.osNotify);
  });

  it("volume の既定は 0.6（未保存時）", () => {
    expect(loadNotifyPreferences().volume).toBe(0.6);
  });

  it("volume を保存して読み戻せる", () => {
    // Given
    const prefs: NotifyPreferences = {
      enabled: true, soundId: "bell", osNotify: false, volume: 0.3,
      countdownEnabled: false, countdownSeconds: 15, countdownMode: "tone" as const, countdownVoiceId: "voice-male",
    };
    // When
    saveNotifyPreferences(prefs);
    // Then
    expect(loadNotifyPreferences().volume).toBe(0.3);
  });

  it("旧データ（volume 欠損）は既定 0.6 で補完する", () => {
    // Given
    localStorage.setItem("tdd-mob:notify:v1", JSON.stringify({ enabled: true, soundId: "bell", osNotify: true }));
    // Then
    expect(loadNotifyPreferences().volume).toBe(0.6);
  });

  it("既定 soundId は department", () => {
    expect(DEFAULT_NOTIFY_PREFERENCES.soundId).toBe("department");
  });

  it("countdownEnabled の既定は false", () => {
    expect(loadNotifyPreferences().countdownEnabled).toBe(false);
  });

  it("countdownSeconds の既定は 15", () => {
    expect(loadNotifyPreferences().countdownSeconds).toBe(15);
  });

  it("countdownEnabled/countdownSeconds を保存して読み戻せる", () => {
    // Given
    saveNotifyPreferences({
      enabled: true, soundId: "bell", osNotify: false, volume: 0.5,
      countdownEnabled: true, countdownSeconds: 10, countdownMode: "tone", countdownVoiceId: "voice-male",
    });
    // When
    const p = loadNotifyPreferences();
    // Then
    expect(p.countdownEnabled).toBe(true);
    expect(p.countdownSeconds).toBe(10);
  });

  it("欠損フィールド（countdown系）は既定で補完する", () => {
    // Given
    localStorage.setItem(
      "tdd-mob:notify:v1",
      JSON.stringify({ enabled: true, soundId: "bell", osNotify: true, volume: 0.5 }),
    );
    // When
    const p = loadNotifyPreferences();
    // Then
    expect(p.countdownEnabled).toBe(false);
    expect(p.countdownSeconds).toBe(15);
  });
});
