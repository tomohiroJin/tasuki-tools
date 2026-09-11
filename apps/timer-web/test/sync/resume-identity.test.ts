/**
 * 復帰の組の保存のテスト（Issue #24、#95 S4b で保存先が変わった）。
 *
 * **保存先は `localStorage`・鍵はルームコード別**（#95 D12。FR-006 を撤廃した）。
 * `sessionStorage` だとタブを閉じて参加用 URL を開き直すたびに別人として join し、
 * 前の自分が名簿へ残る（幽霊が溜まる。設計正本 §3.13）。
 * poker（`apps/poker-web/src/storage.ts`）が公開以来採っている形に揃えてある。
 *
 * @requirements FR-001, FR-004, FR-005, R16
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  saveResumeIdentity,
  loadResumeIdentity,
  clearResumeIdentity,
  shouldResumeOnLoad,
  type ResumeIdentity,
} from "../../src/sync/resume-identity.js";

const alice: ResumeIdentity = {
  code: "ABC123",
  participantId: "p-1",
  resumeToken: "resume-token-xyz",
  displayName: "Alice",
};

describe("resume-identity", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("保存した識別情報をそのルームコードで読み込める", () => {
    // Given
    saveResumeIdentity(alice);

    // When
    const loaded = loadResumeIdentity("ABC123");

    // Then
    expect(loaded).toEqual(alice);
  });

  it("未保存のときは null を返す", () => {
    expect(loadResumeIdentity("ABC123")).toBeNull();
  });

  // R16 の要点。**鍵がルームコード別**なので、別のルームの保存値を取り違えない。
  it("別のルームコードでは読み込めない（鍵がルーム別である）", () => {
    // Given: ABC123 の復帰の組だけがある
    saveResumeIdentity(alice);

    // When / Then: 別のルームコードでは何も返らない
    expect(loadResumeIdentity("OTHER1")).toBeNull();
  });

  it("2 つのルームの復帰の組を同時に保てる", () => {
    // Given: 2 つのルームに入ったことがある
    saveResumeIdentity(alice);
    saveResumeIdentity({ ...alice, code: "SECOND", participantId: "p-2" });

    // When / Then: どちらもそれぞれの鍵で引ける
    expect(loadResumeIdentity("ABC123")?.participantId).toBe("p-1");
    expect(loadResumeIdentity("SECOND")?.participantId).toBe("p-2");
  });

  it("破損した JSON なら null を返し、その鍵を捨てる（再試行ループを防ぐ）", () => {
    // Given
    localStorage.setItem("tasuki:resume:ABC123", "{not-json");

    // When
    const loaded = loadResumeIdentity("ABC123");

    // Then
    expect(loaded).toBeNull();
    expect(localStorage.getItem("tasuki:resume:ABC123")).toBeNull();
  });

  it("項目が欠けた値なら null を返し、その鍵を捨てる", () => {
    // Given: resumeToken が無い（型は満たさないが、保存は誰でも書き換えられる）
    localStorage.setItem(
      "tasuki:resume:ABC123",
      JSON.stringify({ code: "ABC123", participantId: "p-1", displayName: "Alice" }),
    );

    // When
    const loaded = loadResumeIdentity("ABC123");

    // Then
    expect(loaded).toBeNull();
    expect(localStorage.getItem("tasuki:resume:ABC123")).toBeNull();
  });

  it("鍵と中身のルームコードが食い違う値は捨てる", () => {
    // Given: 鍵は ABC123 なのに中身は別のルーム（書き換え・実装の取り違え）
    localStorage.setItem("tasuki:resume:ABC123", JSON.stringify({ ...alice, code: "OTHER1" }));

    // When / Then
    expect(loadResumeIdentity("ABC123")).toBeNull();
  });

  it("clearResumeIdentity はそのルームの分だけを捨てる", () => {
    // Given: 2 つのルームの復帰の組がある
    saveResumeIdentity(alice);
    saveResumeIdentity({ ...alice, code: "SECOND", participantId: "p-2" });

    // When
    clearResumeIdentity("ABC123");

    // Then: 消えるのは指定したルームだけである
    expect(loadResumeIdentity("ABC123")).toBeNull();
    expect(loadResumeIdentity("SECOND")?.participantId).toBe("p-2");
  });

  // **FR-006 の撤廃**（#95 D12）。旧実装は sessionStorage に 1 組だけ持っていた。
  it("localStorage に保存する（sessionStorage には残さない）", () => {
    // Given / When
    saveResumeIdentity(alice);

    // Then
    expect(localStorage.getItem("tasuki:resume:ABC123")).not.toBeNull();
    expect(sessionStorage.getItem("tasuki:resume:ABC123")).toBeNull();
    // 旧実装の鍵も残さない（移行はしない。トークンは短命で移す価値が無い）
    expect(sessionStorage.getItem("tdd-mob:resume-identity")).toBeNull();
  });
});

describe("shouldResumeOnLoad", () => {
  it("保存値と URL のルームコードが一致すれば復帰する", () => {
    expect(shouldResumeOnLoad(alice, "ABC123")).toBe(true);
  });

  it("URL のルームコードが違えば復帰しない（前のルームへ引き戻さない）", () => {
    expect(shouldResumeOnLoad(alice, "OTHER1")).toBe(false);
  });

  it("保存値が無い・URL にコードが無いなら復帰しない", () => {
    expect(shouldResumeOnLoad(null, "ABC123")).toBe(false);
    expect(shouldResumeOnLoad(alice, null)).toBe(false);
  });

  it("トークンか表示名が空なら復帰しない（別人として二重参加になる）", () => {
    // Given: トークンが空・表示名が空の保存値
    // When / Then: どちらも復帰させない
    expect(shouldResumeOnLoad({ ...alice, resumeToken: "" }, "ABC123")).toBe(false);
    expect(shouldResumeOnLoad({ ...alice, displayName: "" }, "ABC123")).toBe(false);
  });
});
