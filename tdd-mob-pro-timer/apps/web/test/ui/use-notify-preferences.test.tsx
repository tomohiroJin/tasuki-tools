/**
 * useNotifyPreferences のテスト
 * 通知設定がセッション中（同一タブ）に保存されたら即時反映されることを保証する。
 * NotifySettings は別コンポーネントから saveNotifyPreferences を呼ぶため、
 * storage イベント（別タブのみ）では同一タブの変更を拾えない。カスタムイベントで購読する。
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useNotifyPreferences } from "../../src/ui/use-notify-preferences.js";
import {
  saveNotifyPreferences,
  DEFAULT_NOTIFY_PREFERENCES,
} from "../../src/prefs/local-prefs.js";

describe("useNotifyPreferences", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("初期値は保存済み設定（未保存なら既定）", () => {
    const { result } = renderHook(() => useNotifyPreferences());
    expect(result.current).toEqual(DEFAULT_NOTIFY_PREFERENCES);
  });

  it("同一タブで saveNotifyPreferences を呼ぶと即時に更新される", () => {
    const { result } = renderHook(() => useNotifyPreferences());
    expect(result.current.enabled).toBe(false);

    act(() => {
      saveNotifyPreferences({
        enabled: true, soundId: "bell", osNotify: false, volume: 0.6,
        countdownEnabled: false, countdownSeconds: 15, countdownMode: "tone", countdownVoiceId: "voice-male",
      });
    });

    expect(result.current.enabled).toBe(true);
    expect(result.current.soundId).toBe("bell");
    expect(result.current.osNotify).toBe(false);
  });

  it("別タブの storage イベントでも追従する", () => {
    saveNotifyPreferences({
      enabled: false, soundId: "chime-up", osNotify: true, volume: 0.6,
      countdownEnabled: false, countdownSeconds: 15, countdownMode: "tone", countdownVoiceId: "voice-male",
    });
    const { result } = renderHook(() => useNotifyPreferences());

    // 別タブが localStorage を書き換えた状況を storage イベントで再現する。
    act(() => {
      localStorage.setItem(
        "tdd-mob:notify:v1",
        JSON.stringify({ enabled: true, soundId: "soft", osNotify: true }),
      );
      window.dispatchEvent(new StorageEvent("storage", { key: "tdd-mob:notify:v1" }));
    });

    expect(result.current.enabled).toBe(true);
    expect(result.current.soundId).toBe("soft");
  });
});
