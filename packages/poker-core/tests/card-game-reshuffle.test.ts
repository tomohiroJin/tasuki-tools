/**
 * チェンジで山が足りないときの切り直し（#533）。捨て札（G-5）と今捨てた札が、**渡した乱数のとおりに**並べ替えられて山へ足される。
 *
 * 乱数は決まった列を返す（`scripted`）。期待値は、その列から Fisher–Yates（i を末尾から 1 まで、j = 乱数(i + 1) の札と入れ替える）を
 * 手で追って書いた札の名前で、実装の `shuffle` を呼んで作らない。`identity`（並べ替えない）では切り直しの有無が見えない。
 *
 * 手で求めた並び（乱数が常に 0 のとき）:
 * - 4 枚 [a, b, c, d] → i=3: [d, b, c, a] → i=2: [c, b, d, a] → i=1: [b, c, d, a]
 * - 3 枚 [a, b, c]    → i=2: [c, b, a] → i=1: [b, c, a]
 *
 * @requirements #403 G-5
 */
import { describe, expect, it } from 'vitest';
import { exchangeCards, type CardGame } from '../src/card-game.js';
import { FULL_DECK, type PlayingCard } from '../src/playing-card.js';

const key = (c: PlayingCard) => `${c.rank}${c.suit}`;
const keys = (cards: readonly PlayingCard[]) => cards.map(key);

/** 決まった値を順に返す乱数。足りなくなったら、範囲の外を返さず落とす（想定外の呼び出しに気づく） */
function scripted(values: readonly number[]): (n: number) => number {
  let next = 0;
  return (n) => {
    const v = values[next++];
    if (v === undefined || v >= n) throw new Error(`乱数の列が合わない（${next} 回目・n=${n}）`);
    return v;
  };
}

/** 手 = 2S〜6S。山・捨て札は指定した札（FULL_DECK の添字）。 */
function table(deckAt: readonly number[], discardsAt: readonly number[]): CardGame {
  return {
    status: 'exchanging',
    players: ['p'],
    hands: new Map([['p', FULL_DECK.slice(0, 5)]]),
    exchanged: new Set(),
    deck: deckAt.map((i) => FULL_DECK[i]!),
    discards: discardsAt.map((i) => FULL_DECK[i]!),
    away: new Map(),
  };
}

describe('チェンジの切り直し（G-5）', () => {
  it('Given 山が空で捨て札が 4 枚（QS KS AS 2H） / When 2 枚チェンジ、乱数が常に 0 / Then 切った並び（KS AS 2H QS）の上から引き、残りが山', () => {
    const game = table([], [10, 11, 12, 13]);
    const next = exchangeCards(game, 'p', [0, 1], scripted([0, 0, 0]))._unsafeUnwrap();
    expect(keys(next.hands.get('p')!)).toEqual(['13S', '14S', '4S', '5S', '6S']);
    expect(keys(next.deck)).toEqual(['2H', '12S']);
    expect(keys(next.discards)).toEqual(['2S', '3S']);
  });

  it('Given 山が空で捨て札も空 / When 3 枚（2S 3S 4S）チェンジ、乱数が常に 0 / Then 今捨てた札を切った並び（3S 4S 2S）で引く', () => {
    const game = table([], []);
    const next = exchangeCards(game, 'p', [0, 1, 2], scripted([0, 0]))._unsafeUnwrap();
    expect(keys(next.hands.get('p')!)).toEqual(['3S', '4S', '2S', '5S', '6S']);
    expect(keys(next.deck)).toEqual([]);
    expect(keys(next.discards)).toEqual([]);
  });

  it('Given 山 1 枚（7S）・捨て札 1 枚（8S） / When 3 枚チェンジ、乱数が常に 0 / Then 山 → 捨て札 → 今捨てた札（切った 3S 4S 2S）の順に引き、残りが山', () => {
    const game = table([5], [6]);
    const next = exchangeCards(game, 'p', [0, 1, 2], scripted([0, 0]))._unsafeUnwrap();
    expect(keys(next.hands.get('p')!)).toEqual(['7S', '8S', '3S', '5S', '6S']);
    expect(keys(next.deck)).toEqual(['4S', '2S']);
    expect(keys(next.discards)).toEqual([]);
  });
});
