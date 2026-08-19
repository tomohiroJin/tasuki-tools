import { describe, expect, it } from 'vitest';
import {
  createRoom,
  findParticipantByToken,
  joinRoom,
  markConnected,
  markDisconnected,
  type Room,
} from '../src/room';
import { castVote, shouldAutoReveal } from '../src/round';

const hostIds = { participantId: 'p-host', token: 'tok-host' };
const guestIds = { participantId: 'p-guest', token: 'tok-guest' };

function makeRoom(): Room {
  return createRoom('room0001', 'たろう', hostIds)._unsafeUnwrap().room;
}

describe('createRoom', () => {
  it('ホスト参加者と voting 状態のラウンドで初期化される', () => {
    const result = createRoom('room0001', 'たろう', hostIds);
    expect(result.isOk()).toBe(true);
    const { room, participant } = result._unsafeUnwrap();

    expect(room.id).toBe('room0001');
    expect(room.participants).toHaveLength(1);
    expect(participant).toMatchObject({
      id: 'p-host',
      token: 'tok-host',
      name: 'たろう',
      isHost: true,
      connected: true,
      joinOrder: 0,
    });
    expect(room.round.status).toBe('voting');
    expect(room.round.votes.size).toBe(0);
  });

  it('名前は前後の空白がトリムされる', () => {
    const { room } = createRoom('room0001', '  たろう  ', hostIds)._unsafeUnwrap();
    expect(room.participants[0]?.name).toBe('たろう');
  });

  it.each([['', '空文字'], ['   ', '空白のみ'], ['あ'.repeat(25), '25文字']])(
    '不正な名前 %s（%s）は invalid-name エラー',
    (name) => {
      const result = createRoom('room0001', name, hostIds);
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('invalid-name');
    },
  );
});

describe('joinRoom', () => {
  it('参加者が joinOrder 採番付きで追加される（非ホスト）', () => {
    const room = makeRoom();
    const result = joinRoom(room, 'はなこ', guestIds);
    expect(result.isOk()).toBe(true);
    const { room: updated, participant } = result._unsafeUnwrap();

    expect(updated.participants).toHaveLength(2);
    expect(participant).toMatchObject({
      id: 'p-guest',
      name: 'はなこ',
      isHost: false,
      connected: true,
      joinOrder: 1,
    });
  });

  it('同名の参加者を別々の参加者として許容する（Edge Case）', () => {
    const room = makeRoom();
    const r1 = joinRoom(room, 'はなこ', guestIds)._unsafeUnwrap();
    const r2 = joinRoom(r1.room, 'はなこ', { participantId: 'p-3', token: 'tok-3' })._unsafeUnwrap();

    expect(r2.room.participants).toHaveLength(3);
    const names = r2.room.participants.filter((p) => p.name === 'はなこ');
    expect(names).toHaveLength(2);
    expect(new Set(names.map((p) => p.id)).size).toBe(2);
  });

  it('不正な名前は invalid-name エラー', () => {
    const result = joinRoom(makeRoom(), '   ', guestIds);
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('invalid-name');
  });
});

/**
 * @requirements US4-AS1
 */
describe('markDisconnected（US4 / FR-012）', () => {
  function threePersonRoom(): Room {
    let room = makeRoom(); // p-host (joinOrder 0)
    room = joinRoom(room, 'はなこ', guestIds)._unsafeUnwrap().room; // p-guest (1)
    room = joinRoom(room, 'じろう', { participantId: 'p-3', token: 'tok-3' })._unsafeUnwrap().room; // p-3 (2)
    return room;
  }

  it('切断で connected=false になり、票は保持される', () => {
    let room = threePersonRoom();
    room = castVote(room, 'p-guest', { kind: 'number', value: 5 })._unsafeUnwrap();
    room = markDisconnected(room, 'p-guest');
    const guest = room.participants.find((p) => p.id === 'p-guest');
    expect(guest?.connected).toBe(false);
    expect(room.round.votes.get('p-guest')).toEqual({ kind: 'number', value: 5 });
  });

  it('ホスト切断で最先着（joinOrder 最小）の接続中参加者へ権限が移る', () => {
    const room = markDisconnected(threePersonRoom(), 'p-host');
    const hosts = room.participants.filter((p) => p.isHost);
    expect(hosts).toHaveLength(1);
    expect(hosts[0]?.id).toBe('p-guest'); // joinOrder 1 が最先着
  });

  it('ホスト以外の切断では権限は移動しない', () => {
    const room = markDisconnected(threePersonRoom(), 'p-3');
    expect(room.participants.find((p) => p.isHost)?.id).toBe('p-host');
  });

  it('未投票者の切断で全員投票が成立しうる', () => {
    let room = threePersonRoom();
    room = castVote(room, 'p-host', { kind: 'number', value: 5 })._unsafeUnwrap();
    room = castVote(room, 'p-guest', { kind: 'number', value: 8 })._unsafeUnwrap();
    expect(shouldAutoReveal(room)).toBe(false);
    room = markDisconnected(room, 'p-3'); // 未投票の p-3 が切断
    expect(shouldAutoReveal(room)).toBe(true);
  });
});

describe('token による復帰（US4 / FR-013）', () => {
  it('findParticipantByToken で同一参加者を特定できる', () => {
    const room = joinRoom(makeRoom(), 'はなこ', guestIds)._unsafeUnwrap().room;
    expect(findParticipantByToken(room, 'tok-guest')?.id).toBe('p-guest');
    expect(findParticipantByToken(room, 'unknown')).toBeUndefined();
  });

  it('markConnected で復帰し、票と joinOrder を引き継ぐ', () => {
    let room = joinRoom(makeRoom(), 'はなこ', guestIds)._unsafeUnwrap().room;
    room = castVote(room, 'p-guest', { kind: 'coffee' })._unsafeUnwrap();
    room = markDisconnected(room, 'p-guest');
    room = markConnected(room, 'p-guest');
    const guest = room.participants.find((p) => p.id === 'p-guest');
    expect(guest?.connected).toBe(true);
    expect(guest?.joinOrder).toBe(1);
    expect(room.round.votes.get('p-guest')).toEqual({ kind: 'coffee' });
  });

  it('元ホストが復帰してもホスト権限は自動では戻らない（Edge Case）', () => {
    let room = joinRoom(makeRoom(), 'はなこ', guestIds)._unsafeUnwrap().room;
    room = markDisconnected(room, 'p-host'); // 繰上: p-guest がホストに
    room = markConnected(room, 'p-host'); // 元ホスト復帰
    expect(room.participants.find((p) => p.id === 'p-host')?.isHost).toBe(false);
    expect(room.participants.find((p) => p.id === 'p-guest')?.isHost).toBe(true);
  });
});
