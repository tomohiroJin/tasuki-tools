// 契約シナリオ #1 #2 + room-not-found（US1）
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
  token: string;
}

interface RoomState {
  type: 'room-state';
  roomId: string;
  you: string;
  participants: Array<{ id: string; name: string; isHost: boolean }>;
}

describe('create-room（契約 #1）', () => {
  it('joined と room-state（ホスト1人）が返る', async () => {
    // Given
    const host = await WsClient.connect(server.port);
    // When
    host.send({ type: 'create-room', name: 'たろう' });

    const joined = (await host.nextMatching(isType('joined'))) as Joined;
    // Then
    expect(joined.roomId).toMatch(/^[a-z0-9]{8}$/);
    expect(joined.participantId).toBeTruthy();
    expect(joined.token).toBeTruthy();

    const state = (await host.nextMatching(isType('room-state'))) as RoomState;
    expect(state.roomId).toBe(joined.roomId);
    expect(state.you).toBe(joined.participantId);
    expect(state.participants).toHaveLength(1);
    expect(state.participants[0]).toMatchObject({ name: 'たろう', isHost: true });
    host.close();
  });
});

describe('join-room（契約 #2）', () => {
  it('2人目の参加が両者の room-state に配信される', async () => {
    // Given
    const host = await WsClient.connect(server.port);
    host.send({ type: 'create-room', name: 'たろう' });
    const joined = (await host.nextMatching(isType('joined'))) as Joined;
    await host.nextMatching(isType('room-state'));

    // When
    const guest = await WsClient.connect(server.port);
    guest.send({ type: 'join-room', roomId: joined.roomId, name: 'はなこ' });

    const guestJoined = (await guest.nextMatching(isType('joined'))) as Joined;
    // Then
    expect(guestJoined.roomId).toBe(joined.roomId);
    expect(guestJoined.participantId).not.toBe(joined.participantId);

    const guestState = (await guest.nextMatching(isType('room-state'))) as RoomState;
    const hostState = (await host.nextMatching(isType('room-state'))) as RoomState;
    for (const state of [guestState, hostState]) {
      expect(state.participants).toHaveLength(2);
      expect(state.participants.map((p) => p.name)).toEqual(['たろう', 'はなこ']);
    }
    // 受信者別の you
    expect(guestState.you).toBe(guestJoined.participantId);
    expect(hostState.you).toBe(joined.participantId);

    host.close();
    guest.close();
  });

  /**
   * @requirements FR-015, US1-AS3
   */
  it('存在しない roomId は room-not-found', async () => {
    // Given
    const client = await WsClient.connect(server.port);
    // When
    client.send({ type: 'join-room', roomId: 'zzzzzzzz', name: 'はなこ' });
    // Then
    expect(await client.next()).toMatchObject({ type: 'error', code: 'room-not-found' });
    client.close();
  });
});
