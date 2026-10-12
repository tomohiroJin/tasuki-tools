import { describe, expect, it } from "vitest";
import { ROULETTE_ERROR_CODES, rouletteErrorMessageFor } from "../src/index.js";
import { baseFaces, outsideBase } from "./support/font-base.js";

/** `apps/tasuki-sync/src/adapters/ws-adapter.ts` の `MESSAGE_TOO_LARGE_TEXT` をそのまま書き写したもの。 */
const WS_ADAPTER_MESSAGE_TOO_LARGE_TEXT = "メッセージが大きすぎます";
/** `apps/tasuki-sync/src/adapters/ws-adapter.ts` の `INTERNAL_ERROR_TEXT` をそのまま書き写したもの。 */
const WS_ADAPTER_INTERNAL_ERROR_TEXT = "サーバー内部でエラーが発生しました";

/**
 * @requirements #94 E5・E6・E13（spec §6.6 のエラーの行）
 */
describe("ルーレットのエラーの文言", () => {
  it("すべてのコードが空でない文言を持つ", () => {
    for (const code of ROULETTE_ERROR_CODES) {
      expect(rouletteErrorMessageFor(code).length).toBeGreaterThan(0);
    }
  });

  it("画面に出る文は設計の文言どおり", () => {
    expect(rouletteErrorMessageFor("ROULETTE_TOO_FEW")).toBe("2 人から回せます");
    expect(rouletteErrorMessageFor("ROULETTE_SPINNING")).toBe("回っている間は回せません");
    expect(rouletteErrorMessageFor("GUEST_NAME_TAKEN")).toBe("この名前はすでにいます");
    expect(rouletteErrorMessageFor("TOO_MANY_GUESTS")).toBe("名前は 12 人まで追加できます");
    expect(rouletteErrorMessageFor("ROULETTE_TOO_MANY")).toBe("24 人までで回せます");
  });

  it("MESSAGE_TOO_LARGE / INTERNAL_ERROR は接続層（ws-adapter）と同じ文を返す", () => {
    expect(rouletteErrorMessageFor("MESSAGE_TOO_LARGE")).toBe(WS_ADAPTER_MESSAGE_TOO_LARGE_TEXT);
    expect(rouletteErrorMessageFor("INTERNAL_ERROR")).toBe(WS_ADAPTER_INTERNAL_ERROR_TEXT);
  });

  it("文言は書体の常用の層（base）に収まる", () => {
    // Given: 常用の層の 3 つの太さが見つかる（0 面のまま判定すると、どの字も「外れない」として緑に倒れる）
    expect([...baseFaces().keys()].sort()).toEqual([
      "zkgn-400-base.woff2",
      "zkgn-500-base.woff2",
      "zkgn-700-base.woff2",
    ]);
    // When / Then
    expect(outsideBase(ROULETTE_ERROR_CODES.map(rouletteErrorMessageFor))).toEqual([]);
  });
});
