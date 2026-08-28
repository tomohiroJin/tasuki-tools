// 契約シナリオ #3 #4 #5（US2: 秘匿投票と一斉公開）
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
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

  return {
    host,
    guest,
    roomId: hostJoined.roomId,
    hostId: hostJoined.participantId,
    guestId: guestJoined.participantId,
  };
}

describe('投票の秘匿（契約 #3 / SC-004）', () => {
  it('他者宛の room-state フレームに選択値が現れない', async () => {
    // Given
    const { host, guest, guestId } = await setupRoom();

    // When
    guest.send({ type: 'vote', card: { kind: 'number', value: 5 } });

    const hostState = (await host.nextMatching(isType('room-state'))) as RoomState;
    // Then
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
    // Given
    const { host, guest, hostId, guestId } = await setupRoom();

    guest.send({ type: 'vote', card: { kind: 'number', value: 5 } });
    await host.nextMatching(isType('room-state'));
    await guest.nextMatching(isType('room-state'));

    // When
    host.send({ type: 'vote', card: { kind: 'number', value: 8 } });

    // Then
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
    // Given
    const { host, guest, hostId, guestId } = await setupRoom();

    host.send({ type: 'vote', card: { kind: 'coffee' } });
    await host.nextMatching(isType('room-state'));
    await guest.nextMatching(isType('room-state'));

    // When
    host.send({ type: 'reveal' });

    const state = (await guest.nextMatching(
      (msg) => (msg as RoomState).round?.status === 'revealed',
    )) as RoomState;
    // Then
    if (state.round.status !== 'revealed') throw new Error('unreachable');
    expect(state.round.votes).toEqual([{ participantId: hostId, card: { kind: 'coffee' } }]);
    expect(state.round.votes.some((v) => v.participantId === guestId)).toBe(false);

    host.close();
    guest.close();
  });

  it('非ホストの reveal は not-host エラー', async () => {
    // Given
    const { host, guest } = await setupRoom();
    // When
    guest.send({ type: 'reveal' });
    // Then
    expect(await guest.nextMatching(isType('error'))).toMatchObject({
      type: 'error',
      code: 'not-host',
    });
    host.close();
    guest.close();
  });
});

describe('自動公開は join-room の再送で消えない（#165 レビュー）', () => {
  it(
    '片方だけが投票した状態で、もう片方が同じ socket・同じ roomId へ join-room を再送しても公開状態は維持される',
    async () => {
      // Given
      const { host, guest, roomId, guestId } = await setupRoom();

      // guest だけが投票する（host は投票しない）。shouldAutoReveal（packages/poker-core/
      // src/round.ts）は「接続中の全員が投票済み」を要求するため、この時点ではまだ voting
      guest.send({ type: 'vote', card: { kind: 'number', value: 5 } });
      await host.nextMatching(isType('room-state'));
      await guest.nextMatching(isType('room-state'));

      // When
      // host が同じ socket・同じ roomId へ join-room を再送する（二重送信・SPA 遷移）。
      // detachFromCurrentRoom は host を切断扱いにする。残る接続者は guest だけになり、
      // guest は投票済みなので shouldAutoReveal が成立し、detach の中で自動公開が起きる
      host.send({ type: 'join-room', roomId, name: 'たろう' });
      await host.nextMatching(isType('joined'));

      // Then
      // guest はこの一連の処理で room-state を 2 件受け取る:
      // 1 件目は detach による自動公開のブロードキャスト（ここで既に revealed）、
      // 2 件目は host の再 join が完了したあとの最終ブロードキャストである。
      // 本題は 2 件目（最終状態）で公開が消えていないかどうか
      const afterDetach = (await guest.nextMatching(isType('room-state'))) as RoomState;
      expect(afterDetach.round.status).toBe('revealed');

      const finalState = (await guest.nextMatching(isType('room-state'))) as RoomState;
      expect(finalState.round.status).toBe('revealed');
      if (finalState.round.status !== 'revealed') throw new Error('unreachable');
      expect(finalState.round.votes.some((v) => v.participantId === guestId)).toBe(true);

      host.close();
      guest.close();
    },
  );
});
