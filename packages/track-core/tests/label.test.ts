import { describe, expect, it } from "vitest";
import { hasControlChars, isValidLabel, normalizeLabel } from "../src/label.js";
import { MAX_LABEL } from "../src/limits.js";

describe("normalizeLabel", () => {
  it("前後の空白を除く", () => {
    expect(normalizeLabel("  実装　")).toBe("実装");
  });
  it("NFKC を掛ける（全角英数と半角カナを寄せる）", () => {
    expect(normalizeLabel("ＡＢＣ１２３")).toBe("ABC123");
    expect(normalizeLabel("ﾃｽﾄ")).toBe("テスト");
  });
  it("空白だけなら空になる（名前なし）", () => {
    expect(normalizeLabel(" 　 ")).toBe("");
  });
});

describe("isValidLabel", () => {
  it("空（名前なし）は通す", () => {
    expect(isValidLabel("")).toBe(true);
  });
  it("上限ちょうどは通し、1 字超えたら拒む", () => {
    expect(isValidLabel("あ".repeat(MAX_LABEL))).toBe(true);
    expect(isValidLabel("あ".repeat(MAX_LABEL + 1))).toBe(false);
  });
  it("制御文字を含むと拒む", () => {
    expect(isValidLabel("実装\n続き")).toBe(false);
    expect(isValidLabel("実装\u007f")).toBe(false);
  });
});

describe("hasControlChars", () => {
  it("C0 と DEL を見つける", () => {
    expect(hasControlChars("a\tb")).toBe(true);
    expect(hasControlChars("a\u0000b")).toBe(true);
    expect(hasControlChars("ふつうの名前 🎉")).toBe(false);
  });
});
