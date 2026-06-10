/**
 * CommandSchema の境界バリデーションのテスト
 * host.transfer コマンドの追加分（v2.2 R2-3）を中心に検証する。
 */

import { describe, it, expect } from "vitest";
import * as v from "valibot";
import { CommandSchema } from "../src/index.js";

describe("CommandSchema host.transfer", () => {
  it("participantId 付きの host.transfer は success", () => {
    const result = v.safeParse(CommandSchema, {
      command: "host.transfer",
      participantId: "p2",
    });
    expect(result.success).toBe(true);
  });

  it("participantId 欠落の host.transfer は failure", () => {
    const result = v.safeParse(CommandSchema, {
      command: "host.transfer",
    });
    expect(result.success).toBe(false);
  });
});
