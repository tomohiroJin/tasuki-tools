/**
 * エラーコード → 画面の次の動作マッピングのテスト
 * @requirements FR-127, FR-129, US1-4, US2-1, US2-2
 */

import { describe, it, expect } from "vitest";
import { errorAction } from "../../src/ui/error-action.js";

describe("errorAction", () => {
  it("ROOM_NOT_FOUND はセッション喪失を示す", () => {
    expect(errorAction("ROOM_NOT_FOUND")).toEqual({ kind: "session-lost" });
  });

  it("LEFT_ROOM は入口画面へ戻す退出動作を示す", () => {
    expect(errorAction("LEFT_ROOM")).toEqual({ kind: "leave-room", destination: "setup" });
  });

  it("REMOVED_FROM_ROOM は参加画面へ戻す退出動作を示す", () => {
    expect(errorAction("REMOVED_FROM_ROOM")).toEqual({ kind: "leave-room", destination: "join" });
  });

  it("REMOVED_BY_HOST は参加画面へ戻す退出動作を示す", () => {
    expect(errorAction("REMOVED_BY_HOST")).toEqual({ kind: "leave-room", destination: "join" });
  });

  it("LAST_MANAGER は画面を移さない一時的な動作を示す", () => {
    expect(errorAction("LAST_MANAGER")).toEqual({ kind: "transient" });
  });

  it("未知のコードは画面を移さない一時的な動作を示す", () => {
    expect(errorAction("WHATEVER")).toEqual({ kind: "transient" });
  });
});
