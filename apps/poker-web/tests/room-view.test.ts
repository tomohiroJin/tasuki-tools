/**
 * ルーム画面の判断（#370。`pages/RoomPage.tsx` から出した純粋関数）。
 */
import { describe, expect, it } from 'vitest';
import type { RoomStateMessage } from '@tasuki/poker-core';
import { holdsSeatCard, isOffline, revealedLiveAfter, seatCardCount, revealedVoteMap, resultsEffectOf, spreadPromptOf } from '../src/room-view';

type Round = RoomStateMessage['round'];

describe('revealedLiveAfter', () => {
  it.each([
    ['voting', 'revealed', true],
    [undefined, 'revealed', false],
    ['revealed', 'revealed', false],
    ['revealed', 'voting', false],
    ['voting', 'voting', false],
  ] as const)('%s → %s では、公開を見届けた = %s', (prev, next, expected) => {
    expect(revealedLiveAfter(prev, next)).toBe(expected);
  });
});

describe('revealedVoteMap', () => {
  it('投票中は null', () => {
    expect(revealedVoteMap({ status: 'voting' } as Round)).toBeNull();
  });

  it('公開後は、参加者の ID から札を引ける', () => {
    const card = { kind: 'number', value: 5 } as const;
    const round = { status: 'revealed', votes: [{ participantId: 'p1', card }], stats: { average: 5, modes: [card] } } as Round;
    expect(revealedVoteMap(round)).toEqual(new Map([['p1', card]]));
  });
});

describe('isOffline', () => {
  it.each([
    ['open', false],
    ['connecting', true],
    ['closed', true],
  ] as const)('%s → %s', (status, expected) => {
    expect(isOffline(status)).toBe(expected);
  });
});

describe('spreadPromptOf（#405）', () => {
  const n = (value: 2 | 3 | 5 | 8) => ({ kind: 'number', value }) as const;
  const participants = [
    { id: 'p1', name: 'あお', connected: true, hasVoted: true, spectator: false },
    { id: 'p2', name: 'きい', connected: true, hasVoted: true, spectator: false },
    { id: 'p3', name: 'しろ', connected: true, hasVoted: true, spectator: false },
  ];
  const revealed = (votes: { participantId: string; card: ReturnType<typeof n> }[]) =>
    ({ status: 'revealed', votes, stats: { average: 0, modes: [] } }) as Round;

  it('投票中は null', () => {
    expect(spreadPromptOf({ status: 'voting' } as Round, participants)).toBeNull();
  });

  it('割れていなければ null', () => {
    const round = revealed([
      { participantId: 'p1', card: n(5) },
      { participantId: 'p2', card: n(8) },
    ]);
    expect(spreadPromptOf(round, participants)).toBeNull();
  });

  it('割れていれば、最大と最小の札と出した人の表示名を返す', () => {
    const round = revealed([
      { participantId: 'p1', card: n(8) },
      { participantId: 'p2', card: n(2) },
      { participantId: 'p3', card: n(8) },
    ]);
    expect(spreadPromptOf(round, participants)).toEqual({
      high: { card: n(8), names: ['あお', 'しろ'] },
      low: { card: n(2), names: ['きい'] },
    });
  });

  it('最小の側の名前が 1 人も引けなければ null（名簿に居ない人の名前は出さない）', () => {
    const round = revealed([
      { participantId: 'p1', card: n(8) },
      { participantId: 'gone', card: n(2) },
    ]);
    expect(spreadPromptOf(round, participants)).toBeNull();
  });

  it('最大の側の名前が 1 人も引けなければ null', () => {
    const round = revealed([
      { participantId: 'gone', card: n(8) },
      { participantId: 'p2', card: n(2) },
    ]);
    expect(spreadPromptOf(round, participants)).toBeNull();
  });

  it('名簿に居ない人だけを除き、残りの名前で示す', () => {
    const round = revealed([
      { participantId: 'gone', card: n(8) },
      { participantId: 'p1', card: n(8) },
      { participantId: 'p2', card: n(2) },
    ]);
    expect(spreadPromptOf(round, participants)).toEqual({
      high: { card: n(8), names: ['あお'] },
      low: { card: n(2), names: ['きい'] },
    });
  });
});

describe('resultsEffectOf（#639）', () => {
  type Card = { kind: 'number'; value: 1 | 3 | 5 | 8 | 13 } | { kind: 'question' } | { kind: 'coffee' };
  const n = (value: 1 | 3 | 5 | 8 | 13): Card => ({ kind: 'number', value });
  const person = (id: string, over: Partial<{ connected: boolean; spectator: boolean }> = {}) => ({
    id,
    name: id,
    connected: true,
    hasVoted: true,
    spectator: false,
    ...over,
  });
  const revealed = (votes: [string, Card][]) =>
    ({
      status: 'revealed',
      votes: votes.map(([participantId, card]) => ({ participantId, card })),
      stats: { average: 0, modes: [] },
    }) as Round;
  const three = [person('a'), person('b'), person('c')];

  it('投票中は null', () => {
    expect(resultsEffectOf({ status: 'voting' } as Round, three)).toBeNull();
  });

  it('全員が同じ数字なら unanimous', () => {
    expect(resultsEffectOf(revealed([['a', n(5)], ['b', n(5)], ['c', n(5)]]), three)).toBe('unanimous');
  });

  it('同じ札が 1 組も無く 3 段以上離れていれば split（割れが先。3 枚すべて違えば必ず 3 段以上離れるので、数字だけの回では scattered は split に隠れる）', () => {
    expect(resultsEffectOf(revealed([['a', n(1)], ['b', n(5)], ['c', n(8)]]), three)).toBe('split');
  });

  it('大きく割れた（3 段以上）なら、同じ札が 2 組あっても split', () => {
    expect(resultsEffectOf(revealed([['a', n(1)], ['b', n(1)], ['c', n(13)]]), three)).toBe('split');
    expect(resultsEffectOf(revealed([['a', n(1)], ['b', n(13)]]), [person('a'), person('b')])).toBe('split');
  });

  it('3 票・2 種類で片方がちょうど 1 枚（割れてはいない）なら near。誰が違うかは返さない', () => {
    expect(resultsEffectOf(revealed([['a', n(5)], ['b', n(5)], ['c', n(8)]]), three)).toBe('near');
    expect(resultsEffectOf(revealed([['a', n(3)], ['b', n(5)], ['c', n(5)]]), three)).toBe('near');
  });

  it('2 票で違う（隣同士）なら near にしない。complete（2 人で違うのはよくある）', () => {
    expect(resultsEffectOf(revealed([['a', n(5)], ['b', n(8)]]), [person('a'), person('b')])).toBe('complete');
  });

  it('割れても近くもない（2 種類が 2 枚ずつ）なら complete（全員の投票完了。投票完了は自動で開票されるので、開票と同時に届く）', () => {
    const four = [person('a'), person('b'), person('c'), person('d')];
    expect(resultsEffectOf(revealed([['a', n(5)], ['b', n(5)], ['c', n(8)], ['d', n(8)]]), four)).toBe('complete');
  });

  it('? が混ざった near の形（5・5・?）は complete。? 入りの 4 票（5・5・8・?）も near にしない', () => {
    const four = [person('a'), person('b'), person('c'), person('d')];
    expect(resultsEffectOf(revealed([['a', n(5)], ['b', n(5)], ['c', n(8)], ['d', { kind: 'question' }]]), four)).toBe('complete');
  });

  it('☕ と数字が混ざれば break にならない（1 枚でも別の札が混ざれば complete）', () => {
    const two = [person('a'), person('b')];
    expect(resultsEffectOf(revealed([['a', { kind: 'coffee' }], ['b', n(5)]]), two)).toBe('complete');
    expect(resultsEffectOf(revealed([['a', { kind: 'coffee' }], ['b', { kind: 'coffee' }], ['c', n(5)]]), three)).toBe('complete');
  });

  it('全員が ☕（3 票）でも break。? だけの全員は break にならない', () => {
    expect(resultsEffectOf(revealed([['a', { kind: 'coffee' }], ['b', { kind: 'coffee' }], ['c', { kind: 'coffee' }]]), three)).toBe('break');
    expect(resultsEffectOf(revealed([['a', { kind: 'question' }], ['b', { kind: 'question' }]]), [person('a'), person('b')])).toBe('complete');
  });

  it('見学者の票が残っていても、接続中の投票者が全員 ☕ を出していれば break（票は卓に見える全票で判定する）', () => {
    const people = [person('a'), person('b'), person('w', { spectator: true })];
    expect(resultsEffectOf(revealed([['a', { kind: 'coffee' }], ['b', { kind: 'coffee' }]]), people)).toBe('break');
  });

  it('? が混ざれば、全員が出していても complete（一致・バラバラにはならない）', () => {
    expect(resultsEffectOf(revealed([['a', n(5)], ['b', n(5)], ['c', { kind: 'question' }]]), three)).toBe('complete');
  });

  it('接続中の投票者に出していない人が居る（手動の開票）なら null', () => {
    expect(resultsEffectOf(revealed([['a', n(5)], ['b', n(8)]]), three)).toBeNull();
  });

  it('接続中の 5 人のうち 2 人だけが同じ札を出して手動で開票したなら、unanimous にしない（全員が出した回だけ）', () => {
    const five = [person('a'), person('b'), person('c'), person('d'), person('e')];
    expect(resultsEffectOf(revealed([['a', n(5)], ['b', n(5)]]), five)).toBeNull();
  });

  it('接続中の 5 人のうち 3 人だけが違う札を出して手動で開票したなら、split にしない', () => {
    const five = [person('a'), person('b'), person('c'), person('d'), person('e')];
    expect(resultsEffectOf(revealed([['a', n(1)], ['b', n(5)], ['c', n(8)]]), five)).toBeNull();
  });

  it('接続中の 2 人が 5・8 で、切断した人が 13 を出して開票されたなら、見える 3 枚がすべて違い 3 段以上離れるので split（帯は札の事実と合う）', () => {
    const people = [person('a'), person('b'), person('c', { connected: false })];
    expect(resultsEffectOf(revealed([['a', n(5)], ['b', n(8)], ['c', n(13)]]), people)).toBe('split');
  });

  it('卓の見える札が 3 枚とも 5（切断した人の 5 を含む）なら、unanimous（見える全票で判定する）', () => {
    const people = [person('a'), person('b'), person('c', { connected: false })];
    expect(resultsEffectOf(revealed([['a', n(5)], ['b', n(5)], ['c', n(5)]]), people)).toBe('unanimous');
  });

  it('卓の見える札が 3 枚とも違う（切断した人の 13 を含む）なら、split（見える全票で判定する）', () => {
    const people = [person('a'), person('b'), person('c', { connected: false })];
    expect(resultsEffectOf(revealed([['a', n(1)], ['b', n(5)], ['c', n(13)]]), people)).toBe('split');
  });

  it('接続中の 2 人が同じ 5 で、切断した人が 13 を出していたなら、見える札は 3 段離れているので split', () => {
    const people = [person('a'), person('b'), person('c', { connected: false })];
    expect(resultsEffectOf(revealed([['a', n(5)], ['b', n(5)], ['c', n(13)]]), people)).toBe('split');
  });

  it('接続中の 3 人が 1・5・8 で、切断した人が 5 を出していたなら、見える札は 1〜8 の 3 段離れるので split', () => {
    const people = [person('a'), person('b'), person('c'), person('d', { connected: false })];
    expect(resultsEffectOf(revealed([['a', n(1)], ['b', n(5)], ['c', n(8)], ['d', n(5)]]), people)).toBe('split');
  });

  it('名簿に居ない人の票も見える札として判定に入る（接続中の 2 人と 5・5・5）', () => {
    const people = [person('a'), person('b')];
    expect(resultsEffectOf(revealed([['a', n(5)], ['b', n(5)], ['gone', n(5)]]), people)).toBe('unanimous');
  });

  it('出していない人が切断中なら、接続中の全員が出したので complete', () => {
    const people = [person('a'), person('b'), person('c', { connected: false })];
    expect(resultsEffectOf(revealed([['a', n(5)], ['b', n(8)]]), people)).toBe('complete');
  });

  it('見学者は出していなくてよい', () => {
    const people = [person('a'), person('b'), person('w', { spectator: true })];
    expect(resultsEffectOf(revealed([['a', n(5)], ['b', n(8)]]), people)).toBe('complete');
  });

  it('投票者が 1 人だけなら complete にしない（そろうも何もない）', () => {
    expect(resultsEffectOf(revealed([['a', n(5)]]), [person('a')])).toBeNull();
  });

  it('全員が ☕（2 票）なら unanimous にはならず break（全員休憩）', () => {
    expect(resultsEffectOf(revealed([['a', { kind: 'coffee' }], ['b', { kind: 'coffee' }]]), [person('a'), person('b')])).toBe('break');
  });
});

describe('holdsSeatCard / seatCardCount（#419）', () => {
  const voter = { id: 'v', name: 'v', connected: true, hasVoted: false, spectator: false };
  const watcher = { id: 'w', name: 'w', connected: true, hasVoted: false, spectator: true };
  const card = { kind: 'number', value: 5 } as const;

  it.each([
    ['投票者・投票中', voter, null, true],
    ['投票者・票なしの開票後', voter, new Map(), true],
    ['見学者・投票中', watcher, null, false],
    ['見学者・票なしの開票後', watcher, new Map(), false],
    ['見学者・票ありの開票後', watcher, new Map([['w', card]]), true],
  ] as const)('%s では、札を持つ = %s', (_label, p, votes, expected) => {
    expect(holdsSeatCard(p, votes)).toBe(expected);
  });

  it('札を持つ席だけを数える', () => {
    expect(seatCardCount([voter, watcher], new Map())).toBe(1);
    expect(seatCardCount([voter, watcher], new Map([['w', card]]))).toBe(2);
  });
});
