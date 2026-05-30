/**
 * room.phase → 表示画面マッピングのテスト
 * 3回目レビュー: マルチユーザーの画面遷移整合（FR-001, SC-001）
 */

import { describe, it, expect } from "vitest";
import { screenForPhase } from "../../src/ui/screen.js";

describe("screenForPhase", () => {
  it("setup フェーズはロビー画面", () => {
    expect(screenForPhase("setup")).toBe("lobby");
  });

  it("ready フェーズはロビー画面（お題プレビュー前）", () => {
    expect(screenForPhase("ready")).toBe("lobby");
  });

  it("session フェーズはセッション画面", () => {
    expect(screenForPhase("session")).toBe("session");
  });

  it("celebration フェーズは完成画面", () => {
    expect(screenForPhase("celebration")).toBe("celebration");
  });
});
