/**
 * 接続層のエラーの正本（`application/connection-errors.ts`・#362）の単体テスト。
 *
 * 文言そのものの固定は wire の上で行う（`connection-error-text.test.ts`）。ここでは
 * 境界の解析で落ちた段からエラーコードへの対応だけを見る。
 */
import { describe, it, expect } from "bun:test";
import { boundaryErrorCode } from "../src/application/connection-errors.js";

describe("boundaryErrorCode（境界の解析で落ちた段 → エラーコード）", () => {
  it("Given JSON として読めなかった / When コードを引く / Then INVALID_JSON", () => {
    // Given
    const stage = "json" as const;
    // When
    const code = boundaryErrorCode(stage);
    // Then
    expect(code).toBe("INVALID_JSON");
  });

  it("Given JSON だが形が違った / When コードを引く / Then INVALID_COMMAND", () => {
    // Given
    const stage = "schema" as const;
    // When
    const code = boundaryErrorCode(stage);
    // Then
    expect(code).toBe("INVALID_COMMAND");
  });
});
