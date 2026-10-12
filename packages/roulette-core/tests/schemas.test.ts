import * as v from "valibot";
import { describe, expect, it } from "vitest";
import {
  RouletteCommandSchema,
  RouletteErrorFrameSchema,
  RouletteFrameSchema,
  ROULETTE_ERROR_CODES,
} from "../src/index.js";

const LONG_65 = "あ".repeat(65);
const ok = (x: unknown): boolean => v.safeParse(RouletteCommandSchema, x).success;

/**
 * @requirements #94 E15（S3: 余剰フィールド・巨大入力を拒む・docs/adr/0011 決定 2）
 */
describe("ルーレットのコマンド（境界）", () => {
  it("5 つのコマンドが通る", () => {
    // Given
    // When
    expect(ok({ command: "roulette.spin" })).toBe(true);
    expect(ok({ command: "roulette.include", id: "p-a", included: false })).toBe(true);
    expect(ok({ command: "roulette.guest.add", name: "ゲスト" })).toBe(true);
    expect(ok({ command: "roulette.guest.remove", id: "g-1" })).toBe(true);
    expect(ok({ command: "roulette.cycle.reset" })).toBe(true);
  });

  it("余剰の項目は落ちる（strictObject）", () => {
    // Given
    // When
    expect(ok({ command: "roulette.spin", x: 1 })).toBe(false);
    expect(ok({ command: "roulette.cycle.reset", x: 1 })).toBe(false);
    expect(ok({ command: "roulette.include", id: "p-a", included: true, x: 1 })).toBe(false);
    expect(ok({ command: "roulette.guest.add", name: "a", x: 1 })).toBe(false);
    expect(ok({ command: "roulette.guest.remove", id: "g-1", x: 1 })).toBe(false);
  });

  it("id の空文字と 65 字、name の 65 字が落ちる。64 字ちょうどは通る", () => {
    // Given
    // When
    expect(ok({ command: "roulette.include", id: "", included: true })).toBe(false);
    expect(ok({ command: "roulette.include", id: "x".repeat(65), included: true })).toBe(false);
    expect(ok({ command: "roulette.include", id: "x".repeat(64), included: true })).toBe(true);
    expect(ok({ command: "roulette.guest.remove", id: "" })).toBe(false);
    expect(ok({ command: "roulette.guest.remove", id: "x".repeat(65) })).toBe(false);
    expect(ok({ command: "roulette.guest.add", name: LONG_65 })).toBe(false);
    expect(ok({ command: "roulette.guest.add", name: "あ".repeat(64) })).toBe(true);
  });

  it("型の違う値・知らないコマンドは落ちる", () => {
    // Given
    // When
    expect(ok({ command: "roulette.include", id: "p-a", included: "yes" })).toBe(false);
    expect(ok({ command: "roulette.nope" })).toBe(false);
    expect(ok({ command: "topic.clear" })).toBe(false);
  });
});

describe("ルーレットのフレーム", () => {
  const view = {
    excluded: [],
    guests: [],
    drawn: [],
    spin: {
      seq: 1,
      wheel: [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ],
      winnerIndex: 0,
      settle: 0.5,
      spunBy: "A",
      durationMs: 4000,
      elapsedMs: 0,
    },
  };

  it("通る。項目を足しても通る（非 strict）", () => {
    // Given
    // When
    expect(v.safeParse(RouletteFrameSchema, { type: "roulette", state: view }).success).toBe(true);
    expect(
      v.safeParse(RouletteFrameSchema, { type: "roulette", state: { ...view, future: 1 }, extra: true }).success,
    ).toBe(true);
    expect(v.safeParse(RouletteFrameSchema, { type: "roulette", state: { ...view, spin: null } }).success).toBe(true);
  });

  it("形が違えば落ちる", () => {
    expect(v.safeParse(RouletteFrameSchema, { type: "topic", state: view }).success).toBe(false);
    expect(v.safeParse(RouletteFrameSchema, { type: "roulette", state: { ...view, drawn: "x" } }).success).toBe(false);
  });

  it("エラーフレームはコードを列挙で受ける", () => {
    // Given
    // When
    expect(v.safeParse(RouletteErrorFrameSchema, { type: "error", code: "ROULETTE_TOO_FEW", message: "x" }).success).toBe(true);
    expect(v.safeParse(RouletteErrorFrameSchema, { type: "error", code: "NOPE", message: "x" }).success).toBe(false);
    expect(ROULETTE_ERROR_CODES).toContain("TOO_MANY_GUESTS");
  });
});
