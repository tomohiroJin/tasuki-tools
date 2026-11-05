/**
 * チェンジで山が足りないときの切り直し（#533）。捨て札（G-5）と今捨てた札が、**渡した乱数のとおりに**並べ替えられて山へ足される。
 *
 * 乱数は決まった列を返す（`scripted`）。期待値は、その列から Fisher–Yates（i を末尾から 1 まで、j = 乱数(i + 1) の札と入れ替える）を
 * 手で追って書いた札の名前で、実装の `shuffle` を呼んで作らない。`identity`（並べ替えない）では切り直しの有無が見えない。
 *
 * 手で求めた並び（j は乱数の値。i の位置の札と j の位置の札を入れ替える。乱数は i が大きい回から順に使う）:
 * - 4 枚 [a, b, c, d]、列 [3, 1, 1] → i=3,j=3 で変わらず → i=2,j=1: [a, c, b, d] → i=1,j=1 で変わらず
 * - 4 枚 [a, b, c, d]、列 [1, 0, 0] → i=3,j=1: [a, d, c, b] → i=2,j=0: [c, d, a, b] → i=1,j=0: [d, c, a, b]
 * - 3 枚 [a, b, c]、列 [0, 1] → i=2,j=0: [c, b, a] → i=1,j=1 で変わらず
 * - 3 枚 [a, b, c]、列 [1, 1] → i=2,j=1: [a, c, b] → i=1,j=1 で変わらず
 * - 3 枚 [a, b, c]、列 [1, 0] → i=2,j=1: [a, c, b] → i=1,j=0: [c, a, b]
 * - 2 枚 [a, b]、列 [0] → i=1,j=0: [b, a]
 * - 5 枚 [a, b, c, d, e]、列 [3, 1, 2, 0] → i=4,j=3: [a, b, c, e, d] → i=3,j=1: [a, e, c, b, d] → i=2,j=2 で変わらず → i=1,j=0: [e, a, c, b, d]
 *
 * 列の組み立て: 捨て札の切り直し（:82）は 4 枚の盤面で 2 本の列（[3, 1, 1]・[1, 0, 0]）を持ち、どの回（n=4・3・2）も 2 種類の値を見る。
 * 今捨てた札の切り直し（:86）は 3 枚の盤面で、最後の回（i=1）が 0 の列と 1 の列の両方を持つ。
 * 両方の切り直しが 1 回のチェンジで続けて乱数を使う場面（山が空で捨て札 2 枚・5 枚チェンジ）も 1 本の列で確かめ、使う順（捨て札が先）を守る。
 * 各テストの末尾で列を使い切ったかも確かめる。
 *
 * 乱数が受け取る上限 n は `scripted` が見張る。n が正の整数でない・値が 0 以上 n 未満の整数でないときは例外で落ちるので、
 * `randomInt(i)`（i + 1 でない）のような取り違えは落ちる。上限を大きく取る誤り（`randomInt(i + 2)`）は、この列が返す値が同じで
 * 結果が変わらないので、このファイルでは見分けられない（`identity` を使う既存のテストが落とす）。
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
      if (!Number.isInteger(n) || n <= 0) throw new Error(`乱数の上限が正の整数でない（${next} 回目・n=${n}）`);
      if (v === undefined || !Number.isInteger(v) || v < 0 || v >= n) throw new Error(`乱数の列が合わない（${next} 回目・n=${n}）`);
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

  it('Given 山が空で捨て札が 4 枚（QS KS AS 2H） / When 2 枚チェンジ、乱数の列 [1, 0, 0] / Then 切った並び（2H AS QS KS）の上から引き、残りが山', () => {
    // 各回の値を [3, 1, 1] のテストと変える（i=3,j=1: [QS 2H AS KS] → i=2,j=0: [AS 2H QS KS] → i=1,j=0: [2H AS QS KS]）
    const game = table([], [10, 11, 12, 13]);
    const rng = scripted([1, 0, 0]);
    const next = exchangeCards(game, 'p', [0, 1], rng.randomInt)._unsafeUnwrap();
    expect(rng.used()).toBe(3);
    expect(keys(next.hands.get('p')!)).toEqual(['2H', '14S', '4S', '5S', '6S']);
    expect(keys(next.deck)).toEqual(['12S', '13S']);
    expect(keys(next.discards)).toEqual(['2S', '3S']);
  });

  it('Given 山 1 枚（7S）・捨て札 1 枚（8S） / When 3 枚チェンジ、乱数の列 [1, 0] / Then 今捨てた札を切った並び（4S 2S 3S）で引く', () => {
    // i=2,j=1: [2S 4S 3S] → i=1,j=0: [4S 2S 3S]
    const game = table([5], [6]);
    const rng = scripted([1, 0]);
    const next = exchangeCards(game, 'p', [0, 1, 2], rng.randomInt)._unsafeUnwrap();
    expect(rng.used()).toBe(2);
    expect(keys(next.hands.get('p')!)).toEqual(['7S', '8S', '4S', '5S', '6S']);
    expect(keys(next.deck)).toEqual(['2S', '3S']);
    expect(keys(next.discards)).toEqual([]);
  });

  it('Given 山が空で捨て札が 2 枚（7S 8S） / When 5 枚チェンジ（捨て札でも足りない）、乱数の列 [0, 3, 1, 2, 0] / Then 捨て札（8S 7S）→ 今捨てた札（6S 2S 4S 3S 5S）の順に、1 本の列を続けて使って引く', () => {
    // 捨て札 2 枚: i=1,j=0: [8S 7S]。今捨てた札 5 枚: i=4,j=3: [2S 3S 4S 6S 5S] → i=3,j=1: [2S 6S 4S 3S 5S] → i=2,j=2 で変わらず → i=1,j=0: [6S 2S 4S 3S 5S]
    const game = table([], [5, 6]);
    const rng = scripted([0, 3, 1, 2, 0]);
    const next = exchangeCards(game, 'p', [0, 1, 2, 3, 4], rng.randomInt)._unsafeUnwrap();
    expect(rng.used()).toBe(5);
    expect(keys(next.hands.get('p')!)).toEqual(['8S', '7S', '6S', '2S', '4S']);
    expect(keys(next.deck)).toEqual(['3S', '5S']);
    expect(keys(next.discards)).toEqual([]);
  });
});
