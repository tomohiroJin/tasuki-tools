/**
 * テーマ解決ロジックのテスト
 * デザインシステム: ダークモード（手動 > システム設定）
 */

import { describe, it, expect } from "vitest";
import { resolveInitialTheme } from "../../src/ui/theme.js";

describe("resolveInitialTheme", () => {
  it("保存値が dark なら dark（システム設定より優先）", () => {
    expect(resolveInitialTheme("dark", false)).toBe("dark");
  });

  it("保存値が light なら light（システムがダークでも優先）", () => {
    expect(resolveInitialTheme("light", true)).toBe("light");
  });

  it("保存値が無くシステムがダークなら dark", () => {
    expect(resolveInitialTheme(null, true)).toBe("dark");
  });

  it("保存値が無くシステムがライトなら light", () => {
    expect(resolveInitialTheme(null, false)).toBe("light");
  });

  it("不正な保存値はシステム設定にフォールバックする", () => {
    expect(resolveInitialTheme("purple", true)).toBe("dark");
    expect(resolveInitialTheme("purple", false)).toBe("light");
  });
});
