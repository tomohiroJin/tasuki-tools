import { describe, expect, it } from "vitest";
import { TOPIC_ERROR_CODES, topicErrorMessageFor, type TopicErrorCode } from "../src/index.js";

/**
 * timer-core（`packages/timer-core/src/error-messages.ts`）の文言をそのまま書き写したもの。
 * topic-core は timer-core に依存できないため、直書きして比べる
 * (timer 側の文言が変わったらこのテストが落ちて、揃え直す機会になる)。
 */
const TIMER_MESSAGES: Partial<Record<TopicErrorCode, string>> = {
  RATE_LIMITED: "試行が多すぎます。しばらく待ってから再試行してください。",
  AI_UNLOCK_FAILED: "合言葉が違います。",
  NOT_IN_ROOM: "ルームに参加していません",
};

/** `apps/tasuki-sync/src/adapters/ws-adapter.ts` の `MESSAGE_TOO_LARGE_TEXT` をそのまま書き写したもの。 */
const WS_ADAPTER_MESSAGE_TOO_LARGE_TEXT = "メッセージが大きすぎます";

/** `apps/tasuki-sync/src/adapters/ws-adapter.ts` の `INTERNAL_ERROR_TEXT` をそのまま書き写したもの。 */
const WS_ADAPTER_INTERNAL_ERROR_TEXT = "サーバー内部でエラーが発生しました";

/**
 * @requirements #91 E20
 */
describe("お題のエラーの文言", () => {
  it("すべてのコードが空でない文言を持つ", () => {
    for (const code of TOPIC_ERROR_CODES) {
      expect(topicErrorMessageFor(code).length).toBeGreaterThan(0);
    }
  });

  it("timer と共通のコードは timer と同じ文を返す", () => {
    for (const [code, message] of Object.entries(TIMER_MESSAGES)) {
      expect(topicErrorMessageFor(code as TopicErrorCode)).toBe(message);
    }
  });

  it("MESSAGE_TOO_LARGE は接続層(ws-adapter)と同じ文を返す", () => {
    expect(topicErrorMessageFor("MESSAGE_TOO_LARGE")).toBe(WS_ADAPTER_MESSAGE_TOO_LARGE_TEXT);
  });

  it("INTERNAL_ERROR は接続層(ws-adapter)と同じ文を返す", () => {
    expect(topicErrorMessageFor("INTERNAL_ERROR")).toBe(WS_ADAPTER_INTERNAL_ERROR_TEXT);
  });
});
