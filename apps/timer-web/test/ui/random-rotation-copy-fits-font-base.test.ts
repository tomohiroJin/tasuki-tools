import { describe, it, expect } from "vitest";
import { baseFaces } from "@tasuki/test-css/font-base";
import { RANDOM_ROTATION_TEXT } from "../../src/ui/random-rotation-text.js";

/**
 * ランダム交代の文言は、書体の常用の層（base 層）に収める。外れる字を許さない。
 *
 * @requirements #660
 */
describe("ランダム交代の文言は書体の常用の層に収まる", () => {
  it("Given 常用の層の面 / When 読む / Then 3 つの太さが見つかる（0 面だと下が緑に倒れる）", () => {
    expect([...baseFaces().keys()].sort()).toEqual(["zkgn-400-base.woff2", "zkgn-500-base.woff2", "zkgn-700-base.woff2"]);
  });

  it("Given ランダム交代の文言のすべて / When 常用の層の範囲に当てる / Then 外れる字が無い", () => {
    // Given
    const texts = Object.values(RANDOM_ROTATION_TEXT);
    const outside = new Set<string>();
    // When
    for (const [, ranges] of baseFaces()) {
      for (const text of texts) {
        for (const ch of text) {
          const cp = ch.codePointAt(0) ?? 0;
          if (cp > 0x7e && !ranges.some(([a, b]) => cp >= a && cp <= b)) outside.add(ch);
        }
      }
    }
    // Then
    expect([...outside]).toEqual([]);
  });

  it("Given 文言の一覧 / When 集める / Then 4 つの文言が実際に測られている（空振りでない）", () => {
    const texts = Object.values(RANDOM_ROTATION_TEXT);
    expect(texts).toHaveLength(4);
    for (const text of texts) expect(text.length).toBeGreaterThan(0);
  });
});
