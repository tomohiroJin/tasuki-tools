/**
 * 完成記録の生成
 * T021: FR-028
 */

import type { Aggregate, CompletionRecord, Problem, SessionConfig } from "./aggregate.js";
import { elapsedMs } from "./aggregate.js";

/** ランダムではなく単調増加 ID を生成する（テスト可能性のため now + counter） */
let counter = 0;

/**
 * 完成記録を生成する
 * 所要時間は稼働区間のみ積算（停止中は含まない）SC-004
 */
export function buildCompletionRecord(
  agg: Aggregate,
  problem: Problem,
  config: SessionConfig,
  now: number,
  roomId?: string,
): CompletionRecord {
  const totalElapsedMs = elapsedMs(agg.clock, now);

  return {
    id: generateId(now),
    ...(roomId !== undefined && { roomId }),
    problemTitle: problem.title,
    language: config.language,
    difficulty: config.difficulty,
    elapsedSeconds: Math.round(totalElapsedMs / 1000),
    members: [...config.members],
    totalSwitches: agg.session.totalSwitches,
    completedAt: now,
  };
}

/** 時刻ベースの一意 ID を生成する */
function generateId(now: number): string {
  counter = (counter + 1) % 100000;
  return `${now.toString(36)}-${counter.toString(36).padStart(5, "0")}`;
}
