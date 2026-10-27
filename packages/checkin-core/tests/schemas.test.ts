import * as v from "valibot";
import { describe, expect, it } from "vitest";
import {
  CHECKIN_DOMAIN_ERROR_CODES,
  CHECKIN_ERROR_CODES,
  CheckinCommandSchema,
  CheckinErrorFrameSchema,
  CheckinFrameSchema,
} from "../src/index.js";

const ok = (schema: Parameters<typeof v.safeParse>[0], x: unknown) => v.safeParse(schema, x).success;

describe("CheckinCommandSchema", () => {
  it.each([
    ["やり方を選ぶ", { command: "checkin.method.choose", method: "weather" }],
    ["山から引く（始め）", { command: "checkin.method.draw", side: "checkin" }],
    ["山から引く（終わり）", { command: "checkin.method.draw", side: "checkout" }],
    ["札を出す", { command: "checkin.card.play", seq: 1, card: "sunny" }],
    ["札の最大長 16 字", { command: "checkin.card.play", seq: 3, card: "a".repeat(16) }],
    ["公開の仕方", { command: "checkin.visibility.set", seq: 1, visibility: "anonymous" }],
    ["開く", { command: "checkin.reveal", seq: 1 }],
    ["もう一回", { command: "checkin.again", seq: 2 }],
    ["見学", { command: "checkin.spectator.set", spectator: true }],
  ])("通る: %s", (_n, x) => {
    expect(ok(CheckinCommandSchema, x)).toBe(true);
  });

  it.each([
    ["余剰の項目（m504）", { command: "checkin.reveal", seq: 1, x: 1 }],
    ["余剰の項目（method.choose）", { command: "checkin.method.choose", method: "weather", x: 1 }],
    ["seq 0", { command: "checkin.reveal", seq: 0 }],
    ["seq 1.5", { command: "checkin.reveal", seq: 1.5 }],
    ["seq が文字列", { command: "checkin.reveal", seq: "1" }],
    ["seq が無い", { command: "checkin.again" }],
    ["card が空", { command: "checkin.card.play", seq: 1, card: "" }],
    ["card が 17 字", { command: "checkin.card.play", seq: 1, card: "a".repeat(17) }],
    ["知らないやり方", { command: "checkin.method.choose", method: "weather2" }],
    ["知らない公開の仕方", { command: "checkin.visibility.set", seq: 1, visibility: "secret" }],
    ["知らない側", { command: "checkin.method.draw", side: "middle" }],
    ["spectator が文字列", { command: "checkin.spectator.set", spectator: "true" }],
    ["知らないコマンド", { command: "checkin.nope" }],
    ["他ツールのコマンド", { command: "agenda.start" }],
  ])("拒む: %s", (_n, x) => {
    expect(ok(CheckinCommandSchema, x)).toBe(false);
  });
});

describe("CheckinFrameSchema", () => {
  const view = {
    you: "p1",
    spectating: false,
    spectatorCount: 0,
    round: {
      status: "open",
      seq: 1,
      method: "weather",
      visibility: "named",
      locked: false,
      seats: [{ id: "p1", name: "ア", played: false }],
      playedCount: 0,
      playerCount: 1,
      yourCard: null,
    },
  };
  it("通る（回なし・開く前・開いた後）", () => {
    expect(ok(CheckinFrameSchema, { type: "checkin", state: { ...view, round: null } })).toBe(true);
    expect(ok(CheckinFrameSchema, { type: "checkin", state: view })).toBe(true);
    const revealed = { ...view.round, status: "revealed", piles: [{ card: "sunny", count: 1 }] };
    expect(ok(CheckinFrameSchema, { type: "checkin", state: { ...view, round: revealed } })).toBe(true);
  });
  it("サーバーが項目を足しても通る（非 strict）", () => {
    expect(ok(CheckinFrameSchema, { type: "checkin", state: { ...view, extra: 1 }, more: 2 })).toBe(true);
  });
  it("型や必須項目が違えば拒む", () => {
    expect(ok(CheckinFrameSchema, { type: "agenda", state: view })).toBe(false);
    expect(ok(CheckinFrameSchema, { type: "checkin", state: { ...view, you: 1 } })).toBe(false);
    expect(ok(CheckinFrameSchema, { type: "checkin", state: { ...view, round: { ...view.round, status: "x" } } })).toBe(false);
  });
});

describe("エラーのコードとフレーム", () => {
  it("共通のコードにドメインのコードが続く", () => {
    expect(CHECKIN_ERROR_CODES).toEqual([
      "INVALID_JSON",
      "INVALID_COMMAND",
      "NOT_IN_ROOM",
      "RATE_LIMITED",
      "MESSAGE_TOO_LARGE",
      "INTERNAL_ERROR",
      ...CHECKIN_DOMAIN_ERROR_CODES,
    ]);
  });
  it("エラーフレームは全コードを受け、知らないコードは拒む", () => {
    for (const code of CHECKIN_ERROR_CODES) {
      expect(ok(CheckinErrorFrameSchema, { type: "error", code, message: "m" })).toBe(true);
    }
    expect(ok(CheckinErrorFrameSchema, { type: "error", code: "NOPE", message: "m" })).toBe(false);
  });
});
