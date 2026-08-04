/**
 * driver.assign wire コマンドのスキーマ検証（Issue #13）
 */
import { describe, it, expect } from "vitest";
import * as v from "valibot";
import { CommandSchema } from "../src/schemas.js";

describe("CommandSchema: driver.assign", () => {
  it("participantId 付きの driver.assign を受理する", () => {
    // Given
    const command = { command: "driver.assign", participantId: "pid-123" };
    // When
    const result = v.safeParse(CommandSchema, command);
    // Then
    expect(result.success).toBe(true);
  });

  it("participantId が無い driver.assign を拒否する", () => {
    const result = v.safeParse(CommandSchema, { command: "driver.assign" });
    expect(result.success).toBe(false);
  });
});
