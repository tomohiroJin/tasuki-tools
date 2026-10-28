/**
 * 開いた後の見え方の純粋関数（#406 3.4・設計 §5）。画面（`RevealBoard`）から切り離して試験する。
 *
 * - `topCards`: 一番多い山（同数は全部）。強調の金の縁と光を当てる
 * - `summaryLine`: 山の下の 1 行の要約
 * - `revealSchedule`: 山の札が裏返る遅れ。**動きを減らす設定では全部 0**（E12）
 */
import type { CardId, MethodId, PileView } from '@tasuki/checkin-core';
import { METHOD_COPY } from './method-copy';

/** 山の札が 1 枚ずつ裏返る間隔 */
export const REVEAL_STAGGER_MS = 90;
/** 開く動き全体の上限（札が多くても 2 秒で終える・E12） */
export const REVEAL_TOTAL_MAX_MS = 2000;
/** 1 枚が裏返り終わるまで（reveal.css の配り＋裏返しと揃える） */
export const REVEAL_FLIP_MS = 850;

/** 枚数が最大（1 以上）の札を全部。全部 0 なら空 */
export function topCards(piles: readonly PileView[]): ReadonlySet<CardId> {
  const max = piles.reduce((m, p) => Math.max(m, p.count), 0);
  if (max === 0) return new Set();
  return new Set(piles.filter((p) => p.count === max).map((p) => p.card));
}

/** 例「晴れが 3 人」「晴れ・くもりが 2 人ずつ」。0 枚なら「出した人はいません」 */
export function summaryLine(method: MethodId, piles: readonly PileView[]): string {
  const top = topCards(piles);
  if (top.size === 0) return '出した人はいません';
  const names = piles.filter((p) => top.has(p.card)).map((p) => METHOD_COPY[method].cards[p.card]?.name ?? p.card);
  const count = piles.find((p) => top.has(p.card))?.count ?? 0;
  return `${names.join('・')}が ${count} 人${names.length > 1 ? 'ずつ' : ''}`;
}

/**
 * 札の裏返る遅れ（開いていく順）。間隔は 90ms。札が多くて 2 秒を超えるときは間隔を縮める。
 * `totalMs` は最後の札が裏返り終わるまで（数字と名前はそのあとに出す）。
 */
export function revealSchedule(
  cardCount: number,
  reducedMotion: boolean,
): { delaysMs: readonly number[]; totalMs: number } {
  if (cardCount <= 0) return { delaysMs: [], totalMs: 0 };
  if (reducedMotion) return { delaysMs: Array.from({ length: cardCount }, () => 0), totalMs: 0 };
  const room = REVEAL_TOTAL_MAX_MS - REVEAL_FLIP_MS;
  const step = cardCount > 1 ? Math.min(REVEAL_STAGGER_MS, room / (cardCount - 1)) : 0;
  const delaysMs = Array.from({ length: cardCount }, (_, i) => Math.round(i * step));
  return { delaysMs, totalMs: (delaysMs[cardCount - 1] ?? 0) + REVEAL_FLIP_MS };
}
