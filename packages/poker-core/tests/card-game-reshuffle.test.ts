/**
 * チェンジで山が足りないときの切り直し（#533）。捨て札（G-5）と今捨てた札が、**渡した乱数のとおりに**並べ替えられて山へ足される。
 *
 * 乱数は決まった列を返す（`scripted`）。期待値は、その列から Fisher–Yates（i を末尾から 1 まで、j = 乱数(i + 1) の札と入れ替える）を
 * 手で追って書いた札の名前で、実装の `shuffle` を呼んで作らない。`identity`（並べ替えない）では切り直しの有無が見えない。
 *
 * 手で求めた並び（j は乱数の値。i の位置の札と j の位置の札を入れ替える）:
 * - 4 枚 [a, b, c, d]、列 [3, 1, 1] → i=3,j=3 で変わらず → i=2,j=1: [a, c, b, d] → i=1,j=1 で変わらず
 * - 3 枚 [a, b, c]、列 [0, 1] → i=2,j=0: [c, b, a] → i=1,j=1 で変わらず
 * - 3 枚 [a, b, c]、列 [1, 1] → i=2,j=1: [a, c, b] → i=1,j=1 で変わらず
 *
 * 列の最後（i=1 の回）も 0 でない値にして、最後の 1 回だけ乱数を捨てる書き換えを区別する。各テストの末尾で列を使い切ったかも確かめる。
 * 範囲 `[0, n)` の上限（n）は `scripted` が見張り、`randomInt(i)`（i + 1 でない）のような取り違えは例外で落ちる。
 *
 * @requirements #403 G-5
 */
import { describe, expect, it } from 'vitest';
import { exchangeCards, type CardGame } from '../src/card-game.js';
import { FULL_DECK, type PlayingCard } from '../src/playing-card.js';

const key = (c: PlayingCard) => `${c.rank}${c.suit}`;
const keys = (cards: readonly PlayingCard[]) => cards.map(key);

/** 決まった値を順に返す乱数。足りなくなったら、範囲の外を返さず落とす（想定外の呼び出しに気づく） */
function scripted(values: readonly number[]): { randomInt: (n: number) => number; used: () => number } {
  let next = 0;
  return {
    randomInt: (n) => {
      const v = values[next++];
      if (v === undefined || v >= n) throw new Error(`乱数の列が合わない（${next} 回目・n=${n}）`);
      return v;
    },
    /** これまでに呼ばれた回数。列の長さと等しければ、列を使い切っている（少なすぎる呼び出しに気づく） */
    used: () => next,
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
  it('Given 山が空で捨て札が 4 枚（QS KS AS 2H） / When 2 枚チェンジ、乱数の列 [3, 1, 1] / Then 切った並び（QS AS KS 2H）の上から引き、残りが山', () => {
    const game = table([], [10, 11, 12, 13]);
    const rng = scripted([3, 1, 1]);
    const next = exchangeCards(game, 'p', [0, 1], rng.randomInt)._unsafeUnwrap();
    expect(rng.used()).toBe(3);
    expect(keys(next.hands.get('p')!)).toEqual(['12S', '14S', '4S', '5S', '6S']);
    expect(keys(next.deck)).toEqual(['13S', '2H']);
    expect(keys(next.discards)).toEqual(['2S', '3S']);
  });

  it('Given 山が空で捨て札も空 / When 3 枚（2S 3S 4S）チェンジ、乱数の列 [0, 1] / Then 今捨てた札を切った並び（4S 3S 2S）で引く', () => {
    const game = table([], []);
    const rng = scripted([0, 1]);
    const next = exchangeCards(game, 'p', [0, 1, 2], rng.randomInt)._unsafeUnwrap();
    expect(rng.used()).toBe(2);
    expect(keys(next.hands.get('p')!)).toEqual(['4S', '3S', '2S', '5S', '6S']);
    expect(keys(next.deck)).toEqual([]);
    expect(keys(next.discards)).toEqual([]);
  });

  it('Given 山 1 枚（7S）・捨て札 1 枚（8S） / When 3 枚チェンジ、乱数の列 [1, 1] / Then 山 → 捨て札 → 今捨てた札（切った 2S 4S 3S）の順に引き、残りが山', () => {
    const game = table([5], [6]);
    const rng = scripted([1, 1]);
    const next = exchangeCards(game, 'p', [0, 1, 2], rng.randomInt)._unsafeUnwrap();
    expect(rng.used()).toBe(2);
    expect(keys(next.hands.get('p')!)).toEqual(['7S', '8S', '2S', '5S', '6S']);
    expect(keys(next.deck)).toEqual(['4S', '3S']);
    expect(keys(next.discards)).toEqual([]);
  });
});
