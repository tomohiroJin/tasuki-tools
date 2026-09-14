import { describe, it, expect } from "vitest";
import { startActionFor } from "../../src/ui/session-start.js";

describe("startActionFor", () => {
  it("時計が止まっていれば START を送る（初回の開始）", () => {
    // Given: 一度も開始していないルーム
    // When / Then（問い合わせがそのまま検証になる）
    expect(startActionFor(false)).toBe("start");
  });

  it("時計が走っていれば session.reset を送る（完了したセッションの時計は止まっていない）", () => {
    // Given: 完了したセッションから戻ってきたロビー
    // When / Then
    expect(startActionFor(true)).toBe("reset");
  });
});
