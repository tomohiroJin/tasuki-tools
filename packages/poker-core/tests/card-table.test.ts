/**
 * テーブルの状態遷移（#403・設計 §4・§6.1）。
 *
 * @requirements #403 T-3 T-6 T-7 T-8 T-9 T-10 T-11 T-12
 */
import { describe, expect, it } from 'vitest';
import {
  EMPTY_TABLE,
  HAND_SIZE,
  TABLE_MAX_SEATS,
  dealTable,
  leaveTable,
  seatAt,
  showTable,
  type CardTable,
} from '../src/card-table.js';
import {
  castVote,
  createRound,
  dealHands,
  discardVote,
  revealBy,
  setSeated,
  showHands,
  type Round,
} from '../src/round.js';
import { FULL_DECK, type PlayingCard } from '../src/playing-card.js';

/** 何もしない乱数（Fisher–Yates が並びを変えない）。配られる札が決まる */
const identity = (n: number) => n - 1;

function seated(...ids: string[]): CardTable {
  return ids.reduce((t, id) => seatAt(t, id)._unsafeUnwrap(), EMPTY_TABLE);
}

const key = (c: PlayingCard) => `${c.rank}${c.suit}`;

describe('席（#403 T-1・T-9・T-10）', () => {
  it('Given 空のテーブル / When 席に着く / Then 着いた順に並ぶ', () => {
    expect(seated('a', 'b').seats).toEqual(['a', 'b']);
  });

  it('Given 着いている人 / When もう一度着く / Then 何も変わらない', () => {
    const table = seated('a');
    expect(seatAt(table, 'a')._unsafeUnwrap()).toBe(table);
  });

  it(`Given ${TABLE_MAX_SEATS} 人が着いている / When もう 1 人着く / Then table-full`, () => {
    const table = seated(...Array.from({ length: TABLE_MAX_SEATS }, (_, i) => `p${i}`));
    expect(seatAt(table, 'late')._unsafeUnwrapErr()).toEqual({ code: 'table-full' });
    // 10 人までは 52 枚で 5 枚ずつ配れる
    expect(TABLE_MAX_SEATS * HAND_SIZE).toBeLessThanOrEqual(FULL_DECK.length);
  });

  it('Given 配られている / When 1 人が離れる / Then その人の席と手だけが消える', () => {
    const table = dealTable(seated('a', 'b'), 'a', identity)._unsafeUnwrap();
    const left = leaveTable(table, 'a');
    expect(left.seats).toEqual(['b']);
    expect([...left.hands.keys()]).toEqual(['b']);
    expect(left.status).toBe('dealt');
  });

  it('Given 配られている / When 全員が離れる / Then 最初の状態へ戻る', () => {
    const table = dealTable(seated('a'), 'a', identity)._unsafeUnwrap();
    expect(leaveTable(table, 'a')).toEqual(EMPTY_TABLE);
  });

  it('Given 手を持つ人が離れ、手の無い人だけが残る / When 離れる / Then 配る前へ戻る（見せる手が無い）', () => {
    const table = seatAt(dealTable(seated('a'), 'a', identity)._unsafeUnwrap(), 'late')._unsafeUnwrap();
    const left = leaveTable(table, 'a');
    expect(left).toEqual({ seats: ['late'], status: 'idle', hands: new Map() });
  });

  it('Given 着いていない人 / When 離れる / Then 入力と同じ値', () => {
    const table = seated('a');
    expect(leaveTable(table, 'x')).toBe(table);
  });
});

describe('配る（#403 T-3・T-6・T-8）', () => {
  it('Given 2 人 / When 配る / Then 1 人 5 枚、重複なく、席の順に山の上から配られる', () => {
    const table = dealTable(seated('a', 'b'), 'a', identity)._unsafeUnwrap();
    expect(table.status).toBe('dealt');
    expect(table.hands.get('a')).toEqual(FULL_DECK.slice(0, 5));
    expect(table.hands.get('b')).toEqual(FULL_DECK.slice(5, 10));
  });

  it('Given 10 人 / When 本物に近い乱数で配る / Then 50 枚に重複が無い', () => {
    let seed = 7;
    const lcg = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    const table = dealTable(seated(...Array.from({ length: 10 }, (_, i) => `p${i}`)), 'p0', lcg)._unsafeUnwrap();
    const all = [...table.hands.values()].flat().map(key);
    expect(all).toHaveLength(50);
    expect(new Set(all).size).toBe(50);
  });

  it('Given 乱数 / When 配る / Then 乱数が並びを決める（山を切っている）', () => {
    const last = (n: number) => (n === 52 ? 0 : n - 1); // 最初の 1 回だけ先頭と末尾を入れ替える
    const table = dealTable(seated('a'), 'a', last)._unsafeUnwrap();
    expect(table.hands.get('a')?.[0]).toEqual(FULL_DECK[51]);
  });

  it('Given 配られている / When もう一度配る / Then table-in-play で何も変えない', () => {
    const table = dealTable(seated('a'), 'a', identity)._unsafeUnwrap();
    expect(dealTable(table, 'a', identity)._unsafeUnwrapErr()).toEqual({ code: 'table-in-play' });
  });

  it('Given 見せたあと / When 配る / Then 新しい手が配られる', () => {
    const shown = showTable(dealTable(seated('a'), 'a', identity)._unsafeUnwrap(), 'a')._unsafeUnwrap();
    expect(dealTable(shown, 'a', identity)._unsafeUnwrap().status).toBe('dealt');
  });

  it('Given 着いていない人 / When 配る / Then table-not-seated', () => {
    expect(dealTable(seated('a'), 'x', identity)._unsafeUnwrapErr()).toEqual({ code: 'table-not-seated' });
  });
});

describe('見せる（#403 T-5・T-7・T-8）', () => {
  it('Given 配られている / When 見せる / Then shown になり、手は変わらない', () => {
    const dealt = dealTable(seated('a', 'b'), 'b', identity)._unsafeUnwrap();
    const shown = showTable(dealt, 'b')._unsafeUnwrap();
    expect(shown.status).toBe('shown');
    expect(shown.hands).toEqual(dealt.hands);
  });

  it('Given 配る前 / When 見せる / Then table-no-hand', () => {
    expect(showTable(seated('a'), 'a')._unsafeUnwrapErr()).toEqual({ code: 'table-no-hand' });
  });

  it('Given 見せたあと / When もう一度見せる / Then table-no-hand', () => {
    const shown = showTable(dealTable(seated('a'), 'a', identity)._unsafeUnwrap(), 'a')._unsafeUnwrap();
    expect(showTable(shown, 'a')._unsafeUnwrapErr()).toEqual({ code: 'table-no-hand' });
  });

  it('Given 着いていない人 / When 見せる / Then table-not-seated', () => {
    const dealt = dealTable(seated('a'), 'a', identity)._unsafeUnwrap();
    expect(showTable(dealt, 'x')._unsafeUnwrapErr()).toEqual({ code: 'table-not-seated' });
  });
});

describe('Round との関係（#403 T-11・T-12）', () => {
  function playing(): Round {
    const round = setSeated(setSeated(createRound(), 'a', true)._unsafeUnwrap(), 'b', true)._unsafeUnwrap();
    return dealHands(round, 'a', identity)._unsafeUnwrap();
  }

  it('Given 新しいラウンド / When 読む / Then テーブルは空', () => {
    expect(createRound().table).toEqual(EMPTY_TABLE);
  });

  it('Given 配られている / When 投票・公開する / Then テーブルは変わらない', () => {
    const round = playing();
    const voted = castVote(round, 'a', { kind: 'number', value: 3 })._unsafeUnwrap();
    const revealed = revealBy(voted, 'a', 0)._unsafeUnwrap();
    expect(revealed.table).toBe(round.table);
  });

  it('Given 投票済み / When 席・配る・見せる / Then 票と状態は変わらない', () => {
    const voted = castVote(createRound(), 'a', { kind: 'number', value: 3 })._unsafeUnwrap();
    const seatedRound = setSeated(voted, 'a', true)._unsafeUnwrap();
    const shown = showHands(dealHands(seatedRound, 'a', identity)._unsafeUnwrap(), 'a')._unsafeUnwrap();
    expect(shown.votes).toBe(voted.votes);
    expect(shown.status).toBe('voting');
  });

  it('Given 席に着いている人 / When 席を離れる（seated: false） / Then 席と手が消える', () => {
    const round = setSeated(playing(), 'a', false)._unsafeUnwrap();
    expect(round.table.seats).toEqual(['b']);
    expect(round.table.hands.has('a')).toBe(false);
  });

  it('Given 席に着いている人 / When ルームから外れる（discardVote） / Then 票と一緒に席と手も捨てる', () => {
    const round = discardVote(playing(), 'a');
    expect(round.table.seats).toEqual(['b']);
    expect(round.table.hands.has('a')).toBe(false);
  });

  it('Given 票も席も無い人 / When discardVote / Then 入力と同じ値', () => {
    const round = playing();
    expect(discardVote(round, 'x')).toBe(round);
  });
});
