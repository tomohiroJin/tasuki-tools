/**
 * 在室状況ラベルのテスト
 * デザインシステム: 色のみ依存を避け、テキストを併記（WCAG 1.4.1）
 */

import { describe, it, expect } from "vitest";
import { presenceLabel } from "../../src/ui/presence.js";

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
