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
  participants: Array<{ id: string; connected: boolean; hasVoted: boolean }>;
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

describe('join-room の再送は他の参加者に影響しない（#171）', () => {
  it(
    '片方だけが投票した状態で、もう片方が同じ socket・同じ roomId へ join-room を再送しても、切断扱いにならず自動公開も走らない',
    async () => {
      // Given
      const { host, guest, roomId, hostId, guestId } = await setupRoom();

      // guest だけが投票する（host は投票しない）。shouldAutoReveal（packages/poker-core/
      // src/round.ts）は「接続中の全員が投票済み」を要求するため、この時点ではまだ voting
      guest.send({ type: 'vote', card: { kind: 'number', value: 5 } });
      await host.nextMatching(isType('room-state'));
      await guest.nextMatching(isType('room-state'));

      // When
      // host が同じ socket・同じ roomId へ join-room を再送する（二重送信・SPA 遷移）
      host.send({ type: 'join-room', roomId, name: 'たろう' });
      await host.nextMatching(isType('joined'));

      // Then: guest が受け取るのは再 join 完了後のスナップショット 1 件だけで、
      // host は接続中のまま・ラウンドは voting のままである。
      //
      // **#171 の前はここが違った。** 再送はまず host を切り離していたので、
      // 残る接続者（guest）が投票済みという理由で自動公開が成立し、
      // guest には revealed のスナップショットが届いていた。**再送しただけで
      // 他人の票が公開される**のは、この経路が持っていたもう 1 つの副作用である。
      // 当時のテスト（#165 レビュー）はその自動公開が後続の書き戻しで消えないことを
      // 固定していたが、冪等化で自動公開自体が起きなくなったため、
      // 「再送は他の参加者から見て何も起こさない」を固定する形へ変えた
      const state = (await guest.nextMatching(isType('room-state'))) as RoomState;
      expect(state.round.status).toBe('voting');
      expect(state.participants.find((p) => p.id === hostId)?.connected).toBe(true);
      expect(state.participants.find((p) => p.id === guestId)?.hasVoted).toBe(true);

      // And: 自動公開の仕組み自体は生きている（host が投票すれば全員投票で公開される）
      host.send({ type: 'vote', card: { kind: 'number', value: 8 } });
      const revealed = (await guest.nextMatching(
        (msg) => (msg as RoomState).round?.status === 'revealed',
      )) as RoomState;
      if (revealed.round.status !== 'revealed') throw new Error('unreachable');
      expect(revealed.round.votes.some((v) => v.participantId === guestId)).toBe(true);

      host.close();
      guest.close();
    },
  );
});
