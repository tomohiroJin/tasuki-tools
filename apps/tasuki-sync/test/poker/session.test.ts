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
  participants: Array<{ id: string; connected: boolean; hasVoted: boolean }>;
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
  it('別ルームへ join すると元のルームでは切断扱いになる', async () => {
    // Given
    // ルーム1: A + B / ルーム2: C
    const a = await WsClient.connect(server.port);
    const room1 = await createRoomOn(a, 'えー');

    const b = await WsClient.connect(server.port);
    b.send({ type: 'join-room', roomId: room1.roomId, name: 'びー' });
    const bJoined = (await b.nextMatching(isType('joined'))) as Joined;
    await b.nextMatching(isType('room-state'));
    await a.nextMatching(isType('room-state'));

    const c = await WsClient.connect(server.port);
    const room2 = await createRoomOn(c, 'しー');

    // When
    // A が同じソケットのままルーム2へ join
    a.send({ type: 'join-room', roomId: room2.roomId, name: 'えー' });
    await a.nextMatching(
      (msg) => (msg as RoomState).type === 'room-state' && (msg as RoomState).roomId === room2.roomId,
    );

    // Then
    // B にはルーム1の room-state が配信され、A は切断扱いになっている（#95 S3: 権限繰上は無い）
    const state = (await b.nextMatching(
      (msg) =>
        (msg as RoomState).type === 'room-state' &&
        (msg as RoomState).participants.some((p) => !p.connected),
    )) as RoomState;
    expect(state.roomId).toBe(room1.roomId);
    expect(state.participants.find((p) => p.id === room1.participantId)?.connected).toBe(false);
    // isHost はワイヤから完全に消えたことを確かめる（#95 S3。B は接続を切って
    // いないので connected===true は判別力が弱く、isHost が再び乗ってしまう
    // ような退行こそが実際に守るべき性質である）
    expect(state.participants.find((p) => p.id === bJoined.participantId)).not.toHaveProperty(
      'isHost',
    );

    a.close();
    b.close();
    c.close();
  });

  // **旧「二重 create-room で元のルーム（1人）は破棄され、以後 join できない」の書き換え。**
  // #95 S4a で「最後の接続が切れた瞬間の破棄」（旧 FR-014）を撤去したので、元のルームは
  // 残る。切り離されるのはソケットだけで、名簿にはオフラインの本人が残り続ける
  // （寿命の規則は `test/room-lifecycle.test.ts`）。
  it('二重 create-room では元のルームから切り離されるだけで、ルーム自体は残る', async () => {
    // Given
    const a = await WsClient.connect(server.port);
    const room1 = await createRoomOn(a, 'えー');

    // When
    // 同じソケットで2つ目のルームを作成（ダブルクリック相当）
    const room2 = await createRoomOn(a, 'えー');
    expect(room2.roomId).not.toBe(room1.roomId);

    // Then: ルーム1 は残っており、別の接続が参加できる
    const probe = await WsClient.connect(server.port);
    probe.send({ type: 'join-room', roomId: room1.roomId, name: 'てすと' });
    const probeJoined = (await probe.nextMatching(isType('joined'))) as { roomId: string };
    expect(probeJoined.roomId).toBe(room1.roomId);

    // Then: 切り離された当人は offline として名簿に残る（room2 へ移っただけ）
    const state = (await probe.nextMatching(isType('room-state'))) as RoomState;
    expect(state.participants).toHaveLength(2);
    expect(state.participants.filter((p) => p.connected)).toHaveLength(1);

    a.close();
    probe.close();
  });

  it('未投票の参加者が別ルームへ去ると、残りの全員投票で自動公開が成立する', async () => {
    // Given
    // ルーム1: A(投票済み) + B(投票済み) + C(未投票)
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

    // When
    // C（未投票）が別ルームへ移動 → ルーム1 は残り全員投票済みになり自動公開
    const room2host = await WsClient.connect(server.port);
    const room2 = await createRoomOn(room2host, 'でぃー');
    c.send({ type: 'join-room', roomId: room2.roomId, name: 'しー' });

    // Then
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
