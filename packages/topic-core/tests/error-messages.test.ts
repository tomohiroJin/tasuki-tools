import { describe, expect, it } from "vitest";
import { TOPIC_ERROR_CODES, topicErrorMessageFor, type TopicErrorCode } from "../src/index.js";

/**
 * timer-core（`packages/timer-core/src/error-messages.ts`）の文言をそのまま書き写したもの。
 * topic-core は timer-core に依存できないため、直書きして比べる。
 *
 * **`RATE_LIMITED` / `AI_UNLOCK_FAILED` は #91 PR 2 で timer と揃えるのをやめた。** timer の文は
 * 書体の常用の層に無い字（「多」「違」）を含み、お題ツールが出すたびに拡張の層を取りに行く。
 * timer の同じコードは、timer のお題の経路ごと PR 3 で消える（spec §9）。
 */
const TIMER_MESSAGES: Partial<Record<TopicErrorCode, string>> = {
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

/**
 * お題ツールが画面に出す文。書体の常用の層に収まることは
 * `apps/topic-web/tests/copy-fits-font-base.test.ts` が守る。ここは文そのものを固定する。
 *
 * @requirements #91 spec §5.4（UI 文言は書体の base 層に収める）
 */
describe("お題ツールが出す文", () => {
  /**
   * @requirements #91 spec §5.4
   */
  describe("作り直しの拒否", () => {
    it("作り直しがクールダウンで拒まれたら、待ってから作り直すよう促す", () => {
      expect(topicErrorMessageFor("GENERATION_COOLDOWN")).toBe("しばらく待ってから、もう一度作ってください。");
    });
  });

  it("合言葉が合わなければ、正しくないと伝える", () => {
    expect(topicErrorMessageFor("AI_UNLOCK_FAILED")).toBe("合言葉が正しくありません。");
  });

  it("合言葉を続けて外したら、待ってから再試行するよう促す", () => {
    expect(topicErrorMessageFor("RATE_LIMITED")).toBe("続けて失敗しました。しばらく待ってから再試行してください。");
  });
});
