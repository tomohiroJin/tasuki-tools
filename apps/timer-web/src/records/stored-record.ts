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
  // **要素の型が合わない配列は、記録ごと外す。** 要素だけを落とすと `members` と
  // `driverCounts` の添字がずれ、別人の回数が別人の名前の横に並ぶ（`ui/Summary.tsx`）。
  if (!isStringArray(r.members)) return null;
  if (r.driverCounts !== undefined && !isNumberArray(r.driverCounts)) return null;
  const topicTitle =
    "topicTitle" in r
      ? (typeof r.topicTitle === "string" ? r.topicTitle : null)
      : (typeof r.problemTitle === "string" ? r.problemTitle : null);
  return {
    id: r.id,
    ...(typeof r.roomId === "string" ? { roomId: r.roomId } : {}),
    topicTitle,
    elapsedSeconds: r.elapsedSeconds,
    members: [...r.members],
    totalSwitches: r.totalSwitches,
    completedAt: r.completedAt,
    ...(isNumberArray(r.driverCounts) ? { driverCounts: [...r.driverCounts] } : {}),
    ...(typeof r.rounds === "number" ? { rounds: r.rounds } : {}),
  };
}

/**
 * IndexedDB から読んだ値の列を、いまの形の記録の列へ畳む（#91・E18）。
 * 読めない値は一覧から外す。`loadRecords` はこれを通して返す。
 */
export function recordsFromStore(raw: readonly unknown[]): CompletionRecord[] {
  return raw.map(normalizeStoredRecord).filter((r): r is CompletionRecord => r !== null);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((m) => typeof m === "string");
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((n) => typeof n === "number");
}
