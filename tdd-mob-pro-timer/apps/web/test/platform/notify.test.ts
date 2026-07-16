import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { notifyDriverChange, requestPermissionIfEnabling } from "../../src/platform/notify.js";
import type { NotifyPreferences } from "../../src/prefs/local-prefs.js";

/** テスト用のデフォルト NotifyPreferences */
const basePrefs: NotifyPreferences = {
  enabled: false,
  soundId: "chime",
  volume: 0.7,
  osNotify: true,
  countdownEnabled: false,
  countdownSeconds: 15,
  countdownMode: "tone",
  countdownVoiceId: "voice-male",
};

describe("requestPermissionIfEnabling", () => {
  let requestPermission: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    requestPermission = vi.fn().mockResolvedValue("granted");
    vi.stubGlobal("Notification", Object.assign(vi.fn(), { requestPermission }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("enabled が true になり osNotify が ON なら許可を要求して true を返す", async () => {
    const patch: Partial<NotifyPreferences> = { enabled: true };
    const next: NotifyPreferences = { ...basePrefs, enabled: true };
    const result = await requestPermissionIfEnabling(patch, next);
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(result).toBe(true);
  });

  it("enabled が true だが osNotify が OFF なら許可を要求せず null を返す", async () => {
    const patch: Partial<NotifyPreferences> = { enabled: true };
    const next: NotifyPreferences = { ...basePrefs, enabled: true, osNotify: false };
    const result = await requestPermissionIfEnabling(patch, next);
    expect(requestPermission).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it("enabled が変化していない（patch に enabled なし）なら許可を要求せず null を返す", async () => {
    const patch: Partial<NotifyPreferences> = { soundId: "bell" };
    const next: NotifyPreferences = { ...basePrefs, soundId: "bell" };
    const result = await requestPermissionIfEnabling(patch, next);
    expect(requestPermission).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it("enabled が false に変わる場合は許可を要求せず null を返す", async () => {
    const patch: Partial<NotifyPreferences> = { enabled: false };
    const next: NotifyPreferences = { ...basePrefs, enabled: false };
    const result = await requestPermissionIfEnabling(patch, next);
    expect(requestPermission).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it("許可が denied の場合は false を返す", async () => {
    requestPermission.mockResolvedValue("denied");
    const patch: Partial<NotifyPreferences> = { enabled: true };
    const next: NotifyPreferences = { ...basePrefs, enabled: true };
    const result = await requestPermissionIfEnabling(patch, next);
    expect(result).toBe(false);
  });
});

describe("OS 通知の発火条件", () => {
  let ctor: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    ctor = vi.fn();
    // Notification をモック（permission=granted）。
    vi.stubGlobal("Notification", Object.assign(ctor, { permission: "granted" }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("タブが前面（hidden=false）のときは通知を出さない", () => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    notifyDriverChange("Alice");
    expect(ctor).not.toHaveBeenCalled();
  });

  it("タブが背面（hidden=true）のときだけ通知を出す", () => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    notifyDriverChange("Alice");
    expect(ctor).toHaveBeenCalledTimes(1);
  });

  it("permission が granted でないときは通知を出さない（回帰テスト）", () => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    vi.stubGlobal("Notification", Object.assign(ctor, { permission: "denied" }));
    notifyDriverChange("Bob");
    expect(ctor).not.toHaveBeenCalled();
  });
});
