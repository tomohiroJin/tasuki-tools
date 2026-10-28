// 5 枚の役の判定（#403・設計 §6）。サーバーが見せるときにだけ呼ぶ（画面へは分類だけが届く）。
import type { PlayingCard } from './playing-card.js';

/** 役の分類。**弱い順**（添字がそのまま強さ） */
export const HAND_CATEGORIES = [
  'high-card',
  'one-pair',
  'two-pair',
  'three-of-a-kind',
  'straight',
  'flush',
  'full-house',
  'four-of-a-kind',
  'straight-flush',
  'royal-flush',
] as const;
export type HandCategory = (typeof HAND_CATEGORIES)[number];

export interface HandValue {
  category: HandCategory;
  /** 同じ役の中で比べる数字の並び（強い順に先頭から比べる） */
  ranks: readonly number[];
}

/**
 * 5 枚の役を判定する。
 *
 * 数字は「枚数の多い順、同じ枚数なら数字の大きい順」に並べる。これだけで、ペア・ツーペア・
 * フルハウスなどの同じ役どうしは並びを先頭から比べれば決まる。A-2-3-4-5 のストレートは 5 高として扱う。
 */
export function evaluateHand(cards: readonly PlayingCard[]): HandValue {
  const counts = new Map<number, number>();
  for (const card of cards) counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  const groups = [...counts.entries()].sort(([ra, ca], [rb, cb]) => cb - ca || rb - ra);
  const ranks = groups.map(([rank]) => rank);
  const shape = groups.map(([, count]) => count).join('');

  const flush = cards.every((card) => card.suit === cards[0]?.suit);
  const straightHigh = straightHighOf(ranks);

  if (straightHigh !== null && flush) {
    return { category: straightHigh === 14 ? 'royal-flush' : 'straight-flush', ranks: [straightHigh] };
  }
  if (shape === '41') return { category: 'four-of-a-kind', ranks };
  if (shape === '32') return { category: 'full-house', ranks };
  if (flush) return { category: 'flush', ranks };
  if (straightHigh !== null) return { category: 'straight', ranks: [straightHigh] };
  if (shape === '311') return { category: 'three-of-a-kind', ranks };
  if (shape === '221') return { category: 'two-pair', ranks };
  if (shape === '2111') return { category: 'one-pair', ranks };
  return { category: 'high-card', ranks };
}

/** 重複の無い 5 つの数字（降順）がストレートなら最も高い数字を返す。A-2-3-4-5 は 5 */
function straightHighOf(ranks: readonly number[]): number | null {
  if (ranks.length !== 5) return null;
  const [high, , , , low] = ranks as [number, number, number, number, number];
  if (high - low === 4) return high;
  if (high === 14 && ranks[1] === 5 && low === 2) return 5;
  return null;
}

/** a が強ければ正、弱ければ負、同じ強さなら 0 */
export function compareHands(a: HandValue, b: HandValue): number {
  const byCategory = HAND_CATEGORIES.indexOf(a.category) - HAND_CATEGORIES.indexOf(b.category);
  if (byCategory !== 0) return byCategory;
  for (let i = 0; i < Math.max(a.ranks.length, b.ranks.length); i++) {
    const diff = (a.ranks[i] ?? 0) - (b.ranks[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
