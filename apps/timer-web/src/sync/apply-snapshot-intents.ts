/**
 * snapshot の意図（`decideSnapshotIntents` の結果）を、受け皿へ順に渡す（#595・#482-6）。
 *
 * `use-timer-sync.ts` の `handleRoom` から分けた。判断は `snapshot-intents.ts`（純粋関数）、
 * 副作用の中身（state の setter・復帰の組の保存・IndexedDB）は呼び出し側が受け皿として渡す。
 * ここは **「意図 → 受け皿」の対応と、配列の順に実行すること**だけを持つ。
 */

import type { ResumeIdentity } from "@tasuki/sync-client";
import type { CompletionRecord } from "@tasuki/timer-core";
import type { Screen } from "../ui/screen.js";
import type { EndType } from "../ui/Summary.js";
import type { SnapshotIntent } from "./snapshot-intents.js";

/** 意図ごとの受け皿。 */
export interface SnapshotIntentSinks {
  /** 復帰の組を保存する（保存後に持ち越しの組を捨てるのも呼び出し側）。 */
  saveResume: (identity: ResumeIdentity) => void;
  /** 前のセッションの記録・終了種別を畳む。 */
  clearCompletion: () => void;
  setScreen: (screen: Screen) => void;
  setEnd: (endType: EndType) => void;
  /** 完了へ入った遷移で届く記録を、画面へ載せて端末へ保存する。 */
  persistCompletion: (record: CompletionRecord) => void;
}

export function applySnapshotIntents(
  intents: readonly SnapshotIntent[],
  sinks: SnapshotIntentSinks,
): void {
  for (const intent of intents) {
    switch (intent.kind) {
      case "save-resume":
        sinks.saveResume(intent.identity);
        break;
      case "clear-completion":
        sinks.clearCompletion();
        break;
      case "set-screen":
        sinks.setScreen(intent.screen);
        break;
      case "set-end":
        sinks.setEnd(intent.endType);
        break;
      case "persist-completion":
        sinks.persistCompletion(intent.record);
        break;
      default: {
        // 網羅チェック: 新しい意図が増えたらここで型検査が落ちる（DbC）。
        const exhaustive: never = intent;
        return exhaustive;
      }
    }
  }
}
