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
  it("見えない書式の字（ゼロ幅の空白・向きを変える字・BOM ほか）を落とす", () => {
    expect(normalizeLabel("実\u200b装")).toBe("実装");
    expect(normalizeLabel("\u202e実装\u202c")).toBe("実装");
    expect(normalizeLabel("\ufeff実装")).toBe("実装");
    expect(normalizeLabel("実\u2060装\u200c")).toBe("実装");
  });
  it("見えない字を落としてから NFKC を掛ける（基底字と結合文字の間に挟まっても、同じ見た目は同じ名前になる）", () => {
    expect(normalizeLabel("e​́")).toBe(normalizeLabel("é"));
    expect(normalizeLabel("e​́")).toBe("é");
  });
  it("見えない字だけなら空になる（名前なしと同じ）", () => {
    expect(normalizeLabel("\u200b\u202e\ufeff")).toBe("");
    expect(normalizeLabel(" \u200b ")).toBe("");
  });
  it("ZWJ と字形選択子は落とさない（絵文字が崩れる）", () => {
    expect(normalizeLabel("👨\u200d👩\u200d👧")).toBe("👨\u200d👩\u200d👧");
    expect(normalizeLabel("❤\ufe0f")).toBe("❤\ufe0f");
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
