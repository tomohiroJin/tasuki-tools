import { describe, expect, it } from 'vitest';
import { createRoom, joinRoom, type Room } from '../src/room';

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
