import { describe, it, expect } from "vitest";
import * as v from "valibot";
import { SessionConfigSchema } from "../src/schemas.js";

// config.set は v.partial(SessionConfigSchema) で検証するため、
// SessionConfigSchema に problemEnabled を追加することで対応する。
describe("problemEnabled スキーマ", () => {
  it("problemEnabled=false を含む config.set patch を受理する", () => {
    // Given（v.partial で全フィールドが省略可能になるため、problemEnabled 単独でも valid）
    const partial = v.partial(SessionConfigSchema);
    const patch = { problemEnabled: false };
    // When
    const r = v.safeParse(partial, patch);
    // Then
    expect(r.success).toBe(true);
  });
  it("problemEnabled 未指定でも valid", () => {
    // Given
    const partial = v.partial(SessionConfigSchema);
    const patch = { language: "Go" };
    // When
    const r = v.safeParse(partial, patch);
    // Then
    expect(r.success).toBe(true);
  });
});
