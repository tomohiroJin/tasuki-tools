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
    // Given: 呼び出しに渡すルーム ID・名前・参加者情報自体が前提の指定を兼ねる
    // When
    const result = createRoom('room0001', 'たろう', hostIds);
    const { room, participant } = result._unsafeUnwrap();

    // Then
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
      // Given: name の各値を渡す呼び出し自体が前提の指定を兼ねる
      // When
      const result = createRoom('room0001', name, hostIds);
      // Then
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe('invalid-name');
    },
  );
});

describe('joinRoom', () => {
  it('参加者が joinOrder 採番付きで追加される（非ホスト）', () => {
    // Given
    const room = makeRoom();
    // When
    const result = joinRoom(room, 'はなこ', guestIds);
    const { room: updated, participant } = result._unsafeUnwrap();

    // Then
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
    // Given
    const room = makeRoom();
    // When
    const r1 = joinRoom(room, 'はなこ', guestIds)._unsafeUnwrap();
    const r2 = joinRoom(r1.room, 'はなこ', { participantId: 'p-3', token: 'tok-3' })._unsafeUnwrap();

    // Then
    expect(r2.room.participants).toHaveLength(3);
    const names = r2.room.participants.filter((p) => p.name === 'はなこ');
    expect(names).toHaveLength(2);
    expect(new Set(names.map((p) => p.id)).size).toBe(2);
  });

  it('不正な名前は invalid-name エラー', () => {
    // Given: makeRoom() の呼び出し自体が前提の部屋を用意しつつ、渡す不正な名前も前提の指定を兼ねる
    // When
    const result = joinRoom(makeRoom(), '   ', guestIds);
    // Then
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
    // Given
    let room = threePersonRoom();
    room = castVote(room, 'p-guest', { kind: 'number', value: 5 })._unsafeUnwrap();
    // When
    room = markDisconnected(room, 'p-guest');
    // Then
    const guest = room.participants.find((p) => p.id === 'p-guest');
    expect(guest?.connected).toBe(false);
    expect(room.round.votes.get('p-guest')).toEqual({ kind: 'number', value: 5 });
  });

  it('ホスト切断で最先着（joinOrder 最小）の接続中参加者へ権限が移る', () => {
    // Given: threePersonRoom() の呼び出し自体が前提の部屋を用意する
    // When
    const room = markDisconnected(threePersonRoom(), 'p-host');
    // Then
    const hosts = room.participants.filter((p) => p.isHost);
    expect(hosts).toHaveLength(1);
    expect(hosts[0]?.id).toBe('p-guest'); // joinOrder 1 が最先着
  });

  it('ホスト以外の切断では権限は移動しない', () => {
    const room = markDisconnected(threePersonRoom(), 'p-3');
    expect(room.participants.find((p) => p.isHost)?.id).toBe('p-host');
  });

  it('未投票者の切断で全員投票が成立しうる', () => {
    // Given
    let room = threePersonRoom();
    room = castVote(room, 'p-host', { kind: 'number', value: 5 })._unsafeUnwrap();
    room = castVote(room, 'p-guest', { kind: 'number', value: 8 })._unsafeUnwrap();
    // Then
    expect(shouldAutoReveal(room)).toBe(false);
    // When
    room = markDisconnected(room, 'p-3'); // 未投票の p-3 が切断
    // Then
    expect(shouldAutoReveal(room)).toBe(true);
  });
});

describe('token による復帰（US4 / FR-013）', () => {
  it('findParticipantByToken で同一参加者を特定できる', () => {
    // Given
    const room = joinRoom(makeRoom(), 'はなこ', guestIds)._unsafeUnwrap().room;
    // When / Then（findParticipantByToken は照会のみで副作用が無いため、呼び出しと検証が同じ式になる）
    expect(findParticipantByToken(room, 'tok-guest')?.id).toBe('p-guest');
    expect(findParticipantByToken(room, 'unknown')).toBeUndefined();
  });

  it('markConnected で復帰し、票と joinOrder を引き継ぐ', () => {
    // Given
    let room = joinRoom(makeRoom(), 'はなこ', guestIds)._unsafeUnwrap().room;
    room = castVote(room, 'p-guest', { kind: 'coffee' })._unsafeUnwrap();
    room = markDisconnected(room, 'p-guest');
    // When
    room = markConnected(room, 'p-guest');
    // Then
    const guest = room.participants.find((p) => p.id === 'p-guest');
    expect(guest?.connected).toBe(true);
    expect(guest?.joinOrder).toBe(1);
    expect(room.round.votes.get('p-guest')).toEqual({ kind: 'coffee' });
  });

  it('元ホストが復帰してもホスト権限は自動では戻らない（Edge Case）', () => {
    // Given
    let room = joinRoom(makeRoom(), 'はなこ', guestIds)._unsafeUnwrap().room;
    room = markDisconnected(room, 'p-host'); // 繰上: p-guest がホストに
    // When
    room = markConnected(room, 'p-host'); // 元ホスト復帰
    // Then
    expect(room.participants.find((p) => p.id === 'p-host')?.isHost).toBe(false);
    expect(room.participants.find((p) => p.id === 'p-guest')?.isHost).toBe(true);
  });
});
