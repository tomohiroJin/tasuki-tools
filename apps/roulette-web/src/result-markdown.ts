/**
 * 結果の Markdown（#676・FR は ISSUE #676 の決めること 1〜5）。画面の部品から切り離した純関数。
 * #671（端末の記録）も同じ「結果の形」（`RouletteResult`）を使う。
 *
 * 見出しと項目の書き方は timer のまとめ・poker の記録にそろえる（`## 見出し` の下に `- 項目：値`）。
 * 日時は書かない。ルーレットの結果は決まった時刻を持たない（wire に載らない）ので、コピーした時刻で代えない。
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

/** 結果を Markdown にする。 */
export function resultMarkdown(result: RouletteResult): string {
  const names = result.names.map(escapeName);
  const head = ['## ' + RESULT_MD_HEADING, '', '- ' + RESULT_MD_MODE + '：' + MODE_NAME[result.mode]];
  if (result.mode === 'order') {
    return [...head, '- ' + RESULT_MD_ORDER + '：', ...names.map((n, i) => `  ${i + 1}. ${n}`)].join('\n');
  }
  if (names.length === 1) return [...head, '- ' + RESULT_MD_PICKED + '：' + names[0]].join('\n');
  return [...head, '- ' + RESULT_MD_PICKED + '：', ...names.map((n, i) => `  ${i + 1}. ${n}`)].join('\n');
}
