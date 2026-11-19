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
