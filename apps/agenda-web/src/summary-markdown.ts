/**
 * 終了の一覧を Markdown にする（#676）。画面の部品から切り離した純関数（#671 の端末の記録も同じ形を使う）。
 *
 * 値は画面の一覧（`SummaryTable`）と同じ計算から作る（行は agenda-core の `summaryOf`・書き方は `agenda-view.ts` の
 * `clockStyleOf`・`durationClock`・`signedDuration`・`summaryTotals`）。ここに別の計算を書かない。
 * 日時は呼ぶ側が渡す（壁時計の ms と UTC からの進み・分）。端末の時計も時間帯もここでは読まない。
 */
import { summaryOf, type AgendaView } from '@tasuki/agenda-core';
import { clockStyleOf, durationClock, signedDuration, summaryTotals } from './agenda-view';
import {
  DRIFT_LABEL,
  PAGE_HEADING,
  PLANNED_LABEL,
  ROUNDS_UNIT,
  SKIP_BUTTON,
  SPENT_LABEL,
  SUMMARY_EXTENSION_LABEL,
  SUMMARY_STEP_LABEL,
  SUMMARY_TOTAL_LABEL,
  extensionCell,
  minutesText,
  roundHeading,
} from './copy';

const MIN = 60_000;
const DAY = 24 * MIN * 60;

/** 書き出した日時。`tzOffsetMin` は UTC からの進み（分。日本時間は 540） */
export interface SummaryMoment {
  readonly wallMs: number;
  readonly tzOffsetMin: number;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/**
 * 日の通し番号（1970-01-01 を 0 とする）を暦の年月日にする（Howard Hinnant の days-to-civil）。
 * `Date` を使わないのは、純関数が環境（時計・時間帯）に触らないことを保つため。
 */
function civilOf(day: number): { year: number; month: number; date: number } {
  const z = day + 719_468;
  const era = Math.floor(z / 146_097);
  const dayOfEra = z - era * 146_097;
  const yearOfEra = Math.floor((dayOfEra - Math.floor(dayOfEra / 1_460) + Math.floor(dayOfEra / 36_524) - Math.floor(dayOfEra / 146_096)) / 365);
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const shiftedMonth = Math.floor((5 * dayOfYear + 2) / 153);
  const month = shiftedMonth < 10 ? shiftedMonth + 3 : shiftedMonth - 9;
  return { year: yearOfEra + era * 400 + (month <= 2 ? 1 : 0), month, date: dayOfYear - Math.floor((153 * shiftedMonth + 2) / 5) + 1 };
}

/** 「2026-11-23 14:05」（分未満は切り捨て） */
function dateTimeText({ wallMs, tzOffsetMin }: SummaryMoment): string {
  const local = wallMs + tzOffsetMin * MIN;
  const day = Math.floor(local / DAY);
  const minuteOfDay = Math.floor((local - day * DAY) / MIN);
  const { year, month, date } = civilOf(day);
  return `${year}-${pad2(month)}-${pad2(date)} ${pad2(Math.floor(minuteOfDay / 60))}:${pad2(minuteOfDay % 60)}`;
}

/**
 * 会の名前・ステップ名を Markdown の本文として安全にする。改行は空白 1 つにし、表の区切り（`|`）と、
 * 強調・リンク・見出し・HTML・自動リンクに読まれる記号を逃がす（poker の記録と同じ文字の集まり + `|`）。
 */
export function escapeSummaryText(text: string): string {
  return text.replace(/\s*[\r\n\u2028\u2029]+\s*/g, ' ').replace(/[\\\x60*_[\]<>#~&!.:@|]/g, '\\$&');
}

/** 表の 1 行。空の欄は空白 1 つ（`| |`）で書く */
const row = (cells: readonly string[]): string => `|${cells.map((cell) => (cell === '' ? ' ' : ` ${cell} `)).join('|')}|`;

export function summaryMarkdown(view: AgendaView, at: SummaryMoment): string {
  const summary = summaryOf(view);
  const style = clockStyleOf(view);
  const totals = summaryTotals(summary.rows);
  const withRounds = view.rounds >= 2;
  const lead = (cell: string): string[] => (withRounds ? [cell] : []);

  const header = row([...lead(ROUNDS_UNIT), SUMMARY_STEP_LABEL, PLANNED_LABEL, SUMMARY_EXTENSION_LABEL, SPENT_LABEL, DRIFT_LABEL]);
  const align = `|${withRounds ? '---|' : ''}---|---:|---:|---:|---:|`;
  const rows = summary.rows.map((r) =>
    row([
      ...lead(roundHeading(r.round)),
      escapeSummaryText(r.name),
      minutesText(r.plannedMs / MIN),
      r.extensionMs > 0 ? extensionCell(r.extensionMs / MIN) : '',
      r.skipped ? SKIP_BUTTON : durationClock(r.spentMs, style),
      signedDuration(r.diffMs, style),
    ]),
  );
  const total = row([
    ...lead(''),
    SUMMARY_TOTAL_LABEL,
    minutesText(totals.plannedMs / MIN),
    totals.extensionMs > 0 ? extensionCell(totals.extensionMs / MIN) : '',
    durationClock(totals.spentMs, style),
    signedDuration(summary.driftMs, style),
  ]);

  const title = escapeSummaryText(view.title);
  return [
    `## ${PAGE_HEADING}（${dateTimeText(at)}）`,
    '',
    ...(title === '' ? [] : [`### ${title}`, '']),
    header,
    align,
    ...rows,
    total,
  ].join('\n');
}
