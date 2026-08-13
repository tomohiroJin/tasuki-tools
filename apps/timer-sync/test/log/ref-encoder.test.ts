import { describe, it, expect } from "bun:test";
import { createRefEncoder } from "../../src/application/log/ref-encoder.js";

const SALT_A = Buffer.from("salt-a-for-test");
const SALT_B = Buffer.from("salt-b-for-test");

describe("相関 ID", () => {
  it("ルームコードそのものを含まない（ADR 0012 D2）", () => {
    // Given
    const enc = createRefEncoder(SALT_A);
    // When
    const ref = enc.room("MORNING-MOB-7F3K");
    // Then
    expect(ref).not.toContain("MORNING");
    expect(ref).not.toContain("7F3K");
  });

  it("先頭数文字の部分表示にならない（部分表示は探索空間を縮める）", () => {
    const enc = createRefEncoder(SALT_A);
    expect(enc.room("ABCDEF").startsWith("r_AB")).toBe(false);
  });

  it("同じソルト・同じコードなら同じ値になる（相関が取れる）", () => {
    const enc = createRefEncoder(SALT_A);
    expect(enc.room("ABCDEF")).toBe(enc.room("ABCDEF"));
  });

  it("違うコードなら違う値になる", () => {
    const enc = createRefEncoder(SALT_A);
    expect(enc.room("ABCDEF")).not.toBe(enc.room("ABCDEG"));
  });

  // 再起動をまたぐと相関が切れるのは、揮発設計（憲法 III）と整合する意図的な性質。
  it("ソルトが変わると値が変わる", () => {
    expect(createRefEncoder(SALT_A).room("ABCDEF")).not.toBe(
      createRefEncoder(SALT_B).room("ABCDEF"),
    );
  });

  it("room と request は接頭辞で見分けられる", () => {
    const enc = createRefEncoder(SALT_A);
    expect(enc.room("ABCDEF").startsWith("r_")).toBe(true);
    expect(enc.request("req-1").startsWith("q_")).toBe(true);
  });

  it("同じ値でも room と request では別の ID になる", () => {
    const enc = createRefEncoder(SALT_A);
    expect(enc.room("X").slice(2)).not.toBe(enc.request("X").slice(2));
  });

  it("利用者由来の requestId をそのまま含まない", () => {
    const enc = createRefEncoder(SALT_A);
    expect(enc.request("evil-injected-marker")).not.toContain("injected");
  });
});
