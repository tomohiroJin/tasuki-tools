/**
 * コードの分からないエラーに出す既定の文言を、どのツールでもそろえる（#378）。
 *
 * 既定の文言は 4 か所に住む。core は `@tasuki/*` に依存しない（`docs/adr/0017`）ので
 * 1 つの定数を共有できず、web アプリの写しもそれぞれの `copy.ts` にある。
 *
 * - timer: `packages/timer-core/src/error-messages.ts` の `DEFAULT_ERROR_MESSAGE`
 * - poker: `packages/poker-core/src/error-messages.ts` の `DEFAULT_ERROR_MESSAGE`
 * - topic: `apps/topic-web/src/copy.ts` の `DEFAULT_ERROR_TEXT`（`tests/copy.test.ts` が同じ文を固定）
 * - roulette: `apps/roulette-web/src/copy.ts` の `DEFAULT_ERROR_TEXT`（同上）
 *
 * かつて timer だけが「。」付きだった。句点なしにそろえたのは、ほかの 3 つと、
 * 接続層の文言（`connection-errors.ts`・#362）と E2E がすでに句点なしだったため。
 * 2 つの core を取り込めるのはここだけなので、core の 2 つはここで見る。
 */
import { describe, it, expect } from "bun:test";
import { DEFAULT_ERROR_MESSAGE as TIMER_DEFAULT } from "@tasuki/timer-core/error-messages";
import { DEFAULT_ERROR_MESSAGE as POKER_DEFAULT } from "@tasuki/poker-core";

const EXPECTED = "操作を完了できませんでした";

describe("既定のエラーの文言（#378）", () => {
  it("Given timer と poker の core / When 既定の文言を見る / Then どちらも句点なしの同じ文", () => {
    expect(TIMER_DEFAULT).toBe(EXPECTED);
    expect(POKER_DEFAULT).toBe(EXPECTED);
  });
});
