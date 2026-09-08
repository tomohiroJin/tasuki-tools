import { describe, it, expect } from 'vitest';
import { revealBy, nextRound } from '../src/round';
import { createRoom, joinRoom } from '../src/room';

/**
 * @requirements FR-009 FR-011
 */
describe('#95 S3: poker は全員が同格である', () => {
  it('作成者でない参加者が手動公開できる', () => {
    // Given
    const created = createRoom('R1', 'あかり', {
      participantId: 'p-akari',
      token: 'tok-akari',
    })._unsafeUnwrap().room;
    const room = joinRoom(created, 'みなと', {
      participantId: 'p-minato',
      token: 'tok-minato',
    })._unsafeUnwrap().room;
    const joiner = room.participants[1]!;
    // When
    // 前提のガードは置かない。落ちていれば _unsafeUnwrap が throw する（ADR-0006 決定 6 と同じ扱い）
    const revealed = revealBy(
      { ...room, round: { status: 'voting', votes: new Map() } },
      joiner.id,
    )._unsafeUnwrap();
    // Then
    expect(revealed.round.status).toBe('revealed');
  });

  it('作成者でない参加者が次のラウンドを始められる', () => {
    // Given
    const created = createRoom('R1', 'あかり', {
      participantId: 'p-akari',
      token: 'tok-akari',
    })._unsafeUnwrap().room;
    const room = joinRoom(created, 'みなと', {
      participantId: 'p-minato',
      token: 'tok-minato',
    })._unsafeUnwrap().room;
    const joiner = room.participants[1]!;
    // When
    // 前提のガードは置かない。落ちていれば _unsafeUnwrap が throw する（ADR-0006 決定 6 と同じ扱い）
    const next = nextRound(
      { ...room, round: { status: 'revealed', votes: new Map() } },
      joiner.id,
    )._unsafeUnwrap();
    // Then
    expect(next.round.status).toBe('voting');
    expect(next.round.votes.size).toBe(0);
  });
});
