/**
 * 開いた結果を Markdown にする（#676・設計 §16）。画面（`RevealBoard`）と同じ並び・同じ粒度で書く純関数。
 *
 * - **画面に出ていない情報を足さない。** 匿名の回は人数だけ（名前は 1 文字も出さない）。名前つきの回は、
 *   画面の小札と同じ名前を山ごとに書く。誰がどれを出したかは、画面の山と同じ粒度でしか分からない
 * - 山は `orderedPiles` で札の定義の順に並べ直す（サーバーの順に頼らない）。数のやり方は画面の山の下と同じく意味を添える
 * - 時刻は引数で受ける（`Date` を読まない）。時間帯は呼ぶ側が UTC からの進み（分）で渡す。日付の計算は
 *   track-core の `toMarkdown` と同じ手順（先発グレゴリオ暦）。見出しは poker の記録（`## …の記録`）と同じ段
 * - 名前は Markdown の本文として安全にする（poker の記録の題と同じ逃がし方に、表の区切り `|` を足す。改行は空白 1 つ）
 */
import { METHODS, type MethodId, type PileView, type Visibility } from '@tasuki/checkin-core';
import { MD_HEADING, MD_VISIBILITY_LABEL, SIDE_LABEL, VISIBILITY_LABEL, mdPeople } from './copy';
import { METHOD_COPY } from './method-copy';
import { NUMERIC_METHODS, orderedPiles, summaryLine } from './reveal-view';

const MS_PER_MIN = 60_000;
const MS_PER_DAY = 24 * 60 * MS_PER_MIN;
const pad2 = (n: number): string => String(n).padStart(2, '0');

/** 日の通し番号（1970-01-01 を 0 とする）を暦の年月日にする（Howard Hinnant の days-to-civil の手順）。 */
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

/** `2026-11-23 19:15`（分未満は切り捨て）。 */
function formatDateTime(wallMs: number, tzOffsetMin: number): string {
  const local = wallMs + tzOffsetMin * MS_PER_MIN;
  const day = Math.floor(local / MS_PER_DAY);
  const minuteOfDay = Math.floor((local - day * MS_PER_DAY) / MS_PER_MIN);
  const { year, month, date } = civilOf(day);
  return `${year}-${pad2(month)}-${pad2(date)} ${pad2(Math.floor(minuteOfDay / 60))}:${pad2(minuteOfDay % 60)}`;
}

/**
 * 名前を Markdown の本文として安全にする。強調・リンク・見出し・HTML・表に読まれる記号を逃がし、改行は空白にする。
 * 行頭の `-` `+` と「数字 + `)`」は入れ子の箇条書き・番号付きの列に読まれるので逃がす（`.` は逃がすので `1.` は列にならない。`)` 側は行頭の数字の直後だけ逃がす）。
 */
export function escapeName(name: string): string {
  return name
    .replace(/\s*[\r\n\u2028\u2029]+\s*/g, ' ')
    .trim()
    .replace(/[\\`*_[\]<>#~&!.:@|]/g, '\\$&')
    .replace(/^[-+]/, '\\$&')
    .replace(/^(\d+)\)/, '$1\\)');
}

export interface RevealMarkdownInput {
  method: MethodId;
  visibility: Visibility;
  piles: readonly PileView[];
  /** 書き出す時刻（epoch ms）。純関数に保つため呼ぶ側が渡す */
  nowMs: number;
  /** UTC からの進み（分。日本時間は 540） */
  tzOffsetMin: number;
}

export function revealMarkdown({ method, visibility, piles, nowMs, tzOffsetMin }: RevealMarkdownInput): string {
  const ordered = orderedPiles(method, piles);
  const copy = METHOD_COPY[method];
  const numeric = NUMERIC_METHODS.has(method);
  const rows = ordered.flatMap((pile) => {
    const card = copy.cards[pile.card];
    const label = card === undefined ? pile.card : numeric ? `${card.name}（${card.meaning}）` : card.name;
    // 匿名の回は、山が名前を持っていても書かない（サーバーは送らないが、ここでも守る）
    const names = visibility === 'named' ? (pile.names ?? []) : [];
    return [`- ${label}: ${mdPeople(pile.count)}`, ...names.map((name) => `  - ${escapeName(name)}`)];
  });
  return [
    `## ${MD_HEADING}（${formatDateTime(nowMs, tzOffsetMin)}）`,
    '',
    `### ${SIDE_LABEL[METHODS[method].side]}: ${copy.title}`,
    '',
    `${MD_VISIBILITY_LABEL}: ${VISIBILITY_LABEL[visibility]}`,
    '',
    ...rows,
    '',
    summaryLine(method, ordered),
  ].join('\n');
}
