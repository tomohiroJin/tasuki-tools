/**
 * ステージ型テーマのトークン定義テスト
 * T035/T036: FR-028, SC-006 (US7)
 *
 * CSS カスタムプロパティはブラウザ環境でないと実際の値を確認できないため、
 * ここでは「トークン定数が定義されていること」と「ステージ専用クラスが存在すること」
 * をソースレベルで確認する。
 */

import { describe, it, expect } from "vitest";
import {
  STAGE_TOKENS,
  getStageClass,
} from "../../src/ui/stage-theme.js";

describe("ステージ型トークン定数（T035/T036）", () => {
  it("STAGE_TOKENS に必須トークンが定義されている", () => {
    expect(STAGE_TOKENS).toContain("--stage-bg");
    expect(STAGE_TOKENS).toContain("--stage-focus-bg");
    expect(STAGE_TOKENS).toContain("--focus-glow");
    expect(STAGE_TOKENS).toContain("--font-size-driver");
    expect(STAGE_TOKENS).toContain("--stage-peripheral-opacity");
  });

  it("getStageClass() でセッション/ロビーにステージクラスを返す", () => {
    expect(getStageClass("session")).toContain("stage");
    expect(getStageClass("lobby")).toContain("stage");
  });

  it("getStageClass() でセットアップ/完了画面にはステージクラスを返さない", () => {
    // セットアップ画面とサマリーはステージ外（通常テーマ）
    const setupClass = getStageClass("setup");
    const celebClass = getStageClass("celebration");
    expect(setupClass).not.toContain("stage");
    expect(celebClass).not.toContain("stage");
  });
});
