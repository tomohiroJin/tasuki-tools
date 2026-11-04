/**
 * チェンジの境界の値（#522）。捨て札の番号の両端と、山札が尽きるときの両端を、性質と例で守る。
 *
 * 期待値は実装の比較式を写さず、仕様（G-4〜G-6）から書く。
 * - 位置 p を捨てるのは、番号の列に p が含まれるとき（`===` で比べる。`-0` は 0 と同じ位置）。範囲外の番号は無視する
 * - 引く札は山の上から。足りなければ捨て札から、それでも足りなければ今捨てた札から引く
 * - 札は増えも減りも重なりもしない。手は 5 枚のまま
 *
 * 種と回数を固定する根拠は ISSUE #522 の共通の節。境界ちょうどの値は `fc.constantFrom` で必ず混ぜる
 * （一様な乱数だけでは山札がちょうど足りる場面を踏まない）。乱数は `identity`（並びを変えない）で決定的にする。
 *
 * @requirements #403 G-4 G-5 G-6
 */
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { HAND_SIZE, exchangeCards, type CardGame } from '../src/card-game.js';
import { FULL_DECK, type PlayingCard } from '../src/playing-card.js';

const identity = (n: number) => n - 1;
const key = (c: PlayingCard) => `${c.rank}${c.suit}`;
const keys = (cards: readonly PlayingCard[]) => cards.map(key);

/** 1 人（p）の手・山・捨て札を指定して組んだ卓。札は 52 枚の先頭から、手・山・捨て札の順に重ならず取る */
function table(deckSize: number, discardSize: number): CardGame {
  const hand = FULL_DECK.slice(0, HAND_SIZE);
  const deck = FULL_DECK.slice(HAND_SIZE, HAND_SIZE + deckSize);
  const discards = FULL_DECK.slice(HAND_SIZE + deckSize, HAND_SIZE + deckSize + discardSize);
  return {
    status: 'exchanging',
    players: ['p'],
    hands: new Map([['p', hand]]),
    exchanged: new Set(),
    deck,
    discards,
    away: new Map(),
  };
}

/** 札の全体（手・山・捨て札）の並びを問わない一覧 */
function allCards(game: CardGame): string[] {
  return [...keys(game.hands.get('p')!), ...keys(game.deck), ...keys(game.discards)].sort();
}

function exchange(game: CardGame, discard: readonly number[]): CardGame {
  return exchangeCards(game, 'p', discard, identity)._unsafeUnwrap();
}

describe('捨て札の番号の範囲（手の位置 0〜4）', () => {
  it.each([0, 1, 2, 3, 4])('位置 %i だけを選ぶと、その位置だけが替わる（両端の 0 と最後を含む）', (p) => {
    // Given 山に十分な札がある
    const game = table(10, 0);
    // When
    const next = exchange(game, [p]);
    // Then
    const before = game.hands.get('p')!;
    const after = next.hands.get('p')!;
    after.forEach((card, i) => {
      if (i === p) expect(key(card)).not.toBe(key(before[i]!));
      else expect(card).toBe(before[i]);
    });
    expect(next.discards).toEqual([before[p]]);
  });

  it.each([[-1], [5], [6], [-100]])('範囲の外の番号 %s だけを選ぶと、何も替わらず済んだと数える', (n) => {
    const game = table(10, 0);
    const next = exchange(game, [n]);
    expect(next.hands.get('p')).toEqual(game.hands.get('p'));
    expect(next.deck).toEqual(game.deck);
    expect(next.discards).toEqual([]);
    expect(next.exchanged.has('p')).toBe(true);
  });

  it.each([[1.5], [Number.NaN]])('整数でない番号 %s は、どの位置にも当たらない（何も替わらず済んだと数える）', (n) => {
    const game = table(10, 0);
    const next = exchange(game, [n]);
    expect(next.hands.get('p')).toEqual(game.hands.get('p'));
    expect(next.deck).toEqual(game.deck);
    expect(next.discards).toEqual([]);
    expect(next.exchanged.has('p')).toBe(true);
  });

  it('範囲の外の番号が混ざっても、範囲の中の番号だけが効く（-1 と 5 は隣の位置を巻き込まない）', () => {
    const game = table(10, 0);
    const next = exchange(game, [-1, 0, 4, 5]);
    const before = game.hands.get('p')!;
    expect(next.discards).toEqual([before[0], before[4]]);
    expect(next.hands.get('p')!.slice(1, 4)).toEqual(before.slice(1, 4));
  });

  it('番号の重なりは 1 回と数える（同じ位置を二重に引かない）', () => {
    const game = table(10, 0);
    const next = exchange(game, [2, 2, 2]);
    expect(next.deck).toHaveLength(9);
    expect(next.discards).toEqual([game.hands.get('p')![2]]);
  });

  it('-0 は 0 の位置を指す', () => {
    const next = exchange(table(10, 0), [-0]);
    expect(next.discards).toEqual([FULL_DECK[0]]);
  });

  it('性質: 位置 p が替わるのは、番号の列に p が含まれるときだけ（番号は境界の内外を混ぜる。種と回数を固定）', () => {
    const index = fc.oneof(fc.constantFrom(-1, 0, 1, 2, 3, 4, 5, 6, -0), fc.integer({ min: -10, max: 10 }));
    fc.assert(
      fc.property(fc.array(index, { maxLength: 8 }), (discard) => {
        const game = table(10, 0);
        const before = game.hands.get('p')!;
        const after = exchange(game, discard).hands.get('p')!;
        expect(after).toHaveLength(HAND_SIZE);
        for (let p = 0; p < HAND_SIZE; p++) {
          const chosen = discard.some((i) => i === p);
          if (chosen) expect(key(after[p]!)).not.toBe(key(before[p]!));
          else expect(after[p]).toBe(before[p]);
        }
      }),
      { seed: 522, numRuns: 200 },
    );
  });
});

describe('山札が尽きるとき（G-5・G-6）', () => {
  /**
   * 捨てる枚数 k に対し、山 D 枚・捨て札 S 枚。
   * - k <= D: 山の上から k 枚引く。残りの山は D - k 枚、捨て札は元の捨て札に今捨てた札が続く
   * - D < k <= D + S: 山を引き切り、足りない分を捨て札から引く。今捨てた札は捨て札に残る
   * - D + S < k: 山も捨て札も引き切り、足りない分は今捨てた札から引く（捨て札は空）
   */
  function expectedOutcome(k: number, D: number, S: number) {
    if (k <= D) return { deckLeft: D - k, discardsLeft: S + k };
    if (k <= D + S) return { deckLeft: D + S - k, discardsLeft: k };
    return { deckLeft: D + S, discardsLeft: 0 };
  }

  const cases: readonly { name: string; k: number; D: number; S: number }[] = [
    { name: '山がちょうど足りる（D = k）', k: 3, D: 3, S: 4 },
    { name: '山が 1 枚足りない（D = k - 1）、捨て札で足りる', k: 3, D: 2, S: 4 },
    { name: '山が 1 枚多い（D = k + 1）', k: 3, D: 4, S: 4 },
    { name: '山がちょうど足りて、捨て札が空', k: 3, D: 3, S: 0 },
    { name: '山と捨て札を合わせてちょうど足りる（D + S = k）', k: 3, D: 1, S: 2 },
    { name: '山と捨て札を合わせて 1 枚足りない（D + S = k - 1）', k: 3, D: 1, S: 1 },
    { name: '山も捨て札も空', k: 3, D: 0, S: 0 },
    { name: '山が空で、捨て札がちょうど足りる', k: 3, D: 0, S: 3 },
    { name: '5 枚全部（山 2 枚・捨て札なし。10 人が配られた直後）', k: 5, D: 2, S: 0 },
  ];

  it.each(cases)('$name: 手は 5 枚のまま、札は増減も重なりもせず、山と捨て札の枚数は仕様どおり', ({ k, D, S }) => {
    // Given
    const game = table(D, S);
    const before = allCards(game);
    // When
    const next = exchange(game, Array.from({ length: k }, (_, i) => i));
    // Then
    expect(next.hands.get('p')).toHaveLength(HAND_SIZE);
    expect(next.hands.get('p')!.every((c) => c !== undefined)).toBe(true);
    expect(allCards(next)).toEqual(before);
    const want = expectedOutcome(k, D, S);
    expect(next.deck).toHaveLength(want.deckLeft);
    expect(next.discards).toHaveLength(want.discardsLeft);
  });

  it('山で足りるときは、山の上から引き、捨て札は動かない（山 = 捨てる枚数ちょうどでも切り直さない）', () => {
    const game = table(3, 4);
    const next = exchange(game, [0, 1, 2]);
    expect(keys(next.hands.get('p')!).slice(0, 3)).toEqual(keys(game.deck));
    expect(next.deck).toEqual([]);
    expect(next.discards).toEqual([...game.discards, ...game.hands.get('p')!.slice(0, 3)]);
  });

  it('山と捨て札を合わせてちょうど足りるときは、捨て札から引き切り、今捨てた札は捨て札に残る（自分の札を引かない）', () => {
    const game = table(1, 2);
    const next = exchange(game, [0, 1, 2]);
    const drawn = keys(next.hands.get('p')!.slice(0, 3));
    expect(drawn.sort()).toEqual([...keys(game.deck), ...keys(game.discards)].sort());
    expect(next.deck).toEqual([]);
    expect(next.discards).toEqual(game.hands.get('p')!.slice(0, 3));
  });

  /** 山 D・捨て札 S の取り方。境界（山 = k、山 + 捨て札 = k、その 1 枚前後）を狙う型と、自由な型を混ぜる */
  type Shape = 'deck-over' | 'deck-exact' | 'deck-short' | 'pool-exact' | 'pool-short' | 'pool-over' | 'free';
  const SHAPES: readonly Shape[] = ['deck-over', 'deck-exact', 'deck-short', 'pool-exact', 'pool-short', 'pool-over', 'free'];
  function sizes(shape: Shape, k: number, split: number, freeD: number, freeS: number): { D: number; S: number } {
    // 山に回す枚数。山だけでは足りない 0〜k-1 枚（k = 0 のときは 0）。山 + 捨て札の合計を狙いどおりにする
    const D = k === 0 ? 0 : split % k;
    switch (shape) {
      case 'deck-over': return { D: k + 1, S: freeS };
      case 'deck-exact': return { D: k, S: freeS };
      case 'deck-short': return { D: Math.max(0, k - 1), S: freeS };
      case 'pool-exact': return { D, S: k - D };
      case 'pool-short': return { D, S: Math.max(0, k - 1 - D) };
      case 'pool-over': return { D, S: k - D + 1 };
      case 'free': return { D: freeD, S: freeS };
    }
  }

  it('性質: 山と捨て札の枚数と捨てる枚数の境界の前後で、手は 5 枚・札は保たれ・山と捨て札の枚数は仕様どおり（種と回数を固定）', () => {
    const tally = new Map<string, number>();
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: HAND_SIZE }),
        fc.constantFrom(...SHAPES),
        fc.integer({ min: 0, max: HAND_SIZE }),
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 0, max: 20 }),
        (k, shape, split, freeD, freeS) => {
          const { D, S } = sizes(shape, k, split, freeD, freeS);
          // 踏んだ境界を数える（山 D・捨て札 S・捨てる枚数 k）
          const hit = (name: string) => tally.set(name, (tally.get(name) ?? 0) + 1);
          if (k > 0 && D === k + 1) hit('deck-over');
          if (k > 0 && D === k) hit('deck-exact');
          if (D < k && D + S === k) hit('pool-exact');
          if (D + S === k - 1) hit('pool-short');
          const game = table(D, S);
          const before = allCards(game);
          const next = exchange(game, Array.from({ length: k }, (_, i) => i));
          const want = expectedOutcome(k, D, S);
          expect(next.hands.get('p')!.every((c) => c !== undefined)).toBe(true);
          expect(next.hands.get('p')).toHaveLength(HAND_SIZE);
          expect(allCards(next)).toEqual(before);
          expect(next.deck).toHaveLength(want.deckLeft);
          expect(next.discards).toHaveLength(want.discardsLeft);
          // 山と捨て札だけで足りるなら、引いた札は今捨てた札ではない
          if (k <= D + S) {
            const thrown = new Set(keys(game.hands.get('p')!.slice(0, k)));
            for (const c of next.hands.get('p')!.slice(0, k)) expect(thrown.has(key(c))).toBe(false);
          }
        },
      ),
      { seed: 522, numRuns: 300 },
    );
    // 生成器が各境界を 10 回以上踏んでいること（1 回以上では、型から外しても他の型がたまたま踏んで赤くならない。種を固定しているので回数は決まっている）
    for (const name of ['deck-over', 'deck-exact', 'pool-exact', 'pool-short']) {
      expect(tally.get(name) ?? 0, `${name} を 10 回以上踏んでいない`).toBeGreaterThanOrEqual(10);
    }
  });
});
