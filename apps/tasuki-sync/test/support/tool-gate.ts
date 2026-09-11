/**
 * テスト用の入口の門（#95 S4a）。**判定材料は本番と同じ**にする。
 *
 * `makeHandlers`（timer / poker のどちらも）を直接呼ぶテストは、既定をここから取ること。
 * 各テストが自前の門を書くと、**片方だけ「常に true」を返す偽物**になって越境の検査が
 * 静かに死ぬ。本番の判定材料は `src/create-sync-server.ts` にあり、ここはそれを
 * テストの保管の上で組み直したものである。
 *
 * 省略した保管は「その状態は 1 つも無い」として扱う。timer だけを見るテストは
 * `{ timers }` を、poker だけを見るテストは `{ rounds }` を渡せばよい
 * （各入口が問うのは自分のツールの状態だけである）。
 */
import { createToolGate, type ToolGate } from "../../src/application/tool-gate.js";
import type { TimerStore } from "../../src/ports/timer-store.js";
import type { RoundStore } from "../../src/ports/poker-round-store.js";

export function testToolGate(stores: { timers?: TimerStore; rounds?: RoundStore }): ToolGate {
  return createToolGate({
    hasTimerState: (code) => stores.timers?.get(code) !== undefined,
    hasRound: (code) => stores.rounds?.get(code) !== undefined,
  });
}
