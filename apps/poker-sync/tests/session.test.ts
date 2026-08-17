// レビュー指摘の修正テスト: join 済みソケットの再 join / 再 create で
// 元のルームから正しくデタッチされること（ゴースト参加者・ルームリーク防止）
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
  roomId: string;
  participants: Array<{ id: string; isHost: boolean; connected: boolean; hasVoted: boolean }>;
  round: { status: string };
}

async function createRoomOn(client: WsClient, name: string) {
  client.send({ type: 'create-room', name });
  const joined = (await client.nextMatching(isType('joined'))) as Joined;
  await client.nextMatching(
    (msg) => (msg as RoomState).type === 'room-state' && (msg as RoomState).roomId === joined.roomId,
  );
  return joined;
}

describe('同一ソケットでの再 join（デタッチ）', () => {
  it('別ルームへ join すると元のルームでは切断扱いになり、ホストは繰上する', async () => {
    // ルーム1: A(ホスト) + B / ルーム2: C(ホスト)
    const a = await WsClient.connect(server.port);
    const room1 = await createRoomOn(a, 'えー');

    const b = await WsClient.connect(server.port);
    b.send({ type: 'join-room', roomId: room1.roomId, name: 'びー' });
    const bJoined = (await b.nextMatching(isType('joined'))) as Joined;
    await b.nextMatching(isType('room-state'));
    await a.nextMatching(isType('room-state'));

    const c = await WsClient.connect(server.port);
    const room2 = await createRoomOn(c, 'しー');

    // A（ルーム1のホスト）が同じソケットのままルーム2へ join
    a.send({ type: 'join-room', roomId: room2.roomId, name: 'えー' });
    await a.nextMatching(
      (msg) => (msg as RoomState).type === 'room-state' && (msg as RoomState).roomId === room2.roomId,
    );

    // B にはルーム1の room-state が配信され、A は切断扱い・B がホストに繰上している
    const state = (await b.nextMatching(
      (msg) =>
        (msg as RoomState).type === 'room-state' &&
        (msg as RoomState).participants.some((p) => !p.connected),
    )) as RoomState;
    expect(state.roomId).toBe(room1.roomId);
    expect(state.participants.find((p) => p.id === room1.participantId)?.connected).toBe(false);
    expect(state.participants.find((p) => p.id === bJoined.participantId)?.isHost).toBe(true);

    a.close();
    b.close();
    c.close();
  });

  it('二重 create-room で元のルーム（1人）は破棄され、以後 join できない', async () => {
    const a = await WsClient.connect(server.port);
    const room1 = await createRoomOn(a, 'えー');

    // 同じソケットで2つ目のルームを作成（ダブルクリック相当）
    const room2 = await createRoomOn(a, 'えー');
    expect(room2.roomId).not.toBe(room1.roomId);

    // ルーム1 は接続数 0 で即時破棄されている（FR-014）
    const probe = await WsClient.connect(server.port);
    probe.send({ type: 'join-room', roomId: room1.roomId, name: 'てすと' });
    expect(await probe.next()).toMatchObject({ type: 'error', code: 'room-not-found' });

    a.close();
    probe.close();
  });

  it('未投票の参加者が別ルームへ去ると、残りの全員投票で自動公開が成立する', async () => {
    // ルーム1: A(ホスト・投票済み) + B(投票済み) + C(未投票)
    const a = await WsClient.connect(server.port);
    const room1 = await createRoomOn(a, 'えー');
    const b = await WsClient.connect(server.port);
    b.send({ type: 'join-room', roomId: room1.roomId, name: 'びー' });
    await b.nextMatching(isType('room-state'));
    const c = await WsClient.connect(server.port);
    c.send({ type: 'join-room', roomId: room1.roomId, name: 'しー' });
    await c.nextMatching(isType('room-state'));

    a.send({ type: 'vote', card: { kind: 'number', value: 5 } });
    b.send({ type: 'vote', card: { kind: 'number', value: 8 } });
    await b.nextMatching(
      (msg) =>
        (msg as RoomState).type === 'room-state' &&
        (msg as RoomState).participants.filter((p) => p.hasVoted).length === 2,
    );

    // C（未投票）が別ルームへ移動 → ルーム1 は残り全員投票済みになり自動公開
    const room2host = await WsClient.connect(server.port);
    const room2 = await createRoomOn(room2host, 'でぃー');
    c.send({ type: 'join-room', roomId: room2.roomId, name: 'しー' });

    const revealed = (await b.nextMatching(
      (msg) => (msg as RoomState).round?.status === 'revealed',
    )) as RoomState;
    expect(revealed.roomId).toBe(room1.roomId);

    a.close();
    b.close();
    c.close();
    room2host.close();
  });
});
