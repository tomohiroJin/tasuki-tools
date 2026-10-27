import { describe, expect, it } from "vitest";
import { CHECKIN_ERROR_CODES, checkinErrorMessageFor } from "../src/index.js";
import { baseFaces, outsideBase } from "./support/font-base.js";

/** 同期サーバーの正本（`apps/tasuki-sync/src/application/connection-errors.ts`）を書き写したもの。 */
const CONNECTION_TEXT = {
  INVALID_JSON: "JSON の形式が不正です",
  INVALID_COMMAND: "コマンドの形式が不正です",
  NOT_IN_ROOM: "ルームに参加していません",
  RATE_LIMITED: "しばらく待ってから操作してください",
  MESSAGE_TOO_LARGE: "メッセージが大きすぎます",
  INTERNAL_ERROR: "サーバー内部でエラーが発生しました",
} as const;

describe("会の始まりと終わりの札のエラーの文言", () => {
  it("すべてのコードが空でない文言を持つ", () => {
    for (const code of CHECKIN_ERROR_CODES) {
      expect(checkinErrorMessageFor(code).length).toBeGreaterThan(0);
    }
  });

  it("共通のコードは接続層と同じ文を返す", () => {
    for (const [code, text] of Object.entries(CONNECTION_TEXT)) {
      expect(checkinErrorMessageFor(code as keyof typeof CONNECTION_TEXT)).toBe(text);
    }
  });

  it("ドメインのコードの文言は互いに違う", () => {
    const texts = CHECKIN_ERROR_CODES.map(checkinErrorMessageFor);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it("文言は書体の常用の層（base）に収まる", () => {
    expect([...baseFaces().keys()].sort()).toEqual([
      "zkgn-400-base.woff2",
      "zkgn-500-base.woff2",
      "zkgn-700-base.woff2",
    ]);
    expect(outsideBase(CHECKIN_ERROR_CODES.map(checkinErrorMessageFor))).toEqual([]);
  });
});
