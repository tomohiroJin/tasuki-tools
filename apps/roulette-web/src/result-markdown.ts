/**
 * 結果の Markdown（#676）。画面の部品から切り離した純関数。#671（端末の記録）も同じ「結果の形」（`RouletteResult`）を使う。
 *
 * 形: `## 進行役ルーレットの結果（YYYY-MM-DD HH:MM）` の下に `- 項目：値`。agenda・checkin・track の `## <見出し>（日時）` にそろえる
 * （timer のまとめは `##` の無い平文の見出しで日時なし、poker の記録は各行に時刻、と形は道具ごとに違う）。
 * **日時の意味: その端末で、その結果を最初に出した時刻。** wire は決まった時刻を持たないので本当の時刻は作れない。
 * 再読み込みした人・後から入った人では、その人が結果を出した時刻になる。
 * 時計はここで読まない（`wallMs`＝壁時計の ms・`tzOffsetMin`＝UTC からの進み・分 を呼ぶ側が渡す。`Date` を使わない）。
 * 外した人・ゲストの一覧は結果ではないので書かない。
 */
import type { RouletteMode } from '@tasuki/roulette-core';
import { MODE_ONCE, MODE_ORDER, MODE_PRESS, RESULT_MD_HEADING, RESULT_MD_MODE, RESULT_MD_ORDER, RESULT_MD_PICKED } from './copy';

/** 画面の結果の札が見せている内容（`resultOf` が画面の値から作る）。 */
export interface RouletteResult {
  /** 決め方 */
  mode: RouletteMode;
  /** 決まった人の名前。1 回で決める・押して止めるは止まった順、順番に回すは 1 番から。 */
  names: readonly string[];
  /** 回転の通し番号。次に回すと変わる（コピーの部品を作り直す鍵） */
  seq: number;
}

const MODE_NAME: Record<RouletteMode, string> = {
  once: MODE_ONCE,
  order: MODE_ORDER,
  press: MODE_PRESS,
};

/**
 * 名前を Markdown の 1 行の本文として安全にする。改行・連続する空白は 1 つの空白にし、
 * 強調・リンク・見出し・表・HTML・番号つきの列の始まりに読まれる記号を逃がす。
 * 行頭の `-`・`+` は箇条書きの始まりになるので逃がす（途中の `-` は保つ）。
 * `.`・`:`・`@` は、GFM の自動リンクが逃がした文字を行き先に飲み込まないために逃がす（poker の記録と同じ）。
 */
export function escapeName(name: string): string {
  return name
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/[\\`*_[\]<>#~&!.:@|()]/g, '\\$&')
    .replace(/^[-+]/, '\\$&');
}

const MS_PER_MIN = 60_000;
const MS_PER_DAY = 24 * 60 * MS_PER_MIN;
const pad2 = (n: number): string => String(n).padStart(2, '0');

/** 日の通し番号（1970-01-01 を 0）を暦の年月日にする（Howard Hinnant の days-to-civil。track-core の写し）。 */
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

/** `YYYY-MM-DD HH:MM`（分未満は切り捨て）。 */
export function stampText(wallMs: number, tzOffsetMin: number): string {
  const local = wallMs + tzOffsetMin * MS_PER_MIN;
  const day = Math.floor(local / MS_PER_DAY);
  const minuteOfDay = Math.floor((local - day * MS_PER_DAY) / MS_PER_MIN);
  const { year, month, date } = civilOf(day);
  return `${year}-${pad2(month)}-${pad2(date)} ${pad2(Math.floor(minuteOfDay / 60))}:${pad2(minuteOfDay % 60)}`;
}

/** 結果を Markdown にする。 */
export function resultMarkdown(result: RouletteResult, wallMs: number, tzOffsetMin: number): string {
  const names = result.names.map(escapeName);
  const head = ['## ' + RESULT_MD_HEADING + '（' + stampText(wallMs, tzOffsetMin) + '）', '', '- ' + RESULT_MD_MODE + '：' + MODE_NAME[result.mode]];
  if (result.mode === 'order') {
    return [...head, '- ' + RESULT_MD_ORDER + '：', ...names.map((n, i) => `  ${i + 1}. ${n}`)].join('\n');
  }
  if (names.length === 1) return [...head, '- ' + RESULT_MD_PICKED + '：' + names[0]].join('\n');
  return [...head, '- ' + RESULT_MD_PICKED + '：', ...names.map((n, i) => `  ${i + 1}. ${n}`)].join('\n');
}
