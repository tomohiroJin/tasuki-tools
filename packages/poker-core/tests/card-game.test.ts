/**
 * ゲームの状態遷移（#403・設計 §4 G-1〜G-9）。
 *
 * @requirements #403 G-1 G-2 G-4 G-5 G-6 G-7 G-8 G-9
 */
import { describe, expect, it } from 'vitest';
import { HAND_SIZE, MAX_PLAYERS, dealGame, dropPlayer, exchangeCards, revealIfReady, type CardGame } from '../src/card-game.js';
import { FULL_DECK, type PlayingCard } from '../src/playing-card.js';

/** 何もしない乱数（Fisher–Yates が並びを変えない）。配られる札が決まる */
const identity = (n: number) => n - 1;
const key = (c: PlayingCard) => `${c.rank}${c.suit}`;
const all = () => true;

function dealt(...players: string[]): CardGame {
  const game = dealGame(players, identity);
  if (game === null) throw new Error('配れていない');
  return game;
}

/** 札が 52 枚から欠けも重なりもしていない（手・山・捨て札の合計） */
function conserved(game: CardGame): boolean {
  const cards = [...[...game.hands.values()].flat(), ...game.deck, ...game.discards].map(key);
  return cards.length === 52 && new Set(cards).size === 52;
}

describe('配る（G-1・G-2）', () => {
  it('Given 2 人 / When 配る / Then 席順に山の上から 5 枚ずつ、残りは山', () => {
    const game = dealt('a', 'b');
    expect(game.status).toBe('exchanging');
    expect(game.players).toEqual(['a', 'b']);
    expect(game.hands.get('a')).toEqual(FULL_DECK.slice(0, 5));
    expect(game.hands.get('b')).toEqual(FULL_DECK.slice(5, 10));
    expect(game.deck).toHaveLength(52 - 10);
    expect(conserved(game)).toBe(true);
  });

  it('Given 1 人 / When 配る / Then 1 人でも同じく配る', () => {
    expect(dealt('solo').hands.get('solo')).toHaveLength(HAND_SIZE);
  });

  it(`Given ${MAX_PLAYERS + 2} 人 / When 配る / Then 先頭 ${MAX_PLAYERS} 人だけがプレイヤー`, () => {
    const ids = Array.from({ length: MAX_PLAYERS + 2 }, (_, i) => `p${i}`);
    const game = dealt(...ids);
    expect(game.players).toEqual(ids.slice(0, MAX_PLAYERS));
    expect(conserved(game)).toBe(true);
  });

  it('Given 0 人 / When 配る / Then ゲームにならない', () => {
    expect(dealGame([], identity)).toBeNull();
  });

  it('Given 乱数 / When 配る / Then 乱数が並びを決める（山を切っている）', () => {
    const swapFirst = (n: number) => (n === 52 ? 0 : n - 1);
    expect(dealGame(['a'], swapFirst)?.hands.get('a')?.[0]).toEqual(FULL_DECK[51]);
  });
});

describe('チェンジ（G-4・G-5・G-6）', () => {
  it('Given 配られた手 / When 0 番と 3 番をチェンジ / Then その位置だけが山の上の札に替わり、捨てた札は捨て札へ', () => {
    const game = dealt('a', 'b');
    const next = exchangeCards(game, 'a', [0, 3], identity)._unsafeUnwrap();
    const before = game.hands.get('a')!;
    expect(next.hands.get('a')).toEqual([FULL_DECK[10], before[1], before[2], FULL_DECK[11], before[4]]);
    expect(next.discards).toEqual([before[0], before[3]]);
    expect(next.exchanged).toEqual(new Set(['a']));
    expect(next.hands.get('b')).toBe(game.hands.get('b'));
    expect(conserved(next)).toBe(true);
  });

  it('Given 配られた手 / When 何も選ばずにチェンジ（このまま） / Then 手は変わらず、済んだと数える', () => {
    const game = dealt('a');
    const next = exchangeCards(game, 'a', [], identity)._unsafeUnwrap();
    expect(next.hands.get('a')).toEqual(game.hands.get('a'));
    expect(next.exchanged.has('a')).toBe(true);
  });

  it('Given 済んだ人 / When もう一度チェンジ / Then table-exchanged', () => {
    const once = exchangeCards(dealt('a', 'b'), 'a', [1], identity)._unsafeUnwrap();
    expect(exchangeCards(once, 'a', [2], identity)._unsafeUnwrapErr()).toEqual({ code: 'table-exchanged' });
  });

  it('Given プレイヤーでない人 / When チェンジ / Then table-not-player', () => {
    expect(exchangeCards(dealt('a'), 'x', [0], identity)._unsafeUnwrapErr()).toEqual({ code: 'table-not-player' });
  });

  it('Given 開いたあと / When チェンジ / Then table-exchanged（もう替えられない）', () => {
    const shown = revealIfReady(exchangeCards(dealt('a'), 'a', [], identity)._unsafeUnwrap(), all);
    expect(exchangeCards(shown, 'a', [0], identity)._unsafeUnwrapErr()).toEqual({ code: 'table-exchanged' });
  });

  it('Given 10 人（山は残り 2 枚） / When 全員が 5 枚ずつチェンジ / Then 捨て札を切り直して引き、52 枚は欠けも重なりもしない', () => {
    const ids = Array.from({ length: MAX_PLAYERS }, (_, i) => `p${i}`);
    let game = dealt(...ids);
    for (const id of ids) {
      game = exchangeCards(game, id, [0, 1, 2, 3, 4], identity)._unsafeUnwrap();
      expect(game.hands.get(id)).toHaveLength(HAND_SIZE);
      expect(conserved(game)).toBe(true);
    }
  });

  it('Given 9 人（山は残り 7 枚） / When 2 人が 5 枚ずつチェンジ / Then 2 人目は前の人の捨て札から引き、自分の捨てた札は引かない', () => {
    let game = dealt(...Array.from({ length: 9 }, (_, i) => `p${i}`));
    const thrownByP0 = game.hands.get('p0')!;
    game = exchangeCards(game, 'p0', [0, 1, 2, 3, 4], identity)._unsafeUnwrap();
    const thrownByP1 = game.hands.get('p1')!;
    game = exchangeCards(game, 'p1', [0, 1, 2, 3, 4], identity)._unsafeUnwrap();
    const handP1 = game.hands.get('p1')!.map(key);
    for (const c of thrownByP1) expect(handP1).not.toContain(key(c));
    expect(handP1.filter((k) => thrownByP0.map(key).includes(k)).length).toBeGreaterThan(0);
    expect(conserved(game)).toBe(true);
  });
});

describe('開く（G-7）', () => {
  it('Given 1 人だけ済んだ / When 判定 / Then まだ開かない', () => {
    const game = exchangeCards(dealt('a', 'b'), 'a', [], identity)._unsafeUnwrap();
    expect(revealIfReady(game, all)).toBe(game);
  });

  it('Given 全員が済んだ / When 判定 / Then shown になる', () => {
    let game = dealt('a', 'b');
    game = exchangeCards(game, 'a', [], identity)._unsafeUnwrap();
    game = exchangeCards(game, 'b', [4], identity)._unsafeUnwrap();
    expect(revealIfReady(game, all).status).toBe('shown');
  });

  it('Given 接続の切れた人だけが未チェンジ / When 判定 / Then 待たずに開く', () => {
    const game = exchangeCards(dealt('a', 'b'), 'a', [], identity)._unsafeUnwrap();
    expect(revealIfReady(game, (id) => id !== 'b').status).toBe('shown');
  });

  it('Given 全員の接続が切れた / When 判定 / Then 開かない（見る人が居ない）', () => {
    const game = dealt('a');
    expect(revealIfReady(game, () => false)).toBe(game);
  });
});

describe('抜ける（G-8）', () => {
  it('Given 2 人 / When 1 人が外れる / Then その人の手は捨て札へ、プレイヤーから消える', () => {
    const game = dealt('a', 'b');
    const left = dropPlayer(game, 'a');
    expect(left?.players).toEqual(['b']);
    expect(left?.hands.has('a')).toBe(false);
    expect(left && conserved(left)).toBe(true);
  });

  it('Given 1 人 / When その人が外れる / Then ゲームが終わる', () => {
    expect(dropPlayer(dealt('a'), 'a')).toBeNull();
  });

  it('Given プレイヤーでない人 / When 外れる / Then 入力と同じ値', () => {
    const game = dealt('a');
    expect(dropPlayer(game, 'x')).toBe(game);
  });
});
