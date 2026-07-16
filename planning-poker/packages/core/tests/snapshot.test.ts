import { describe, expect, it } from 'vitest';
import { createRoom, joinRoom } from '../src/room';
import { castVote, revealBy } from '../src/round';
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

describe('snapshotFor: 投票中の秘匿（SC-004 / FR-006）', () => {
  const five = { kind: 'number', value: 5 } as const;

  function votedRoom() {
    // p-guest だけが「5」に投票済みの voting 状態
    return castVote(twoPersonRoom(), 'p-guest', five)._unsafeUnwrap();
  }

  it('他者の票は hasVoted のみで、選択値がいかなる形でも含まれない', () => {
    const snapshot = snapshotFor(votedRoom(), 'p-host');
    const json = JSON.stringify(snapshot);
    expect(json).not.toContain('"kind"'); // カード表現そのものが存在しない
    const guest = snapshot.participants.find((p) => p.id === 'p-guest');
    expect(guest?.hasVoted).toBe(true);
    expect(snapshot.yourVote).toBeNull();
  });

  it('本人には yourVote として自分の票が見える', () => {
    const snapshot = snapshotFor(votedRoom(), 'p-guest');
    expect(snapshot.yourVote).toEqual(five);
  });
});

describe('snapshotFor: 公開後（FR-006 / 契約 #5）', () => {
  const five = { kind: 'number', value: 5 } as const;

  it('revealed 後は全票が votes に載り、未投票者は含まれない', () => {
    let room = castVote(twoPersonRoom(), 'p-guest', five)._unsafeUnwrap();
    room = revealBy(room, 'p-host')._unsafeUnwrap();
    const snapshot = snapshotFor(room, 'p-host');
    expect(snapshot.round.status).toBe('revealed');
    if (snapshot.round.status !== 'revealed') throw new Error('unreachable');
    expect(snapshot.round.votes).toEqual([{ participantId: 'p-guest', card: five }]);
    expect(snapshot.round.stats).toBeDefined();
  });
});
