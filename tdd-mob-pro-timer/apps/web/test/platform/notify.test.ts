import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { notifyDriverChange } from "../../src/platform/notify.js";

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
