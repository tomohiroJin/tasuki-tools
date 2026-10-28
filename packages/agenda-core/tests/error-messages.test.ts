import { afterEach, describe, expect, it, vi } from "vitest";
import { AGENDA_ERROR_CODES, agendaErrorMessageFor } from "../src/index.js";
import { baseFaces, outsideBase } from "./support/font-base.js";

/** 同期サーバーの正本（`apps/tasuki-sync/src/application/connection-errors.ts`）を書き写したもの。 */
const CONNECTION_MESSAGE_TOO_LARGE_TEXT = "メッセージが大きすぎます";
const CONNECTION_INTERNAL_ERROR_TEXT = "サーバー内部でエラーが発生しました";

describe("進行タイマーのエラーの文言", () => {
  it("すべてのコードが空でない文言を持つ", () => {
    for (const code of AGENDA_ERROR_CODES) {
      expect(agendaErrorMessageFor(code).length).toBeGreaterThan(0);
    }
  });

  it("MESSAGE_TOO_LARGE / INTERNAL_ERROR は接続層と同じ文を返す", () => {
    expect(agendaErrorMessageFor("MESSAGE_TOO_LARGE")).toBe(CONNECTION_MESSAGE_TOO_LARGE_TEXT);
    expect(agendaErrorMessageFor("INTERNAL_ERROR")).toBe(CONNECTION_INTERNAL_ERROR_TEXT);
  });

  it("INVALID_SCENARIO は定義の数と合計の上限を言う", () => {
    expect(agendaErrorMessageFor("INVALID_SCENARIO")).toBe("ステップは 40 まで、合計 720 分までです");
  });

  it("文言は書体の常用の層（base）に収まる", () => {
    expect([...baseFaces().keys()].sort()).toEqual([
      "zkgn-400-base.woff2",
      "zkgn-500-base.woff2",
      "zkgn-700-base.woff2",
    ]);
    expect(outsideBase(AGENDA_ERROR_CODES.map(agendaErrorMessageFor))).toEqual([]);
  });
});

describe("進行タイマーのエラーの文言（上限の数）", () => {
  afterEach(() => {
    vi.doUnmock("../src/limits.js");
    vi.resetModules();
  });

  it("MAX_STEP_BUDGET_SEC を変えると、文言の数も変わる", async () => {
    expect(agendaErrorMessageFor("STEP_BUDGET_EXCEEDED")).toContain("240");
    vi.resetModules();
    vi.doMock("../src/limits.js", async (importOriginal) => ({
      ...(await importOriginal<typeof import("../src/limits.js")>()),
      MAX_STEP_BUDGET_SEC: 7200,
    }));
    const { agendaErrorMessageFor: messageFor } = await import("../src/error-messages.js");
    expect(messageFor("STEP_BUDGET_EXCEEDED")).toContain("120");
  });
});
