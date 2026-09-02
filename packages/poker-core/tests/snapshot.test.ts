import { describe, expect, it } from 'vitest';
import { createRoom, joinRoom } from '../src/room';
import { castVote, revealBy } from '../src/round';
import { createSnapshotBuilder } from '../src/snapshot';

/**
 * 受信者 1 人ぶんの投影を取る。
 *
 * **`createSnapshotBuilder` は公開の入口そのものである。** 以前は同じ 1 行を
 * `snapshotFor` として src 側に置いていたが、取り込んでいたのはこのテストだけで、
 * 製品コードは 1 箇所も使っていなかった（#223 で削除した）。検証している中身は
 * 変えていない —— ビルダーが返す関数を 1 回呼ぶだけで、以前と同じ値が得られる。
 */
function snapshotFor(room: Parameters<typeof createSnapshotBuilder>[0], viewerId: string) {
  return createSnapshotBuilder(room)(viewerId);
}

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
  /**
   * @requirements SC-004
   */
  it('participants に token がいかなる形でも含まれない', () => {
    // Given: twoPersonRoom() の呼び出し自体が前提の部屋を用意する
    // When
    const snapshot = snapshotFor(twoPersonRoom(), 'p-host');
    const json = JSON.stringify(snapshot);
    // Then
    expect(json).not.toContain('SECRET');
    expect(json).not.toContain('token');
  });

  it('you は受信者自身の participantId になる', () => {
    // Given
    const room = twoPersonRoom();
    // When / Then（snapshotFor は照会のみで副作用が無いため、呼び出しと検証が同じ式になる）
    expect(snapshotFor(room, 'p-host').you).toBe('p-host');
    expect(snapshotFor(room, 'p-guest').you).toBe('p-guest');
  });

  it('room-state 型で voting ラウンドと参加者一覧（hasVoted 付き）を返す', () => {
    // Given: twoPersonRoom() の呼び出し自体が前提の部屋を用意する
    // When
    const snapshot = snapshotFor(twoPersonRoom(), 'p-guest');
    // Then
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
    // Given: votedRoom() の呼び出し自体が前提の部屋を用意する
    // When
    const snapshot = snapshotFor(votedRoom(), 'p-host');
    const json = JSON.stringify(snapshot);
    // Then
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
    // Given
    let room = castVote(twoPersonRoom(), 'p-guest', five)._unsafeUnwrap();
    room = revealBy(room, 'p-host')._unsafeUnwrap();
    // When
    const snapshot = snapshotFor(room, 'p-host');
    // Then
    expect(snapshot.round.status).toBe('revealed');
    if (snapshot.round.status !== 'revealed') throw new Error('unreachable');
    expect(snapshot.round.votes).toEqual([{ participantId: 'p-guest', card: five }]);
    expect(snapshot.round.stats).toBeDefined();
  });
});
