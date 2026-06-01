/**
 * 在室状況ラベルのテスト
 * デザインシステム: 色のみ依存を避け、テキストを併記（WCAG 1.4.1）
 */

import { describe, it, expect } from "vitest";
import {
  presenceLabel,
  presenceDotClass,
  presenceTextClass,
} from "../../src/ui/presence.js";

describe("presenceLabel", () => {
  it("online は「オンライン」", () => {
    expect(presenceLabel("online")).toBe("オンライン");
  });
  it("idle は「離席」", () => {
    expect(presenceLabel("idle")).toBe("離席");
  });
  it("offline は「オフライン」", () => {
    expect(presenceLabel("offline")).toBe("オフライン");
  });
});

describe("presenceTextClass", () => {
  // 文字列置換ではなく専用関数で text- クラスを返す（保守性: presenceDotClass の
  // 実装変更で静かに壊れないこと）。トークン（presence-*）に揃える。
  it("online は text-presence-online", () => {
    expect(presenceTextClass("online")).toBe("text-presence-online");
  });
  it("idle は text-presence-idle", () => {
    expect(presenceTextClass("idle")).toBe("text-presence-idle");
  });
  it("offline は text-presence-offline", () => {
    expect(presenceTextClass("offline")).toBe("text-presence-offline");
  });
  it("dot クラスと色トークンが対応する（bg- と text- で同じ presence-* を指す）", () => {
    (["online", "idle", "offline"] as const).forEach((p) => {
      const dot = presenceDotClass(p); // 例: "bg-presence-online"
      const text = presenceTextClass(p); // 例: "text-presence-online"
      expect(dot.replace("bg-", "")).toBe(text.replace("text-", ""));
    });
  });
});
