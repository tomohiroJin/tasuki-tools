import { afterEach, describe, expect, it, vi } from "vitest";
import { baseFaces, outsideBase } from "@tasuki/test-css/font-base";
import { MARKDOWN_TEXT, TRACK_ERROR_CODES, trackErrorMessageFor } from "../src/index.js";

/** 同期サーバーの正本（`apps/tasuki-sync/src/application/connection-errors.ts`）を書き写したもの。 */
const CONNECTION_MESSAGE_TOO_LARGE_TEXT = "メッセージが大きすぎます";
const CONNECTION_INTERNAL_ERROR_TEXT = "サーバー内部でエラーが発生しました";

describe("うちわけのエラーの文言", () => {
  it("すべてのコードが空でない文言を持つ", () => {
    for (const code of TRACK_ERROR_CODES) {
      expect(trackErrorMessageFor(code).length).toBeGreaterThan(0);
    }
  });

  it("MESSAGE_TOO_LARGE / INTERNAL_ERROR は接続層と同じ文を返す", () => {
    expect(trackErrorMessageFor("MESSAGE_TOO_LARGE")).toBe(CONNECTION_MESSAGE_TOO_LARGE_TEXT);
    expect(trackErrorMessageFor("INTERNAL_ERROR")).toBe(CONNECTION_INTERNAL_ERROR_TEXT);
  });

  it("上限を言う文は、上限の数を含む", () => {
    expect(trackErrorMessageFor("TRACK_INVALID_LABEL")).toContain("80");
    expect(trackErrorMessageFor("TRACK_FULL")).toContain("200");
    expect(trackErrorMessageFor("PIN_LIMIT")).toContain("9");
  });

  it("文言は書体の常用の層（base）に収まる", () => {
    expect([...baseFaces().keys()].sort()).toEqual(["zkgn-400-base.woff2", "zkgn-500-base.woff2", "zkgn-700-base.woff2"]);
    expect(outsideBase(TRACK_ERROR_CODES.map(trackErrorMessageFor))).toEqual([]);
  });

  it("Markdown の決まった文も base に収まる（画面の下書きの欄に出す）", () => {
    expect(outsideBase(Object.values(MARKDOWN_TEXT).flat())).toEqual([]);
  });
});

describe("うちわけのエラーの文言（上限の数）", () => {
  afterEach(() => {
    vi.doUnmock("../src/limits.js");
    vi.resetModules();
  });

  it("MAX_SEGMENTS を変えると、文言の数も変わる", async () => {
    vi.resetModules();
    vi.doMock("../src/limits.js", async (importOriginal) => ({
      ...(await importOriginal<typeof import("../src/limits.js")>()),
      MAX_SEGMENTS: 50,
    }));
    const { trackErrorMessageFor: messageFor } = await import("../src/error-messages.js");
    expect(messageFor("TRACK_FULL")).toContain("50");
  });
});
