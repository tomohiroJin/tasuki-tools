import { describe, it, expect } from "bun:test";
import { constantTimeEqual } from "../src/application/secure-compare.js";

describe("constantTimeEqual", () => {
  it("一致する文字列は true", () => {
    expect(constantTimeEqual("abc123", "abc123")).toBe(true);
  });
  it("不一致は false", () => {
    expect(constantTimeEqual("abc123", "abc124")).toBe(false);
  });
  it("長さ不一致は false（例外を投げない）", () => {
    expect(constantTimeEqual("short", "longer-string")).toBe(false);
  });
  it("マルチバイト（日本語）も比較できる", () => {
    expect(constantTimeEqual("ひらけごま", "ひらけごま")).toBe(true);
    expect(constantTimeEqual("ひらけごま", "ひらけまめ")).toBe(false);
  });
});
