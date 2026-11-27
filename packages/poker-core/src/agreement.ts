// 開票後の票の「全員一致」「全員バラバラ」（#639）
// 判定は開票後の票から画面が計算する（wire の stats・プロトコルは変えない。#405 の findSpread と同じ置き場）。
//
// - 数字の札だけで判定する。? と ☕ は見積もりの数字ではない（棄権・休憩）ので、1 枚でも混ざれば
//   一致にも、バラバラにもしない（混ざったまま「そろった」「割れた」と祝わない）
// - 札の同一性は cardKey で見る（デッキが増えても、同じ札かどうかの比べ方は変わらない・#92）
// - 一致は 2 票以上、バラバラは 3 票以上（2 人で違うのはよくあるので出さない）
// - 見学者は票を持たない（#419）。票の配列に居ない人は数えない
import { cardKey } from './deck.js';
import type { VoteView } from './protocol.js';

export const UNANIMOUS_MIN_VOTES = 2;
export const SCATTER_MIN_VOTES = 3;

/** 全員休憩（#670）の下限。1 人の休憩は「全員」と呼べないので 2 票から */
export const BREAK_MIN_VOTES = 2;
/**
 * ほぼ同じ（#670）の下限。2 票で割れるのは「一致でない」だけで、ほぼ同じとは言えない。
 * 3 票あって初めて「2 人がそろい、1 人だけ違う」が成り立つ
 */
export const NEAR_MIN_VOTES = 3;

export type Agreement = 'unanimous' | 'scattered';

/** 全員一致なら 'unanimous'、同じ札が 1 組も無ければ 'scattered'、どちらでもなければ null */
export function judgeAgreement(votes: readonly VoteView[]): Agreement | null {
  if (votes.length === 0) return null;
  // ? と ☕ が 1 枚でも混ざれば判定しない
  if (votes.some((v) => v.card.kind !== 'number')) return null;
  const distinct = new Set(votes.map((v) => cardKey(v.card))).size;
  if (distinct === 1) return votes.length >= UNANIMOUS_MIN_VOTES ? 'unanimous' : null;
  if (distinct === votes.length) return votes.length >= SCATTER_MIN_VOTES ? 'scattered' : null;
  return null;
}

/**
 * 全員休憩（#670）。全部の票が ☕ で、2 票以上。
 * ☕ は数字の見積もりではないので judgeAgreement の対象外だが、全員が休憩を選んだ回は
 * 「全員同じ」とは別の、休もうという合図として扱う。1 枚でも別の札が混ざれば偽
 */
export function judgeAllBreak(votes: readonly VoteView[]): boolean {
  if (votes.length < BREAK_MIN_VOTES) return false;
  return votes.every((v) => v.card.kind === 'coffee');
}

/**
 * ほぼ同じ（#670）。数字の札だけで 3 票以上、札がちょうど 2 種類で、片方がちょうど 1 枚。
 * - ? と ☕ は数字ではないので、1 枚でも混ざれば偽（judgeAgreement と同じ理由）
 * - **誰が違うかは返さない（名指ししない）。** 真偽だけを返し、1 人だけ違う人を画面で晒さない
 */
export function judgeNearAgreement(votes: readonly VoteView[]): boolean {
  if (votes.length < NEAR_MIN_VOTES) return false;
  if (votes.some((v) => v.card.kind !== 'number')) return false;
  const counts = new Map<string, number>();
  for (const v of votes) {
    const key = cardKey(v.card);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (counts.size !== 2) return false;
  return [...counts.values()].some((c) => c === 1);
}
