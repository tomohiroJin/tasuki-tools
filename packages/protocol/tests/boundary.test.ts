import { describe, it, expect } from "vitest";
import * as v from "valibot";
import { parseBoundaryMessage } from "../src/index.js";

const Schema = v.object({
  kind: v.literal("greet"),
  name: v.pipe(v.string(), v.minLength(1)),
});

describe("parseBoundaryMessage", () => {
  it("Given スキーマに合う JSON / When パースする / Then 検証済みの値が返る", () => {
    const result = parseBoundaryMessage(Schema, '{"kind":"greet","name":"たろう"}');
    expect(result._unsafeUnwrap()).toEqual({ kind: "greet", name: "たろう" });
  });

  it("Given JSON として壊れたテキスト / When パースする / Then stage が json で失敗する", () => {
    // Given: 壊れた JSON テキストを渡す呼び出し自体が前提の指定を兼ねる
    // When
    const result = parseBoundaryMessage(Schema, "{ 壊れている");
    // Then
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ stage: "json" });
  });

  it("Given JSON だが形が違う / When パースする / Then stage が schema で失敗する", () => {
    // Given: kind が一致しない JSON を渡す呼び出し自体が前提の指定を兼ねる
    // When
    const result = parseBoundaryMessage(Schema, '{"kind":"farewell"}');
    // Then
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({ stage: "schema" });
  });

  it("Given 空文字 / When パースする / Then stage が json で失敗する", () => {
    expect(parseBoundaryMessage(Schema, "")._unsafeUnwrapErr()).toEqual({ stage: "json" });
  });

  it("Given JSON の値が null / When パースする / Then stage が schema で失敗する", () => {
    // JSON としては妥当（null）。スキーマ側で落ちることを確かめる
    // （json 段で落ちると誤ったエラーコードを返してしまう）。
    expect(parseBoundaryMessage(Schema, "null")._unsafeUnwrapErr()).toEqual({ stage: "schema" });
  });

  it("Given 制約に反する値 / When パースする / Then stage が schema で失敗する", () => {
    // Given: 制約に反する値（空の name）を渡す呼び出し自体が前提の指定を兼ねる
    // 形は合うが minLength(1) に反する。パイプの検証まで効いていることの確認。
    // When / Then（parseBoundaryMessage の呼び出しと検証が同じ式になる）
    expect(
      parseBoundaryMessage(Schema, '{"kind":"greet","name":""}')._unsafeUnwrapErr(),
    ).toEqual({ stage: "schema" });
  });
});
