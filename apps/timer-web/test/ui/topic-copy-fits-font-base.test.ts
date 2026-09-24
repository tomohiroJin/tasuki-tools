import { describe, it, expect } from "vitest";
import { outsideBase } from "../support/font-base.js";
import { TOPIC_CARD_HEADING } from "../../src/ui/components/TopicCard.js";

/**
 * お題の札の文言は書体の常用の層に収まる（`packages/ui/README.md`）。
 *
 * @requirements #91 spec §5.4（UI 文言は書体の base 層に収める）
 */
describe("お題の札の文言は書体の常用の層に収まる", () => {
  it("Given お題の札が出す固定の文言 / When 常用の層の範囲に当てる / Then 外れる字は無い", () => {
    // Given / When
    const outside = outsideBase([TOPIC_CARD_HEADING]);
    // Then
    expect(outside).toEqual([]);
  });
});
