import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  loadNotifyPreferences,
  saveNotifyPreferences,
  DEFAULT_NOTIFY_PREFERENCES,
} from "../../src/prefs/local-prefs.js";

describe("通知設定の永続化", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("未保存なら既定（enabled=false）を返す", () => {
    expect(loadNotifyPreferences()).toEqual(DEFAULT_NOTIFY_PREFERENCES);
    expect(loadNotifyPreferences().enabled).toBe(false);
  });

  it("保存して読み戻せる", () => {
    saveNotifyPreferences({ enabled: true, soundId: "bell", osNotify: false });
    expect(loadNotifyPreferences()).toEqual({ enabled: true, soundId: "bell", osNotify: false });
  });

  it("破損データは既定にフォールバックする", () => {
    localStorage.setItem("tdd-mob:notify:v1", "{not json");
    expect(loadNotifyPreferences()).toEqual(DEFAULT_NOTIFY_PREFERENCES);
  });

  it("欠損フィールドは既定で補完する", () => {
    localStorage.setItem("tdd-mob:notify:v1", JSON.stringify({ enabled: true }));
    const p = loadNotifyPreferences();
    expect(p.enabled).toBe(true);
    expect(p.soundId).toBe(DEFAULT_NOTIFY_PREFERENCES.soundId);
    expect(p.osNotify).toBe(DEFAULT_NOTIFY_PREFERENCES.osNotify);
  });
});
