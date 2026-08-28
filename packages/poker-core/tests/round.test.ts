import { describe, expect, it } from 'vitest';
import { createRoom, joinRoom, type Room } from '../src/room';
import { castVote, nextRound, revealBy, shouldAutoReveal, applyAutoReveal } from '../src/round';

const five = { kind: 'number', value: 5 } as const;
const eight = { kind: 'number', value: 8 } as const;

function roomWith(memberCount: 1 | 2 | 3): Room {
  let room = createRoom('room0001', 'たろう', {
    participantId: 'p1',
    token: 't1',
  })._unsafeUnwrap().room;
  if (memberCount >= 2) {
    room = joinRoom(room, 'はなこ', { participantId: 'p2', token: 't2' })._unsafeUnwrap().room;
  }
  if (memberCount >= 3) {
    room = joinRoom(room, 'じろう', { participantId: 'p3', token: 't3' })._unsafeUnwrap().room;
  }
  return room;
}

describe('castVote', () => {
  it('voting 中は投票でき、票が記録される', () => {
    const room = castVote(roomWith(2), 'p2', five)._unsafeUnwrap();
    expect(room.round.votes.get('p2')).toEqual(five);
  });

  /**
   * @requirements FR-007
   */
  it('公開前の選び直しは上書きになる', () => {
    // Given
    let room = castVote(roomWith(2), 'p2', five)._unsafeUnwrap();
    // When
    room = castVote(room, 'p2', eight)._unsafeUnwrap();
    // Then
    expect(room.round.votes.get('p2')).toEqual(eight);
    expect(room.round.votes.size).toBe(1);
  });

  it('revealed 中の投票は not-voting エラー', () => {
    // Given
    let room = roomWith(2);
    room = castVote(room, 'p1', five)._unsafeUnwrap();
    room = revealBy(room, 'p1')._unsafeUnwrap();
    // When
    const result = castVote(room, 'p2', eight);
    // Then
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('not-voting');
  });
});

describe('shouldAutoReveal / applyAutoReveal（FR-008）', () => {
  it('接続中の全参加者が投票したら自動公開の条件が成立する', () => {
    // Given
    let room = roomWith(2);
    // When
    room = castVote(room, 'p1', five)._unsafeUnwrap();
    // Then
    expect(shouldAutoReveal(room)).toBe(false);
    // When
    room = castVote(room, 'p2', eight)._unsafeUnwrap();
    // Then
    expect(shouldAutoReveal(room)).toBe(true);
    expect(applyAutoReveal(room).round.status).toBe('revealed');
  });

  it('参加者1人（ホストのみ）でも投票すれば即成立する（Edge Case）', () => {
    const room = castVote(roomWith(1), 'p1', five)._unsafeUnwrap();
    expect(shouldAutoReveal(room)).toBe(true);
  });

  it('投票中の途中参加で自動公開が保留される（Clarification Q3）', () => {
    // Given
    let room = roomWith(2);
    room = castVote(room, 'p1', five)._unsafeUnwrap();
    room = castVote(room, 'p2', eight)._unsafeUnwrap();
    // Then
    expect(shouldAutoReveal(room)).toBe(true);
    // When
    room = joinRoom(room, 'じろう', { participantId: 'p3', token: 't3' })._unsafeUnwrap().room;
    // Then
    expect(shouldAutoReveal(room)).toBe(false);
    expect(applyAutoReveal(room).round.status).toBe('voting');
  });

  it('revealed のルームでは成立しない（再公開しない）', () => {
    // Given
    let room = castVote(roomWith(1), 'p1', five)._unsafeUnwrap();
    // When
    room = applyAutoReveal(room);
    // Then
    expect(shouldAutoReveal(room)).toBe(false);
  });
});

describe('revealBy（FR-009）', () => {
  it('ホストは全員の投票を待たずに公開できる', () => {
    // Given
    let room = roomWith(2);
    room = castVote(room, 'p1', five)._unsafeUnwrap();
    // When
    const revealed = revealBy(room, 'p1')._unsafeUnwrap();
    // Then
    expect(revealed.round.status).toBe('revealed');
    expect(revealed.round.votes.size).toBe(1);
  });

  it('非ホストの公開は not-host エラー', () => {
    // Given: roomWith(2) の呼び出し自体が前提の部屋を用意する
    // When
    const result = revealBy(roomWith(2), 'p2');
    // Then
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('not-host');
  });

  it('revealed 中の再公開は not-voting エラー', () => {
    // Given
    let room = roomWith(2);
    room = revealBy(room, 'p1')._unsafeUnwrap();
    // When
    const result = revealBy(room, 'p1');
    // Then
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('not-voting');
  });
});

describe('nextRound（FR-011）', () => {
  function revealedRoom(): Room {
    let room = roomWith(2);
    room = castVote(room, 'p1', five)._unsafeUnwrap();
    room = castVote(room, 'p2', eight)._unsafeUnwrap();
    return applyAutoReveal(room);
  }

  it('revealed → voting に戻り、全票がリセットされる', () => {
    // Given: revealedRoom() の呼び出し自体が前提の部屋を用意する
    // When
    const room = nextRound(revealedRoom(), 'p1')._unsafeUnwrap();
    // Then
    expect(room.round.status).toBe('voting');
    expect(room.round.votes.size).toBe(0);
  });

  it('voting 中の next-round は not-revealed エラー', () => {
    // Given: roomWith(2) の呼び出し自体が前提の部屋を用意する
    // When
    const result = nextRound(roomWith(2), 'p1');
    // Then
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('not-revealed');
  });

  it('非ホストの next-round は not-host エラー', () => {
    // Given: revealedRoom() の呼び出し自体が前提の部屋を用意する
    // When
    const result = nextRound(revealedRoom(), 'p2');
    // Then
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('not-host');
  });
});
