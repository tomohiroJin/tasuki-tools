/**
 * うちわけを Markdown にする（#476・設計 §4.5・FR-25）。
 *
 * 表（作業名・合計・割合）と時系列の一覧の 2 つを出す。**個人の名前は載せない**（状態に無い）。
 * 時刻は `epochWallMs + 位置` を、呼ぶ側が渡す時間帯（UTC からの進み・分）で表す。純粋関数に保つため、端末の時間帯はここで読まない。
 * **h:mm と時刻は 1 分未満を切り捨て、合計と割合は丸める前の値から計算する。**
 */
import { totalsOf } from "./projection.js";
import type { SegmentView, TrackView } from "./types.js";

const MS_PER_MIN = 60_000;
const MS_PER_DAY = 24 * 60 * MS_PER_MIN;

export const MARKDOWN_TEXT = {
  heading: "うちわけ",
  empty: "まだ記録がありません。",
  columns: ["作業", "時間", "割合"],
  unnamed: "（名前なし）",
  break: "休憩",
  workTotal: "作業の合計",
  total: "全体",
  roundingNote: "時間は 1 分未満を切り捨てています。行を足しても合計と合わないことがあります。",
  timeline: "時系列",
  running: "（計測中）",
  autoClosed: "（全員が離れたため自動で停止）",
} as const;

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** 長さを h:mm にする（1 分未満は切り捨て）。 */
export function formatDuration(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / MS_PER_MIN);
  return `${Math.floor(minutes / 60)}:${pad2(minutes % 60)}`;
}

/** 壁時計の時刻を、時間帯をずらした「見かけの UTC」の日付にする。 */
const shifted = (wallMs: number, tzOffsetMin: number): Date => new Date(wallMs + tzOffsetMin * MS_PER_MIN);

/** 壁時計の時刻を HH:MM にする（分未満は切り捨て）。 */
export function formatClock(wallMs: number, tzOffsetMin: number): string {
  const d = shifted(wallMs, tzOffsetMin);
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

const formatDate = (wallMs: number, tzOffsetMin: number): string => {
  const d = shifted(wallMs, tzOffsetMin);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
};

const formatMonthDay = (wallMs: number, tzOffsetMin: number): string => {
  const d = shifted(wallMs, tzOffsetMin);
  return `${pad2(d.getUTCMonth() + 1)}/${pad2(d.getUTCDate())}`;
};

/** その時間帯での日の通し番号（日付をまたぐかの判定に使う）。 */
const dayOf = (wallMs: number, tzOffsetMin: number): number => Math.floor((wallMs + tzOffsetMin * MS_PER_MIN) / MS_PER_DAY);

/**
 * 作業名を Markdown の本文として安全にする。表の区切り（`|`）と、強調・リンク・見出し・HTML に読まれる記号を逃がす。
 * 作業名は制御文字（改行を含む）を持たないので、行は割れない。
 */
export function escapeLabel(label: string): string {
  return label.replace(/[\\`*_[\]<>#~|]/g, "\\$&");
}

const nameOf = (segment: Pick<SegmentView, "kind" | "label">): string =>
  segment.kind === "break" ? MARKDOWN_TEXT.break : segment.label === "" ? MARKDOWN_TEXT.unnamed : escapeLabel(segment.label);

/** うちわけを Markdown にする。`tzOffsetMin` は UTC からの進み（分。日本時間は 540）。 */
export function toMarkdown(view: TrackView, nowMs: number, tzOffsetMin: number): string {
  const first = view.segments[0];
  const last = view.segments.at(-1);
  if (first === undefined || last === undefined) return [`## ${MARKDOWN_TEXT.heading}`, "", MARKDOWN_TEXT.empty].join("\n");

  const wallOf = (posMs: number): number => view.epochWallMs + posMs;
  const fromWall = wallOf(first.startMs);
  const toWall = wallOf(last.endMs ?? nowMs);
  const spansDays = dayOf(fromWall, tzOffsetMin) !== dayOf(toWall, tzOffsetMin);
  const clock = (wallMs: number): string =>
    spansDays ? `${formatMonthDay(wallMs, tzOffsetMin)} ${formatClock(wallMs, tzOffsetMin)}` : formatClock(wallMs, tzOffsetMin);
  const range = `${formatDate(fromWall, tzOffsetMin)} ${formatClock(fromWall, tzOffsetMin)}–${
    spansDays ? `${formatDate(toWall, tzOffsetMin)} ` : ""
  }${formatClock(toWall, tzOffsetMin)}`;

  const totals = totalsOf(view, nowMs);
  const rows = totals.rows.map(
    (row) => `| ${nameOf({ kind: "work", label: row.label })} | ${formatDuration(row.ms)} | ${Math.round(row.ratio * 100)}% |`,
  );
  const timeline = view.segments.map((g) => {
    const end = g.endMs === null ? "" : clock(wallOf(g.endMs));
    const mark = g.endMs === null ? MARKDOWN_TEXT.running : g.autoClosed ? MARKDOWN_TEXT.autoClosed : "";
    return `- ${clock(wallOf(g.startMs))}–${end} ${nameOf(g)}${mark}`;
  });

  return [
    `## ${MARKDOWN_TEXT.heading}（${range}）`,
    "",
    `| ${MARKDOWN_TEXT.columns.join(" | ")} |`,
    "|---|---:|---:|",
    ...rows,
    `| ${MARKDOWN_TEXT.workTotal} | ${formatDuration(totals.workMs)} | |`,
    `| ${MARKDOWN_TEXT.break} | ${formatDuration(totals.breakMs)} | |`,
    `| ${MARKDOWN_TEXT.total} | ${formatDuration(totals.totalMs)} | |`,
    "",
    MARKDOWN_TEXT.roundingNote,
    "",
    `### ${MARKDOWN_TEXT.timeline}`,
    "",
    ...timeline,
  ].join("\n");
}
