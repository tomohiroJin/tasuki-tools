// 特性テスト（#165 PR-2）。**振る舞いを固定するためだけに存在する。**
//
// server.ts の detachFromCurrentRoom() にある次の判定を守る。
//
//   // 同一参加者が別ソケットで再接続済みなら（socket が入れ替わっていたら）何もしない
//   if (entry.sockets.get(participantId) !== ws) return;
//
// これを落とすと、**再接続直後に古いソケットの close が新しい接続を蹴り出す。**
// reconnect.test.ts は逐次の切断→再接続しか突いておらず、この競合を守るテストは
// 2026-08-17 時点で 0 件だった。T4（Broadcaster への分離）で最も壊れやすい不変条件なので、
// 先に固定する。
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { startServer, WsClient, isType, type TestServer } from './helpers';

let server: TestServer;

beforeAll(async () => {
  server = await startServer();
});

afterAll(async () => {
  await server.stop();
});

describe('同一参加者の再接続とソケットの同一性（特性テスト）', () => {
  it('古いソケットを閉じても、後から繋いだ同一参加者は切断扱いにならない', async () => {
    // Given: ホストとゲストが居るルーム
    const host = await WsClient.connect(server.port);
    host.send({ type: 'create-room', name: 'たろう' });
    const hostJoined = (await host.nextMatching(isType('joined'))) as { roomId: string };
    await host.nextMatching(isType('room-state'));

    const oldSocket = await WsClient.connect(server.port);
    oldSocket.send({ type: 'join-room', roomId: hostJoined.roomId, name: 'はなこ' });
    const guestJoined = (await oldSocket.nextMatching(isType('joined'))) as {
      participantId: string;
      token: string;
    };
    await oldSocket.nextMatching(isType('room-state'));
    await host.nextMatching(isType('room-state'));

    // When: 古いソケットを開いたまま、同じ token で別ソケットから復帰する
    const newSocket = await WsClient.connect(server.port);
    newSocket.send({
      type: 'join-room',
      roomId: hostJoined.roomId,
      name: 'はなこ',
      token: guestJoined.token,
    });
    await newSocket.nextMatching(isType('joined'));
    await newSocket.nextMatching(isType('room-state'));
    await host.nextMatching(isType('room-state'));

    // そのあとで古いソケットを閉じる
    oldSocket.close();

    // Then: ホストから見て、この参加者は connected のままである
    // （古いソケットの close が新しい接続を蹴り出していない）
    host.send({ type: 'vote', card: { kind: 'number', value: 3 } });
    const state = (await host.nextMatching(isType('room-state'))) as {
      participants: Array<{ id: string; connected: boolean }>;
    };
    const guest = state.participants.find((p) => p.id === guestJoined.participantId);
    expect(guest).toBeDefined();
    expect(guest?.connected).toBe(true);

    host.close();
    newSocket.close();
  });
});
