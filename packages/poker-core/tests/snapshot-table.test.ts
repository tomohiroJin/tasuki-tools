/**
 * テーブルの受信者別の投影（#403・設計 §6.3）。
 *
 * **手は見せるまで本人にしか届かない**（T-4）。他の人について届くのは席に着いていることだけである。
 *
 * @requirements #403 T-4 T-5
 */
import { describe, expect, it } from 'vitest';
import { createRound, dealHands, setSeated, showHands, type Round } from '../src/round.js';
import { createSnapshotBuilder, type ParticipantFragment } from '../src/snapshot.js';
import { FULL_DECK } from '../src/playing-card.js';

const people: ParticipantFragment[] = [
  { id: 'a', name: 'あや', connected: true },
  { id: 'b', name: 'ぶん', connected: true },
  { id: 'c', name: 'ちえ', connected: true },
];
/** 何もしない乱数。a に山の 0〜4 枚目、b に 5〜9 枚目が配られる */
const identity = (n: number) => n - 1;
const view = (round: Round, viewer: string) => createSnapshotBuilder('room0001', round, people)(viewer);

function seatedAB(): Round {
  return setSeated(setSeated(createRound(), 'a', true)._unsafeUnwrap(), 'b', true)._unsafeUnwrap();
}

describe('テーブルの投影（#403）', () => {
  it('Given 席が空 / When 投影する / Then table を載せない（普段のルームの wire は変わらない）', () => {
    expect('table' in view(createRound(), 'a')).toBe(false);
  });

  it('Given 配る前 / When 投影する / Then 席だけが届く', () => {
    expect(view(seatedAB(), 'a').table).toEqual({ status: 'idle', seats: ['a', 'b'], yourHand: null, hands: [], winners: [] });
  });

  it('Given 配られている / When a へ投影する / Then a の手だけが届き、b の手はどこにも無い', () => {
    const round = dealHands(seatedAB(), 'a', identity)._unsafeUnwrap();
    const snapshot = view(round, 'a');
    expect(snapshot.table).toEqual({
      status: 'dealt',
      seats: ['a', 'b'],
      yourHand: FULL_DECK.slice(0, 5),
      hands: [],
      winners: [],
    });
    // b の札はフィールド名を問わず wire に無い（見せる前の秘匿・T-4）
    const json = JSON.stringify(snapshot);
    for (const c of FULL_DECK.slice(5, 10)) expect(json).not.toContain(JSON.stringify(c));
  });

  it('Given 配られている / When 席に着いていない c へ投影する / Then 誰の手も届かない', () => {
    const round = dealHands(seatedAB(), 'a', identity)._unsafeUnwrap();
    const snapshot = view(round, 'c');
    expect(snapshot.table?.yourHand).toBeNull();
    const json = JSON.stringify(snapshot);
    for (const c of FULL_DECK.slice(0, 10)) expect(json).not.toContain(JSON.stringify(c));
  });

  it('Given 見せたあと / When 投影する / Then 全員の手・役・いちばん強い手の持ち主が届く', () => {
    // a: 2〜6 のスペード（ストレートフラッシュ）、b: 7〜J のスペード（より強いストレートフラッシュ）
    const round = showHands(dealHands(seatedAB(), 'a', identity)._unsafeUnwrap(), 'b')._unsafeUnwrap();
    const table = view(round, 'c').table;
    expect(table?.status).toBe('shown');
    expect(table?.hands).toEqual([
      { participantId: 'a', cards: FULL_DECK.slice(0, 5), category: 'straight-flush' },
      { participantId: 'b', cards: FULL_DECK.slice(5, 10), category: 'straight-flush' },
    ]);
    expect(table?.winners).toEqual(['b']);
  });

  it('Given 同じ強さの手が 2 つ / When 見せる / Then 2 人とも勝者', () => {
    // 3 枚目の席の人が配られる前に着き、乱数で a と b に同じ数字の並びを配るのは難しいので、
    // 手を直接置いたテーブルで確かめる（投影は手から役と勝者を出すだけ）
    const base = seatedAB();
    const same = (suit: 'S' | 'H') => [2, 4, 6, 8, 10].map((rank) => ({ suit, rank }) as (typeof FULL_DECK)[number]);
    const round: Round = {
      ...base,
      table: { ...base.table, status: 'shown', hands: new Map([['a', same('S')], ['b', same('H')]]) },
    };
    expect(view(round, 'a').table?.winners).toEqual(['a', 'b']);
  });

  it('Given 配ったあとに着いた人（手が無い） / When 見せる / Then その人は hands に載らない', () => {
    const dealt = dealHands(seatedAB(), 'a', identity)._unsafeUnwrap();
    const late = setSeated(dealt, 'c', true)._unsafeUnwrap();
    const table = view(showHands(late, 'a')._unsafeUnwrap(), 'c').table;
    expect(table?.seats).toEqual(['a', 'b', 'c']);
    expect(table?.hands.map((h) => h.participantId)).toEqual(['a', 'b']);
    expect(table?.yourHand).toBeNull();
  });
});
