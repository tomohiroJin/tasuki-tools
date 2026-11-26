/**
 * うちわけを CSV にする（#476 第 2 段・設計 §3 B8・FR-14）。
 *
 * 1 行 = 1 区切り。列は {@link CSV_COLUMNS}。日付と時刻は呼ぶ側が渡す時間帯（UTC からの進み・分）で表し、
 * 計測中の区切りは `nowMs` で切る（Markdown と同じ。純粋関数に保つため、時計も時間帯もここでは読まない）。
 * 形は RFC 4180（CRLF・`,` `"` 改行を含む値は引用符で囲み、引用符は二重にする）に UTF-8 の BOM を付ける
 * （表計算が日本語を文字化けさせないため）。
 */
import { formatClock, formatDate } from "./markdown.js";
import { durationOf } from "./projection.js";
import type { TrackView } from "./types.js";

const MS_PER_MIN = 60_000;
const BOM = "﻿";
const EOL = "\r\n";

/** 列の見出し（順も含めて契約。表計算や工数の道具へ移すときの取り決め） */
export const CSV_COLUMNS = ["date", "start", "end", "minutes", "kind", "label", "auto_closed"] as const;

/** 表計算が数式として読む字で始まる値 */
const FORMULA_LEAD = /^[=+\-@\t\r]/;
/** 引用符で囲む値（区切り・引用符・改行を含む） */
const NEEDS_QUOTE = /[",\r\n]/;

/**
 * CSV の 1 欄にする。数式として読まれる字（`=` `+` `-` `@` タブ CR）で始まる値は先頭に `'` を付けて無害にし（CSV インジェクション）、
 * そのあとで必要なら引用符で囲む。
 */
export function csvField(value: string): string {
  const safe = FORMULA_LEAD.test(value) ? `'${value}` : value;
  return NEEDS_QUOTE.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** うちわけを CSV にする。`tzOffsetMin` は UTC からの進み（分。日本時間は 540）。 */
export function toCsv(view: TrackView, nowMs: number, tzOffsetMin: number): string {
  const rows = view.segments.map((g) => {
    const startWall = view.epochWallMs + g.startMs;
    const endWall = view.epochWallMs + Math.max(g.startMs, g.endMs ?? nowMs);
    return [
      formatDate(startWall, tzOffsetMin),
      formatClock(startWall, tzOffsetMin),
      formatClock(endWall, tzOffsetMin),
      (durationOf(g, nowMs) / MS_PER_MIN).toFixed(2),
      g.kind,
      g.label,
      g.autoClosed ? "true" : "false",
    ]
      .map(csvField)
      .join(",");
  });
  return BOM + [CSV_COLUMNS.join(","), ...rows].map((line) => line + EOL).join("");
}

/** 保存するファイルの名前（`track-YYYYMMDD-HHMM.csv`。時刻は渡した時間帯）。 */
export function csvFileName(wallMs: number, tzOffsetMin: number): string {
  const date = formatDate(wallMs, tzOffsetMin).replace(/-/g, "");
  const clock = formatClock(wallMs, tzOffsetMin).replace(":", "");
  return `track-${date}-${clock}.csv`;
}
