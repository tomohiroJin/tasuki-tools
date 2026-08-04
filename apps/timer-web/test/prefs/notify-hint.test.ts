import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadNotifyHintSeen, saveNotifyHintSeen } from "../../src/prefs/local-prefs.js";

describe("通知ヒント既読フラグ", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());
  it("初期は未読(false)", () => { expect(loadNotifyHintSeen()).toBe(false); });
  it("保存すると既読(true)", () => { saveNotifyHintSeen(); expect(loadNotifyHintSeen()).toBe(true); });
});
