import { describe, it, expect } from "vitest";
import { errorMessageFor } from "@tasuki/timer-core";
import { baseFaces, outsideBase } from "../support/font-base.js";
import { TOPIC_CARD_HEADING, TOPIC_CLOSE, TOPIC_READ_MORE } from "../../src/ui/components/TopicCard.js";

/**
 * お題の札の文言は書体の常用の層に収まる（`packages/ui/README.md`）。
 *
 * @requirements #91 spec §5.4（UI 文言は書体の base 層に収める）
 */
describe("お題の札の文言は書体の常用の層に収まる", () => {
  it("Given fonts.css / When 常用の層の面を読む / Then 3 つの太さが見つかる", () => {
    // Given / When
    const faces = [...baseFaces().keys()].sort();
    // Then: 0 面のまま下の判定が走ると、どの字も「外れない」ことになって緑に倒れる
    expect(faces).toEqual(["zkgn-400-base.woff2", "zkgn-500-base.woff2", "zkgn-700-base.woff2"]);
  });

  it("Given お題の札が出す固定の文言 / When 常用の層の範囲に当てる / Then 外れる字は無い", () => {
    // Given / When
    const outside = outsideBase([TOPIC_CARD_HEADING, TOPIC_READ_MORE, TOPIC_CLOSE]);
    // Then
    expect(outside).toEqual([]);
  });
});

/**
 * 空の輪の拒否の文言（#376）。通常の経路からは届かないが、届いたときに書体の拡張の層を引かない。
 * 表（`ERROR_MESSAGES`）の既存の文言には base 層から外れる字を持つものがあるので、表ごとではなく
 * このコードの文言だけを見る。
 */
describe("空の輪の拒否の文言は書体の常用の層に収まる（#376）", () => {
  it("Given EmptyRotation の文言 / When 常用の層の範囲に当てる / Then 外れる字は無い", () => {
    // Given
    const text = errorMessageFor("EmptyRotation");
    // When / Then（既定の文言へ落ちていないことも見る。落ちていると、このコードの文言を測っていない）
    expect(text).not.toBe(errorMessageFor("__unknown__"));
    expect(outsideBase([text])).toEqual([]);
  });
});
