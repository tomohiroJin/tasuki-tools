/**
 * i18n 文言の網羅確認テスト
 * T070: 非機能(多言語)
 *
 * v2 で追加した UI セクションが ja/en 両方に存在することを確認。
 */

import { describe, it, expect } from "vitest";
import { ja } from "@tdd-mob/core";
import { en } from "@tdd-mob/core";

describe("i18n 文言の網羅（T070）", () => {
  it("ja に v2 の endSession セクションがある", () => {
    expect(ja.ui.endSession).toBeTruthy();
    expect(ja.ui.endSession.abortLabel).toBeTruthy();
    expect(ja.ui.endSession.confirmAbort).toBeTruthy();
  });

  it("en に v2 の endSession セクションがある", () => {
    expect(en.ui.endSession).toBeTruthy();
    expect(en.ui.endSession.abortLabel).toBeTruthy();
    expect(en.ui.endSession.confirmAbort).toBeTruthy();
  });

  it("ja に v2 の aiSettings セクションがある", () => {
    expect(ja.ui.aiSettings).toBeTruthy();
    expect(ja.ui.aiSettings.modeAi).toBeTruthy();
    expect(ja.ui.aiSettings.modeFallback).toBeTruthy();
  });

  it("en に v2 の aiSettings セクションがある", () => {
    expect(en.ui.aiSettings).toBeTruthy();
    expect(en.ui.aiSettings.modeAi).toBeTruthy();
    expect(en.ui.aiSettings.modeFallback).toBeTruthy();
  });

  it("ja に v2 の roster セクションがある", () => {
    expect(ja.ui.roster).toBeTruthy();
    expect(ja.ui.roster.addProxyButton).toBeTruthy();
    expect(ja.ui.roster.skipTurnButton).toBeTruthy();
  });

  it("en に v2 の roster セクションがある", () => {
    expect(en.ui.roster).toBeTruthy();
    expect(en.ui.roster.addProxyButton).toBeTruthy();
    expect(en.ui.roster.skipTurnButton).toBeTruthy();
  });

  it("ja に v2 の connection セクションがある", () => {
    expect(ja.ui.connection).toBeTruthy();
    expect(ja.ui.connection.reconnecting).toBeTruthy();
    expect(ja.ui.connection.lost).toBeTruthy();
  });

  it("en に v2 の connection セクションがある", () => {
    expect(en.ui.connection).toBeTruthy();
    expect(en.ui.connection.reconnecting).toBeTruthy();
    expect(en.ui.connection.lost).toBeTruthy();
  });

  it("problemSource に 'custom' が ja/en 両方にある", () => {
    expect(ja.problemSource.custom).toBeTruthy();
    expect(en.problemSource.custom).toBeTruthy();
  });

  it("session ボタン名が「完成！」でなく「完成」になっている（FR-044）", () => {
    expect(ja.ui.session.completeButton).toBe("完成");
    expect(ja.ui.session.completeButton).not.toContain("！");
    expect(en.ui.session.completeButton).toBe("Complete");
    expect(en.ui.session.completeButton).not.toContain("!");
  });
});
