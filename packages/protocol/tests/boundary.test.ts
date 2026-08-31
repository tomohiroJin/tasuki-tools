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
    expect(result._unsafeUnwrapErr()).toEqual({ stage: "json", paths: ["<root>"] });
  });

  it("Given JSON だが形が違う / When パースする / Then stage が schema で失敗する", () => {
    // Given: kind が一致しない JSON を渡す呼び出し自体が前提の指定を兼ねる
    // When
    const result = parseBoundaryMessage(Schema, '{"kind":"farewell"}');
    // Then
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().stage).toBe("schema");
    // kind が literal に合わず、name も欠けている
    expect(result._unsafeUnwrapErr().paths).toEqual(["kind", "name"]);
  });

  it("Given 空文字 / When パースする / Then stage が json で失敗する", () => {
    // Given: 空文字は JSON として読めない
    // When / Then（呼び出しと検証が同じ式になる）
    expect(parseBoundaryMessage(Schema, "")._unsafeUnwrapErr()).toEqual({
      stage: "json",
      paths: ["<root>"],
    });
  });

  it("Given JSON の値が null / When パースする / Then stage が schema で失敗する", () => {
    // Given: JSON としては妥当（null）。スキーマ側で落ちることを確かめる
    // （json 段で落ちると誤ったエラーコードを返してしまう）。
    // When / Then（呼び出しと検証が同じ式になる）
    expect(parseBoundaryMessage(Schema, "null")._unsafeUnwrapErr()).toEqual({
      stage: "schema",
      paths: ["<root>"],
    });
  });

  it("Given 制約に反する値 / When パースする / Then stage が schema で失敗する", () => {
    // Given: 制約に反する値（空の name）を渡す呼び出し自体が前提の指定を兼ねる
    // 形は合うが minLength(1) に反する。パイプの検証まで効いていることの確認。
    // When / Then（parseBoundaryMessage の呼び出しと検証が同じ式になる）
    expect(
      parseBoundaryMessage(Schema, '{"kind":"greet","name":""}')._unsafeUnwrapErr(),
    ).toEqual({ stage: "schema", paths: ["name"] });
  });
});

/**
 * 落ちた項目の**経路だけ**を返す（#212）。値は返さない。
 *
 * 利用側（poker-web）は、捨てたフレームが画面を古くするものだったかを
 * これで判別する。`stage` だけでは「room-state を落とした」と
 * 「error を落とした」を区別できない。
 *
 * @requirements #212
 */
describe("parseBoundaryMessage が返す経路", () => {
  it("Given 項目 1 つが制約に反する / When パースする / Then その項目の経路だけを返す", () => {
    // Given: 制約に反する値を持つ入力
    // When: パースする
    const result = parseBoundaryMessage(Schema, '{"kind":"greet","name":""}');
    // Then
    expect(result._unsafeUnwrapErr().paths).toEqual(["name"]);
  });

  it("Given 複数の項目が落ちる / When パースする / Then すべての経路を返す", () => {
    // Given: 2 つの項目が同時に落ちる入力
    // When: パースする
    const result = parseBoundaryMessage(Schema, '{"kind":1,"name":""}');
    // Then
    expect([...result._unsafeUnwrapErr().paths].sort()).toEqual(["kind", "name"]);
  });

  /**
   * **根で落ちると valibot の `flatten` は `nested` を持たない。**
   * 何もしないと空配列になり、**最も壊れている場面でだけ経路が無言**になる。
   */
  it("Given オブジェクトですらない値 / When パースする / Then 根で落ちたことを返す", () => {
    // Given: オブジェクトですらない入力
    // When: パースする
    const result = parseBoundaryMessage(Schema, "5");
    // Then
    expect(result._unsafeUnwrapErr().paths).toEqual(["<root>"]);
  });

  it("Given JSON として読めないテキスト / When パースする / Then 根で落ちたことを返す", () => {
    // Given: JSON として読めない入力
    // When: パースする
    const result = parseBoundaryMessage(Schema, "{ 壊れている");
    // Then（挙げようがないので、根で落ちたときと同じ扱いにする）
    expect(result._unsafeUnwrapErr().paths).toEqual(["<root>"]);
  });
});
