import { describe, it, expect } from "bun:test";
import { findAiUnlockKeyViolation } from "../src/ai-unlock-key-policy.js";

describe("findAiUnlockKeyViolation", () => {
  it("32 文字ちょうどの ASCII は違反なし", () => {
    // Given
    const key = "a".repeat(32);
    // When
    const violation = findAiUnlockKeyViolation(key);
    // Then
    expect(violation).toBeNull();
  });

  it("31 文字は長さ違反として説明を返す", () => {
    // Given
    const key = "a".repeat(31);
    // When
    const violation = findAiUnlockKeyViolation(key);
    // Then
    expect(violation).toContain("32 文字以上");
  });

  it("`openssl rand -hex 20` 相当（40 文字の 16 進）は違反なし", () => {
    // Given
    const key = "0123456789abcdef0123456789abcdef01234567";
    // When
    const violation = findAiUnlockKeyViolation(key);
    // Then
    expect(violation).toBeNull();
  });

  it("長さが足りていても非 ASCII を含むなら違反", () => {
    // Given
    const key = "あ".repeat(40);
    // When
    const violation = findAiUnlockKeyViolation(key);
    // Then
    expect(violation).toContain("ASCII");
  });

  it("途中に空白を含むなら違反（trim 済みを渡す契約なので中の空白は許さない）", () => {
    // Given
    const key = `${"a".repeat(16)} ${"a".repeat(16)}`;
    // When
    const violation = findAiUnlockKeyViolation(key);
    // Then
    expect(violation).toContain("ASCII");
  });

  it("違反の説明に鍵の値を含めない", () => {
    // Given
    const key = "himitsu-no-aikotoba";
    // When
    const violation = findAiUnlockKeyViolation(key);
    // Then
    expect(violation).not.toBeNull();
    expect(violation).not.toContain(key);
  });
});
