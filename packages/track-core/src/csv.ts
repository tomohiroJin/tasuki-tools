/**
 * うちわけを CSV にする（#476 第 2 段・設計 §3 B8・FR-14）。
 *
 * 1 行 = 1 区切り。列は {@link CSV_COLUMNS}。日付と時刻は呼ぶ側が渡す時間帯（UTC からの進み・分）で表し、
 * 計測中の区切りは `nowMs` で切る（Markdown と同じ。純粋関数に保つため、時計も時間帯もここでは読まない）。
 * 形は RFC 4180（CRLF・値はすべて引用符で囲み、引用符は二重にする。見出しの行だけは囲まない）に UTF-8 の BOM を付ける
 * （表計算が日本語を文字化けさせないため）。
 */
import { formatClock, formatDate } from "./markdown.js";
import { durationOf } from "./projection.js";
import type { TrackView } from "./types.js";

const MS_PER_MIN = 60_000;
const BOM = "﻿";
const EOL = "\r\n";

/** 列の見出し（順も含めて契約。表計算や工数の道具へ移すときの取り決め） */
export const CSV_COLUMNS = ["start_date", "start", "end_date", "end", "minutes", "kind", "label", "auto_closed"] as const;

/** 表計算が数式として読む字で始まる値（`=` `+` `-` `@` タブ CR LF） */
const FORMULA_LEAD = /^[=+\-@\t\r\n]/;

/**
 * CSV の 1 欄にする。数式として読まれる字で始まる値は先頭に `'` を付けて無害にし（CSV インジェクション）、
 * **値はすべて `"` で囲む**（中の `"` は二重にする。`,` や改行を含む値も、含まない値も同じ形で、読む側が迷わない）。
 * 全角の記号は、作業名の正規化（NFKC）で半角になっているので別に扱わない。
 */
export function csvField(value: string): string {
  const safe = FORMULA_LEAD.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** うちわけを CSV にする。`tzOffsetMin` は UTC からの進み（分。日本時間は 540）。 */
export function toCsv(view: TrackView, nowMs: number, tzOffsetMin: number): string {
  const rows = view.segments.map((g) => {
    const startWall = view.epochWallMs + g.startMs;
    const endWall = view.epochWallMs + Math.max(g.startMs, g.endMs ?? nowMs);
    return [
      formatDate(startWall, tzOffsetMin),
      formatClock(startWall, tzOffsetMin),
      formatDate(endWall, tzOffsetMin),
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
