/**
 * `classifyErrorKind` のテスト。
 *
 * 例外を安全にログへ出すための分類（`err.name` / `typeof err`）を丸める処理は、
 * 元々 `apps/timer-sync/src/adapters/ws-adapter.ts` の非公開関数 `classifyError`
 * にだけ実装されていた（`sanitizeErrorKind` を含む）。poker-sync にも同じ形の
 * ガードが要る（#103 Task 7 レビュー S-2）ため、複製すると S-1 と同じ二重正本の
 * 問題が再発する。ここへ切り出し、両アプリから共有する。
 *
 * `LogSafe`（ADR 0012 D1 のブランド型）は timer-sync のログ基盤に閉じた仕組みで
 * あり、`scripts/audit-log-hygiene.mjs` の ALLOWED_FILES もアプリ側のファイルに
 * 限定されている。そのためこの関数は素の `string` を返し、ブランド付けは
 * 呼び出し側（timer-sync は `publicText()`、poker-sync はそのまま）に委ねる。
 */
import { describe, it, expect } from "vitest";
import { classifyErrorKind } from "../src/error-kind.js";

describe("classifyErrorKind", () => {
  it("Error インスタンスは name を返す", () => {
    expect(classifyErrorKind(new Error("boom"))).toBe("Error");
    expect(classifyErrorKind(new TypeError("boom"))).toBe("TypeError");
  });

  it("null / undefined を throw したときは typeof の結果を返す", () => {
    expect(classifyErrorKind(null)).toBe("object");
    expect(classifyErrorKind(undefined)).toBe("undefined");
  });

  it("非 Error オブジェクト・文字列は typeof の結果を返す", () => {
    expect(classifyErrorKind("boom")).toBe("string");
    expect(classifyErrorKind({ message: "boom" })).toBe("object");
  });

  it("name ゲッタ自体が throw する例外でも落ちずに Error にフォールバックする", () => {
    class NameGetterThrows extends Error {
      override get name(): string {
        throw new Error("name getter boom");
      }
    }
    expect(classifyErrorKind(new NameGetterThrows("boom"))).toBe("Error");
  });

  it("name に偽の key=value を仕込んでも、空白・= が残らない", () => {
    const err = new Error("boom");
    err.name = "Error xff=203.0.113.88 level=info fake".repeat(3);
    const kind = classifyErrorKind(err);
    expect(kind).not.toContain("xff=203.0.113.88");
    expect(kind).not.toContain("level=info");
    expect(kind).not.toContain(" ");
    expect(kind).not.toContain("=");
  });

  it("長さが上限で丸められる", () => {
    const err = new Error("boom");
    err.name = "A".repeat(200);
    expect(classifyErrorKind(err).length).toBeLessThanOrEqual(40);
  });

  it("英数字と最小限の記号以外は ? に丸める", () => {
    const err = new Error("boom");
    err.name = "エラー!!!";
    expect(classifyErrorKind(err)).toBe("??????");
  });
});
