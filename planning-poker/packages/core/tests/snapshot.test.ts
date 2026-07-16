import { describe, expect, it } from 'vitest';
import { createRoom, joinRoom } from '../src/room';
import { snapshotFor } from '../src/snapshot';

function twoPersonRoom() {
  const { room } = createRoom('room0001', 'たろう', {
    participantId: 'p-host',
    token: 'tok-host-SECRET',
  })._unsafeUnwrap();
  return joinRoom(room, 'はなこ', {
    participantId: 'p-guest',
    token: 'tok-guest-SECRET',
  })._unsafeUnwrap().room;
}

describe('snapshotFor（受信者別投影, research R1）', () => {
  it('participants に token がいかなる形でも含まれない（SC-004 の基盤）', () => {
    const snapshot = snapshotFor(twoPersonRoom(), 'p-host');
    const json = JSON.stringify(snapshot);
    expect(json).not.toContain('SECRET');
    expect(json).not.toContain('token');
  });

  it('you は受信者自身の participantId になる', () => {
    const room = twoPersonRoom();
    expect(snapshotFor(room, 'p-host').you).toBe('p-host');
    expect(snapshotFor(room, 'p-guest').you).toBe('p-guest');
  });

  it('room-state 型で voting ラウンドと参加者一覧（hasVoted 付き）を返す', () => {
    const snapshot = snapshotFor(twoPersonRoom(), 'p-guest');
    expect(snapshot.type).toBe('room-state');
    expect(snapshot.roomId).toBe('room0001');
    expect(snapshot.round).toEqual({ status: 'voting' });
    expect(snapshot.participants).toEqual([
      { id: 'p-host', name: 'たろう', isHost: true, connected: true, hasVoted: false },
      { id: 'p-guest', name: 'はなこ', isHost: false, connected: true, hasVoted: false },
    ]);
    expect(snapshot.yourVote).toBeNull();
  });
});
