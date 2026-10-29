/**
 * ゲームの受信者別の投影（#403・設計 §6.3）。
 *
 * **手は開くまで本人にしか届かない**（G-3）。他の人について届くのは「チェンジを済ませたか」だけである。
 *
 * @requirements #403 G-3 G-7 G-12
 */
import { describe, expect, it } from 'vitest';
import { castVote, createRound, exchangeHand, revote, settleRound, type Round, type VoterView } from '../src/round.js';
import { createSnapshotBuilder, type ParticipantFragment } from '../src/snapshot.js';
import { FULL_DECK } from '../src/playing-card.js';

const people: ParticipantFragment[] = [
  { id: 'a', name: 'あや', connected: true },
  { id: 'b', name: 'ぶん', connected: true },
];
const voters: VoterView[] = people;
const watcher: ParticipantFragment = { id: 'c', name: 'ちえ', connected: true };
/** 何もしない乱数。a に山の 0〜4 枚目、b に 5〜9 枚目が配られる */
const identity = (n: number) => n - 1;
const view = (round: Round, viewer: string) => createSnapshotBuilder('room0001', round, [...people, watcher])(viewer);
const act = (round: Round, op: (r: Round) => Round) => settleRound(round, op(round), voters, 0, identity);

function coffeeTwice(): Round {
  const coffee = (r: Round) =>
    ['a', 'b'].reduce((x, id) => act(x, (y) => castVote(y, id, { kind: 'coffee' })._unsafeUnwrap()), r);
  return coffee(act(coffee(createRound()), (r) => revote(r, 'a')._unsafeUnwrap()));
}

describe('ゲームの投影（#403）', () => {
  it('Given ゲームが無い / When 投影する / Then table を載せない（普段のルームの wire は変わらない）', () => {
    expect('table' in view(createRound(), 'a')).toBe(false);
  });

  it('Given チェンジの最中 / When a へ投影する / Then a の手だけが届き、b の手はどこにも無い', () => {
    const snapshot = view(coffeeTwice(), 'a');
    expect(snapshot.table).toEqual({
      status: 'exchanging',
      players: [
        { participantId: 'a', exchanged: false },
        { participantId: 'b', exchanged: false },
      ],
      yourHand: FULL_DECK.slice(0, 5),
      hands: [],
    });
    const json = JSON.stringify(snapshot);
    for (const c of FULL_DECK.slice(5)) expect(json).not.toContain(JSON.stringify(c));
  });

  it('Given チェンジの最中 / When プレイヤーでない c へ投影する / Then 誰の手も、山も届かない（G-12）', () => {
    const json = JSON.stringify(view(coffeeTwice(), 'c'));
    expect(view(coffeeTwice(), 'c').table?.yourHand).toBeNull();
    for (const c of FULL_DECK) expect(json).not.toContain(JSON.stringify(c));
  });

  it('Given a だけがチェンジした / When 投影する / Then 「済んだか」だけが届く', () => {
    const round = act(coffeeTwice(), (r) => exchangeHand(r, 'a', [0], identity)._unsafeUnwrap());
    expect(view(round, 'b').table?.players).toEqual([
      { participantId: 'a', exchanged: true },
      { participantId: 'b', exchanged: false },
    ]);
  });

  it('Given 全員がチェンジした / When 投影する / Then 全員の手と役が届く。勝ち負けは載せない（G-7）', () => {
    let round = act(coffeeTwice(), (r) => exchangeHand(r, 'a', [], identity)._unsafeUnwrap());
    round = act(round, (r) => exchangeHand(r, 'b', [], identity)._unsafeUnwrap());
    const table = view(round, 'c').table;
    expect(table?.status).toBe('shown');
    // a: 2〜6 のスペード、b: 7〜J のスペード（どちらもストレートフラッシュ）
    expect(table?.hands).toEqual([
      { participantId: 'a', cards: FULL_DECK.slice(0, 5), category: 'straight-flush' },
      { participantId: 'b', cards: FULL_DECK.slice(5, 10), category: 'straight-flush' },
    ]);
    expect(Object.keys(table ?? {})).not.toContain('winners');
  });
});
