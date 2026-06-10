import { describe, it, expect } from "vitest";
import * as v from "valibot";
import { CommandSchema } from "../src/schemas.js";
import { MAX_PASSPHRASE } from "../src/aggregate.js";

describe("passphrase スキーマ", () => {
  it("room.join は任意の passphrase を受け付ける", () => {
    expect(v.safeParse(CommandSchema, { command: "room.join", code: "AA", displayName: "x", hasAiKey: false }).success).toBe(true);
    expect(v.safeParse(CommandSchema, { command: "room.join", code: "AA", displayName: "x", hasAiKey: false, passphrase: "pw" }).success).toBe(true);
  });
  it("room.passphrase.set は passphrase 必須（空文字＝解除も可）", () => {
    expect(v.safeParse(CommandSchema, { command: "room.passphrase.set", passphrase: "pw" }).success).toBe(true);
    expect(v.safeParse(CommandSchema, { command: "room.passphrase.set", passphrase: "" }).success).toBe(true);
    expect(v.safeParse(CommandSchema, { command: "room.passphrase.set" }).success).toBe(false);
  });
  it("passphrase は MAX_PASSPHRASE 超で拒否", () => {
    const tooLong = "a".repeat(MAX_PASSPHRASE + 1);
    expect(v.safeParse(CommandSchema, { command: "room.passphrase.set", passphrase: tooLong }).success).toBe(false);
    expect(v.safeParse(CommandSchema, { command: "room.join", code: "AA", displayName: "x", hasAiKey: false, passphrase: tooLong }).success).toBe(false);
  });
});
