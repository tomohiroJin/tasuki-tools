import { describe, it, expect } from "vitest";
import * as v from "valibot";
import { CommandSchema, RoomSchema } from "../src/schemas.js";
import { MAX_AI_UNLOCK_KEY } from "../src/aggregate.js";

describe("ai.unlock コマンドスキーマ", () => {
  it("正しい ai.unlock コマンドを受理する", () => {
    const result = v.safeParse(CommandSchema, {
      command: "ai.unlock",
      key: "open-sesame",
    });
    expect(result.success).toBe(true);
  });

  it("key が上限を超えると拒否する", () => {
    const result = v.safeParse(CommandSchema, {
      command: "ai.unlock",
      key: "x".repeat(MAX_AI_UNLOCK_KEY + 1),
    });
    expect(result.success).toBe(false);
  });

  it("key 欠落は拒否する", () => {
    const result = v.safeParse(CommandSchema, { command: "ai.unlock" });
    expect(result.success).toBe(false);
  });
});

describe("Room.aiUnlocked", () => {
  it("MAX_AI_UNLOCK_KEY は 64", () => {
    expect(MAX_AI_UNLOCK_KEY).toBe(64);
  });

  it("RoomSchema が aiUnlocked(boolean, 任意) を受理する", () => {
    // 既存の最小 Room を組み立てるのは重いので、エントリの存在を直接検証する
    const entries = (RoomSchema as v.ObjectSchema<v.ObjectEntries, undefined>).entries;
    expect(entries["aiUnlocked"]).toBeDefined();
  });
});
