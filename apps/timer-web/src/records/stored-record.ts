/**
 * 端末（IndexedDB）に保存された完成記録を、いまの形へ畳む（#91・spec §5.5・E18）。
 *
 * #91 PR 3 より前の記録は `problemTitle`（必須）と `language` / `difficulty` を持つ。
 * いまの記録は `topicTitle`（null 可）を持つ。**`topicTitle` の有無で見分ける** ——
 * null を「無い」と取り違えると、お題なしの新しい記録を旧い記録として読んでしまう。
 */
import type { CompletionRecord } from "@tasuki/timer-core";

export function normalizeStoredRecord(raw: unknown): CompletionRecord | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.completedAt !== "number") return null;
  if (typeof r.elapsedSeconds !== "number" || typeof r.totalSwitches !== "number") return null;
  if (!Array.isArray(r.members)) return null;
  const topicTitle =
    "topicTitle" in r
      ? (typeof r.topicTitle === "string" ? r.topicTitle : null)
      : (typeof r.problemTitle === "string" ? r.problemTitle : null);
  return {
    id: r.id,
    ...(typeof r.roomId === "string" ? { roomId: r.roomId } : {}),
    topicTitle,
    elapsedSeconds: r.elapsedSeconds,
    members: r.members.filter((m): m is string => typeof m === "string"),
    totalSwitches: r.totalSwitches,
    completedAt: r.completedAt,
    ...(Array.isArray(r.driverCounts) ? { driverCounts: r.driverCounts.filter((n): n is number => typeof n === "number") } : {}),
    ...(typeof r.rounds === "number" ? { rounds: r.rounds } : {}),
  };
}
