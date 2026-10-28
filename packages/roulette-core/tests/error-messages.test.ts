import { afterEach, describe, expect, it, vi } from "vitest";
import { ROULETTE_ERROR_CODES, rouletteErrorMessageFor } from "../src/index.js";
import { baseFaces, outsideBase } from "./support/font-base.js";

/** 同期サーバーの正本（`apps/tasuki-sync/src/application/connection-errors.ts`）の `MESSAGE_TOO_LARGE` を書き写したもの。 */
const CONNECTION_MESSAGE_TOO_LARGE_TEXT = "メッセージが大きすぎます";
/** 同期サーバーの正本（`apps/tasuki-sync/src/application/connection-errors.ts`）の `INTERNAL_ERROR` を書き写したもの。 */
const CONNECTION_INTERNAL_ERROR_TEXT = "サーバー内部でエラーが発生しました";

/**
 * @requirements #94 E5・E6・E13（spec §6.6 のエラーの行）
 */
describe("ルーレットのエラーの文言", () => {
  it("すべてのコードが空でない文言を持つ", () => {
    // Given
    for (const code of ROULETTE_ERROR_CODES) {
    // When
      expect(rouletteErrorMessageFor(code).length).toBeGreaterThan(0);
    }
  });

  it("画面に出る文は設計の文言どおり", () => {
    // Given
    // When
    expect(rouletteErrorMessageFor("ROULETTE_TOO_FEW")).toBe("2 人から回せます");
    expect(rouletteErrorMessageFor("ROULETTE_SPINNING")).toBe("回っている間は回せません");
    expect(rouletteErrorMessageFor("GUEST_NAME_TAKEN")).toBe("この名前はすでにいます");
    expect(rouletteErrorMessageFor("TOO_MANY_GUESTS")).toBe("名前は 24 人まで追加できます");
    expect(rouletteErrorMessageFor("ROULETTE_TOO_MANY")).toBe("24 人までで回せます");
    expect(rouletteErrorMessageFor("INVALID_PICK_COUNT")).toBe("この人数は選べません");
    expect(rouletteErrorMessageFor("ROULETTE_TOO_FEW_FOR_PICK")).toBe("選ぶ人数の人より、入る人が要ります");
    expect(rouletteErrorMessageFor("ROULETTE_ROUND_IN_PROGRESS")).toBe("この回の途中は決め方を変えられません");
    expect(rouletteErrorMessageFor("ROULETTE_STOP_INVALID")).toBe("ここでは止められません");
  });

  it("MESSAGE_TOO_LARGE / INTERNAL_ERROR は接続層（ws-adapter）と同じ文を返す", () => {
    expect(rouletteErrorMessageFor("MESSAGE_TOO_LARGE")).toBe(CONNECTION_MESSAGE_TOO_LARGE_TEXT);
    expect(rouletteErrorMessageFor("INTERNAL_ERROR")).toBe(CONNECTION_INTERNAL_ERROR_TEXT);
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

/**
 * 上限の数は定数から組む（PR #355 のレビュー指摘 9）。文言に数を直書きすると、上限を変えたときに
 * 画面だけが古い数を言い続ける。定数を差し替えて文言が追いかけることで見分ける。
 */
describe("ルーレットのエラーの文言（上限の数）", () => {
  afterEach(() => {
    vi.doUnmock("../src/limits.js");
    vi.resetModules();
  });

  it("MAX_WHEEL・MAX_GUESTS を変えると、文言の数も変わる", async () => {
    // Given: 上限を設計と違う値へ差し替える
    vi.resetModules();
    vi.doMock("../src/limits.js", async (importOriginal) => ({
      ...(await importOriginal<typeof import("../src/limits.js")>()),
      MAX_WHEEL: 30,
      MAX_GUESTS: 7,
    }));
    // When
    const { rouletteErrorMessageFor: messageFor } = await import("../src/error-messages.js");
    // Then
    expect(messageFor("ROULETTE_TOO_MANY")).toBe("30 人までで回せます");
    expect(messageFor("TOO_MANY_GUESTS")).toBe("名前は 7 人まで追加できます");
  });
});
