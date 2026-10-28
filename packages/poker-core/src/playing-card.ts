// トランプの札（#403・設計 §6.3）。見積もりの札（`deck.ts` の `Card`）とは別物で、混ぜない。

/** スート。S=スペード H=ハート D=ダイヤ C=クラブ */
export const SUITS = ['S', 'H', 'D', 'C'] as const;
export type Suit = (typeof SUITS)[number];

/** 数字。11=J 12=Q 13=K 14=A（A は役の判定でだけ 1 としても使う） */
export const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const;
export type Rank = (typeof RANKS)[number];

export interface PlayingCard {
  suit: Suit;
  rank: Rank;
}

/** 52 枚の山札（スートごとに数字の昇順） */
export const FULL_DECK: readonly PlayingCard[] = SUITS.flatMap((suit) =>
  RANKS.map((rank): PlayingCard => ({ suit, rank })),
);
