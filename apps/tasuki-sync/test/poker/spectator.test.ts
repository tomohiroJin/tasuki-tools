// 見学の配線（#419 S-1〜S-12）。set-spectator を受け、全員へ配信し、再接続でも保つ。
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
  you: string;
  participants: Array<{ id: string; connected: boolean; hasVoted: boolean; spectator?: boolean }>;
  round: { status: string };
}

const CARD = { kind: 'number', value: 5 } as const;

async function createHost(name = 'あ') {
  const client = await WsClient.connect(server.port);
  client.send({ type: 'create-room', name });
  const joined = (await client.nextMatching(isType('joined'))) as Joined;
  await client.nextMatching(isType('room-state'));
  return { client, joined };
}

async function join(roomId: string, name: string, token?: string) {
  const client = await WsClient.connect(server.port);
  client.send({ type: 'join-room', roomId, name, ...(token ? { token } : {}) });
  const joined = (await client.nextMatching(isType('joined'))) as Joined;
  await client.nextMatching(isType('room-state'));
  return { client, joined };
}

/** A・B・C の 3 人が入った部屋 */
async function threePeople() {
  const a = await createHost('あ');
  const b = await join(a.joined.roomId, 'い');
  const c = await join(a.joined.roomId, 'う');
  return { a, b, c };
}

const isRevealed = (msg: unknown) =>
  (msg as RoomState).type === 'room-state' && (msg as RoomState).round.status === 'revealed';

describe('見学（#419）', () => {
  it('見学へ移ると残りで開く', async () => {
    // Given: A・B が投票済み、C は未投票
    const { a, b, c } = await threePeople();
    a.client.send({ type: 'vote', card: CARD });
    b.client.send({ type: 'vote', card: CARD });

    // When
    c.client.send({ type: 'set-spectator', spectator: true });

    // Then: 全員に開票済みが届く
    for (const who of [a, b, c]) {
      const state = (await who.client.nextMatching(isRevealed)) as RoomState;
      expect(state.round.status).toBe('revealed');
    }
    for (const who of [a, b, c]) who.client.close();
  });

  it('見学者の票は spectating で拒まれ、状態は変わらない', async () => {
    // Given
    const { a, b, c } = await threePeople();
    c.client.send({ type: 'set-spectator', spectator: true });
    await c.client.nextMatching(
      (m) =>
        (m as RoomState).type === 'room-state' &&
        (m as RoomState).participants.find((p) => p.id === c.joined.participantId)?.spectator ===
          true,
    );

    // When
    c.client.send({ type: 'vote', card: CARD });

    // Then
    const err = (await c.client.nextMatching(isType('error'))) as { code: string };
    expect(err.code).toBe('spectating');
    for (const who of [a, b, c]) who.client.close();
  });

  it('見学の切り替えは全員へ配信される', async () => {
    // Given
    const { a, b, c } = await threePeople();

    // When
    c.client.send({ type: 'set-spectator', spectator: true });

    // Then: B の画面で C が見学
    const state = (await b.client.nextMatching(
      (m) =>
        (m as RoomState).type === 'room-state' &&
        (m as RoomState).participants.find((p) => p.id === c.joined.participantId)?.spectator ===
          true,
    )) as RoomState;
    expect(state.participants.find((p) => p.id === c.joined.participantId)?.spectator).toBe(true);
    for (const who of [a, b, c]) who.client.close();
  });

  it('見学は再接続でも保たれる', async () => {
    // Given
    const { a, b, c } = await threePeople();
    c.client.send({ type: 'set-spectator', spectator: true });
    await c.client.nextMatching(
      (m) =>
        (m as RoomState).type === 'room-state' &&
        (m as RoomState).participants.find((p) => p.id === c.joined.participantId)?.spectator ===
          true,
    );

    // When: 切断してトークンで入り直す
    c.client.close();
    const again = await WsClient.connect(server.port);
    again.send({
      type: 'join-room',
      roomId: a.joined.roomId,
      name: 'う',
      token: c.joined.token,
    });
    const state = (await again.nextMatching(isType('room-state'))) as RoomState;

    // Then
    expect(state.participants.find((p) => p.id === c.joined.participantId)?.spectator).toBe(true);
    for (const client of [a.client, b.client, again]) client.close();
  });

  it('往復: 見学した人を待たずに再投票で開く', async () => {
    // Given: A・B が投票して開票済み
    const a = await createHost('あ');
    const b = await join(a.joined.roomId, 'い');
    a.client.send({ type: 'vote', card: CARD });
    b.client.send({ type: 'vote', card: CARD });
    await a.client.nextMatching(isRevealed);

    // When: A が見学へ移り、B が再投票して投票する
    a.client.send({ type: 'set-spectator', spectator: true });
    b.client.send({ type: 'revote' });
    await b.client.nextMatching(
      (m) =>
        (m as RoomState).type === 'room-state' && (m as RoomState).round.status === 'voting',
    );
    b.client.send({ type: 'vote', card: CARD });

    // Then: A を待たずに開く
    const state = (await b.client.nextMatching(isRevealed)) as RoomState;
    expect(state.round.status).toBe('revealed');
    a.client.close();
    b.client.close();
  });
});
