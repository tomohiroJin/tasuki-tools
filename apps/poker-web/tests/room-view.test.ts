/**
 * ルーム画面の判断（#370。`pages/RoomPage.tsx` から出した純粋関数）。
 */
import { describe, expect, it } from 'vitest';
import type { RoomStateMessage } from '@tasuki/poker-core';
import { holdsSeatCard, isOffline, revealedLiveAfter, seatCardCount, revealedVoteMap, spreadPromptOf } from '../src/room-view';

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
