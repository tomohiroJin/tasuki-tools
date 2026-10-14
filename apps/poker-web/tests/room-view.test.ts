/**
 * ルーム画面の判断（#370。`pages/RoomPage.tsx` から出した純粋関数）。
 */
import { describe, expect, it } from 'vitest';
import type { RoomStateMessage } from '@tasuki/poker-core';
import { isOffline, revealedLiveAfter, revealedVoteMap } from '../src/room-view';

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
