// 契約シナリオ #3 #4 #5（US2: 秘匿投票と一斉公開）
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer, WsClient, isType, type TestServer } from './helpers';

let server: TestServer;

beforeAll(async () => {
  server = await startServer();
});

afterAll(async () => {
  await server.stop();
});

interface Joined {
  type: 'joined';
  roomId: string;
  participantId: string;
}

interface RoomState {
  type: 'room-state';
  you: string;
  participants: Array<{ id: string; hasVoted: boolean }>;
  round:
    | { status: 'voting' }
    | {
        status: 'revealed';
        votes: Array<{ participantId: string; card: unknown }>;
        stats: unknown;
      };
  yourVote: unknown;
}

/** ホスト+ゲストの2人ルームを作る */
async function setupRoom() {
  const host = await WsClient.connect(server.port);
  host.send({ type: 'create-room', name: 'たろう' });
  const hostJoined = (await host.nextMatching(isType('joined'))) as Joined;
  await host.nextMatching(isType('room-state'));

  const guest = await WsClient.connect(server.port);
  guest.send({ type: 'join-room', roomId: hostJoined.roomId, name: 'はなこ' });
  const guestJoined = (await guest.nextMatching(isType('joined'))) as Joined;
  await guest.nextMatching(isType('room-state'));
  await host.nextMatching(isType('room-state'));

  return { host, guest, hostId: hostJoined.participantId, guestId: guestJoined.participantId };
}

describe('投票の秘匿（契約 #3 / SC-004）', () => {
  it('他者宛の room-state フレームに選択値が現れない', async () => {
    const { host, guest, guestId } = await setupRoom();

    guest.send({ type: 'vote', card: { kind: 'number', value: 5 } });

    const hostState = (await host.nextMatching(isType('room-state'))) as RoomState;
    // ホスト宛フレームにカード表現が一切含まれない（hasVoted のみ）
    expect(JSON.stringify(hostState)).not.toContain('"kind"');
    expect(hostState.participants.find((p) => p.id === guestId)?.hasVoted).toBe(true);
    expect(hostState.round.status).toBe('voting');

    // 投票者本人には yourVote が返る
    const guestState = (await guest.nextMatching(isType('room-state'))) as RoomState;
    expect(guestState.yourVote).toEqual({ kind: 'number', value: 5 });

    host.close();
    guest.close();
  });
});

describe('全員投票で自動公開（契約 #4 / FR-008）', () => {
  it('最後の1人が投票すると両者に revealed が配信される', async () => {
    const { host, guest, hostId, guestId } = await setupRoom();

    guest.send({ type: 'vote', card: { kind: 'number', value: 5 } });
    await host.nextMatching(isType('room-state'));
    await guest.nextMatching(isType('room-state'));

    host.send({ type: 'vote', card: { kind: 'number', value: 8 } });

    for (const client of [host, guest]) {
      const state = (await client.nextMatching(
        (msg) => (msg as RoomState).round?.status === 'revealed',
      )) as RoomState;
      if (state.round.status !== 'revealed') throw new Error('unreachable');
      expect(state.round.votes).toEqual(
        expect.arrayContaining([
          { participantId: guestId, card: { kind: 'number', value: 5 } },
          { participantId: hostId, card: { kind: 'number', value: 8 } },
        ]),
      );
      expect(state.round.stats).toBeDefined();
    }

    host.close();
    guest.close();
  });
});

describe('ホストの手動公開（契約 #5 / FR-009）', () => {
  it('投票途中でも公開でき、未投票者は votes に含まれない', async () => {
    const { host, guest, hostId, guestId } = await setupRoom();

    host.send({ type: 'vote', card: { kind: 'coffee' } });
    await host.nextMatching(isType('room-state'));
    await guest.nextMatching(isType('room-state'));

    host.send({ type: 'reveal' });

    const state = (await guest.nextMatching(
      (msg) => (msg as RoomState).round?.status === 'revealed',
    )) as RoomState;
    if (state.round.status !== 'revealed') throw new Error('unreachable');
    expect(state.round.votes).toEqual([{ participantId: hostId, card: { kind: 'coffee' } }]);
    expect(state.round.votes.some((v) => v.participantId === guestId)).toBe(false);

    host.close();
    guest.close();
  });

  it('非ホストの reveal は not-host エラー', async () => {
    const { host, guest } = await setupRoom();
    guest.send({ type: 'reveal' });
    expect(await guest.nextMatching(isType('error'))).toMatchObject({
      type: 'error',
      code: 'not-host',
    });
    host.close();
    guest.close();
  });
});
