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

  it("id の空文字と 65 字が落ちる。64 字ちょうどは通る", () => {
    // Given
    // When
    expect(ok({ command: "roulette.include", id: "", included: true })).toBe(false);
    expect(ok({ command: "roulette.include", id: "x".repeat(65), included: true })).toBe(false);
    expect(ok({ command: "roulette.include", id: "x".repeat(64), included: true })).toBe(true);
    expect(ok({ command: "roulette.guest.remove", id: "" })).toBe(false);
    expect(ok({ command: "roulette.guest.remove", id: "x".repeat(65) })).toBe(false);
  });

  it("guest.add の name は room.join の表示名と同じく境界で長さを縛らない（上限は表示名の規約が正規化の前後で課す）", () => {
    // Given: 前後に空白を足した名前。正規化すれば 3 字になる（room.join なら通る）
    const padded = `${" ".repeat(40)}Bob${" ".repeat(40)}`;
    // When / Then: 境界に別の狭い上限があると、room.join では通る名前がここだけで INVALID_COMMAND になる
    expect(ok({ command: "roulette.guest.add", name: padded })).toBe(true);
    expect(ok({ command: "roulette.guest.add", name: LONG_65 })).toBe(true);
    expect(ok({ command: "roulette.guest.add", name: 1 })).toBe(false);
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
  });

  it("エラーコードの契約は、ルーレットの接続でこの層と接続層が返すものだけ（参加の失敗はハブの形・ハブのコードで届く）", () => {
    // Given: 契約に無いコードを足す・使わないコードを残すと、web の文言表と食い違う
    // When / Then
    expect([...ROULETTE_ERROR_CODES].sort()).toEqual(
      [
        "GUEST_NAME_TAKEN",
        "INTERNAL_ERROR",
        "INVALID_COMMAND",
        "INVALID_GUEST_NAME",
        "INVALID_JSON",
        "INVALID_PICK_COUNT",
        "MESSAGE_TOO_LARGE",
        "NOT_IN_ROOM",
        "ROULETTE_SPINNING",
        "ROULETTE_TOO_FEW",
        "ROULETTE_TOO_FEW_FOR_PICK",
        "ROULETTE_TOO_MANY",
        "TOO_MANY_GUESTS",
      ].sort(),
    );
  });
});

/**
 * @requirements #401 E2（選ぶ人数のコマンド）・spec §5.3（wire の互換）
 */
describe("選ぶ人数（wire）", () => {
  it("roulette.pick.set は数の count を受ける（範囲はドメインの setPickCount が見る）", () => {
    // Given / When / Then
    expect(ok({ command: "roulette.pick.set", count: 1 })).toBe(true);
    expect(ok({ command: "roulette.pick.set", count: 5 })).toBe(true);
    for (const count of ["2", null, true]) {
      expect(ok({ command: "roulette.pick.set", count })).toBe(false);
    }
    expect(ok({ command: "roulette.pick.set" })).toBe(false);
  });

  it("roulette.pick.set の余剰の項目は落ちる（strictObject）", () => {
    // Given / When / Then
    expect(ok({ command: "roulette.pick.set", count: 2, x: 1 })).toBe(false);
  });

  const spin = {
    seq: 1,
    wheel: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
      { id: "c", name: "C" },
    ],
    winnerIndex: 0,
    settle: 0.5,
    spunBy: "A",
    durationMs: 5600,
    elapsedMs: 0,
  };
  const parse = (state: object) => v.safeParse(RouletteFrameSchema, { type: "roulette", state });

  it("古いサーバーのフレーム（pickCount・picks が無い）も通る", () => {
    // Given / When
    const r = parse({ excluded: [], guests: [], drawn: [], spin });
    // Then
    expect(r.success).toBe(true);
  });

  it("新しいサーバーのフレーム（pickCount・picks がある）が通り、値をそのまま読む", () => {
    // Given
    const picks = [
      { index: 0, settle: 0.5 },
      { index: 2, settle: 0.3 },
    ];
    // When
    const r = parse({ pickCount: 2, excluded: [], guests: [], drawn: [], spin: { ...spin, picks } });
    // Then
    expect(r.success && r.output.state.pickCount).toBe(2);
    expect(r.success && r.output.state.spin?.picks).toEqual(picks);
  });

  it("picks の形が違えば落ちる", () => {
    // Given / When / Then
    expect(parse({ excluded: [], guests: [], drawn: [], spin: { ...spin, picks: [{ index: "0", settle: 0.5 }] } }).success).toBe(false);
    expect(parse({ pickCount: "2", excluded: [], guests: [], drawn: [], spin: null }).success).toBe(false);
  });
});
