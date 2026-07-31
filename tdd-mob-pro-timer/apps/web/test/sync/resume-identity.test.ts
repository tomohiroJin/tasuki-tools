/**
 * リジューム識別情報のセッション保存のテスト（Issue #24）
 *
 * resumeToken はルーム限定・短命（サーバー再起動で失効）なため、
 * localStorage ではなく sessionStorage を使う（.claude/rules/security.md との整合は
 * docs/plans/resume-token-wiring/spec.md の非機能要件を参照）。
 *
 * @requirements FR-001, FR-004, FR-005, FR-006
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  saveResumeIdentity,
  loadResumeIdentity,
  clearResumeIdentity,
} from "../../src/sync/resume-identity.js";

describe("resume-identity", () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => sessionStorage.clear());

  it("保存した識別情報をそのまま読み込める", () => {
    // Given
    saveResumeIdentity({
      code: "ABC123",
      participantId: "p-1",
      resumeToken: "resume-token-xyz",
      displayName: "Alice",
    });

    // When
    const loaded = loadResumeIdentity();

    // Then
    expect(loaded).toEqual({
      code: "ABC123",
      participantId: "p-1",
      resumeToken: "resume-token-xyz",
      displayName: "Alice",
    });
  });

  it("未保存のときは null を返す", () => {
    expect(loadResumeIdentity()).toBeNull();
  });

  it("破損した JSON が保存されていても null を返す（防御的）", () => {
    sessionStorage.setItem("tdd-mob:resume-identity", "{not-json");
    expect(loadResumeIdentity()).toBeNull();
  });

  it("clearResumeIdentity 後は null を返す", () => {
    saveResumeIdentity({
      code: "ABC123",
      participantId: "p-1",
      resumeToken: "resume-token-xyz",
      displayName: "Alice",
    });

    clearResumeIdentity();

    expect(loadResumeIdentity()).toBeNull();
  });

  it("sessionStorage に保存する（localStorage には残さない）", () => {
    saveResumeIdentity({
      code: "ABC123",
      participantId: "p-1",
      resumeToken: "resume-token-xyz",
      displayName: "Alice",
    });

    expect(sessionStorage.getItem("tdd-mob:resume-identity")).not.toBeNull();
    expect(localStorage.getItem("tdd-mob:resume-identity")).toBeNull();
  });
});
