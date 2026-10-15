// 見積もりの割れ（#405・FR-010a）
// 数値の札の最大と最小が、デッキの並びで SPREAD_MIN_STEPS 段以上離れていたら割れたとみなす。
// 比（最大 ÷ 最小）は 0 の札で壊れ、値の差は 13 と 21 のような隣同士を割れと取り違えるので、段で数える。
// ? と ☕ は判定に入れない。判定は開票後の票から画面が計算する（wire の stats は変えない）
import { NUMBER_CARD_VALUES, type Card, type NumberCardValue } from './deck.js';
import type { VoteView } from './protocol.js';

export const SPREAD_MIN_STEPS = 2;

type NumberCard = Extract<Card, { kind: 'number' }>;

export type SpreadEnd = { card: NumberCard; participantIds: string[] };
export type Spread = { high: SpreadEnd; low: SpreadEnd };

function stepOf(value: NumberCardValue): number {
  return NUMBER_CARD_VALUES.indexOf(value);
}

function endOf(votes: readonly { participantId: string; card: NumberCard }[], value: NumberCardValue): SpreadEnd {
  return {
    card: { kind: 'number', value },
    participantIds: votes.filter((v) => v.card.value === value).map((v) => v.participantId),
  };
}

/** 割れていなければ null。割れていれば最大と最小の札と、それを出した人（票の順）を返す */
export function findSpread(votes: readonly VoteView[]): Spread | null {
  const numbers = votes.flatMap((v) => (v.card.kind === 'number' ? [{ participantId: v.participantId, card: v.card }] : []));
  if (numbers.length === 0) return null;
  const steps = numbers.map((v) => stepOf(v.card.value));
  const highStep = Math.max(...steps);
  const lowStep = Math.min(...steps);
  if (highStep - lowStep < SPREAD_MIN_STEPS) return null;
  return {
    high: endOf(numbers, NUMBER_CARD_VALUES[highStep]!),
    low: endOf(numbers, NUMBER_CARD_VALUES[lowStep]!),
  };
}
