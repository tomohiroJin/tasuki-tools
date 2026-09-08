// 同じルームへの `join-room` 再送（#171）。
//
// 二重送信・SPA 遷移で、**既にそのルームに居るソケットが同じ `roomId` へ
// `join-room` を送り直す**ことがある。この経路は元々、自分がそのルーム唯一の
// 接続だと `detachFromCurrentRoom` の接続数 0 分岐（FR-014）でルームを破棄し、
// それでも `joined` を返していた。結果、当人は「参加している」のにルームは
// どこにも無く、以後の `vote` / `reveal` / `next-round` が無応答で落ちていた。
//
// ここで固定するのは、再送を**冪等**にしたあとの振る舞いである。
// 併せて `token` による復帰（FR-013）を壊していないことも見る
// （冪等化は「同じソケット・同じルーム」だけを対象にし、別ソケットからの
//   token 復帰には触れない、という線引きの証拠）。
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
  participants: Array<{ id: string; name: string; connected: boolean; hasVoted: boolean }>;
  round: { status: string };
  yourVote: unknown;
}

/** ルームを作り、joined と最初の room-state を読み切る */
async function createRoomOn(client: WsClient, name: string): Promise<Joined> {
  client.send({ type: 'create-room', name });
  const joined = (await client.nextMatching(isType('joined'))) as Joined;
  await client.nextMatching(isType('room-state'));
  return joined;
}

/** 同じソケットで同じルームへ join-room を送り直し、joined と room-state を読み切る */
async function rejoinSameRoom(
  client: WsClient,
  roomId: string,
  name: string,
  token?: string,
): Promise<{ joined: Joined; state: RoomState }> {
  client.send({ type: 'join-room', roomId, name, ...(token !== undefined ? { token } : {}) });
  const joined = (await client.nextMatching(isType('joined'))) as Joined;
  const state = (await client.nextMatching(isType('room-state'))) as RoomState;
  return { joined, state };
}

describe('唯一の接続による join-room の再送（#171）', () => {
  it('再送のあとも vote は応答する（無応答で落ちない）', async () => {
    // Given: 作成者がそのルーム唯一の接続である
    const host = await WsClient.connect(server.port);
    const joined = await createRoomOn(host, 'たろう');

    // When: 同じソケットで同じ roomId へ join-room を送り直す（Issue #171 の再現手順）
    await rejoinSameRoom(host, joined.roomId, 'たろう');
    host.send({ type: 'vote', card: { kind: 'number', value: 5 } });

    // Then: 投票が反映された room-state が返る。
    // 直す前はここで何も届かず（ルームが破棄済みで commitRoomAction が黙って落ちる）、
    // タイムアウトで落ちていた
    const state = (await host.nextMatching(isType('room-state'), 3_000)) as RoomState;
    expect(state.yourVote).toEqual({ kind: 'number', value: 5 });

    host.close();
  });

  it('再送しても同一参加者のままで、参加者は増えない', async () => {
    // Given
    const host = await WsClient.connect(server.port);
    const joined = await createRoomOn(host, 'たろう');

    // When: 名前を変えて送っても、既に居るのだから新しい参加者にはならない
    const again = await rejoinSameRoom(host, joined.roomId, 'べつのなまえ');

    // Then
    expect(again.joined.participantId).toBe(joined.participantId);
    expect(again.joined.token).toBe(joined.token);
    expect(again.joined.roomId).toBe(joined.roomId);
    expect(again.state.participants).toHaveLength(1);
    expect(again.state.participants[0]).toMatchObject({ name: 'たろう', connected: true });

    host.close();
  });

  it('再送のあとも、そのルームには別のクライアントが参加できる（破棄されていない）', async () => {
    // Given
    const host = await WsClient.connect(server.port);
    const joined = await createRoomOn(host, 'たろう');

    // When
    await rejoinSameRoom(host, joined.roomId, 'たろう');

    const guest = await WsClient.connect(server.port);
    guest.send({ type: 'join-room', roomId: joined.roomId, name: 'はなこ' });

    // Then: 直す前はルームが消えているので room-not-found が返っていた
    const guestJoined = (await guest.nextMatching(isType('joined'), 3_000)) as Joined;
    expect(guestJoined.roomId).toBe(joined.roomId);
    const state = (await guest.nextMatching(isType('room-state'))) as RoomState;
    expect(state.participants.map((p) => p.name)).toEqual(['たろう', 'はなこ']);

    host.close();
    guest.close();
  });
});

describe('再送と token による復帰の相互作用（FR-013）', () => {
  it('自分の token を付けた再送でも同一参加者のままで、ルームは生き続ける', async () => {
    // Given: 画面は localStorage の token を添えて join-room を送る（apps/poker-web の useSync）
    const host = await WsClient.connect(server.port);
    const joined = await createRoomOn(host, 'たろう');

    // When
    const again = await rejoinSameRoom(host, joined.roomId, 'たろう', joined.token);

    // Then: 同一参加者として返り、ルームは操作を受け付け続ける
    expect(again.joined.participantId).toBe(joined.participantId);
    host.send({ type: 'vote', card: { kind: 'number', value: 3 } });
    const state = (await host.nextMatching(isType('room-state'), 3_000)) as RoomState;
    expect(state.yourVote).toEqual({ kind: 'number', value: 3 });

    host.close();
  });

  it('再送のあとでも、別ソケットからの token 復帰は同一参加者として効く（票も保つ）', async () => {
    // Given: 再送を挟んだルームに、もう 1 人が参加して投票する
    const host = await WsClient.connect(server.port);
    const joined = await createRoomOn(host, 'たろう');
    await rejoinSameRoom(host, joined.roomId, 'たろう');

    const guest = await WsClient.connect(server.port);
    guest.send({ type: 'join-room', roomId: joined.roomId, name: 'はなこ' });
    const guestJoined = (await guest.nextMatching(isType('joined'), 3_000)) as Joined;
    await guest.nextMatching(isType('room-state'));
    await host.nextMatching(isType('room-state'));

    guest.send({ type: 'vote', card: { kind: 'number', value: 13 } });
    await guest.nextMatching(isType('room-state'));

    // ゲストが切断する（ホストが残っているのでルームは破棄されない）
    guest.close();
    await host.nextMatching(
      (msg) =>
        (msg as RoomState).type === 'room-state' &&
        (msg as RoomState).participants.some((p) => !p.connected),
    );

    // When: 別ソケットから token を添えて復帰する
    const revived = await WsClient.connect(server.port);
    revived.send({
      type: 'join-room',
      roomId: joined.roomId,
      name: '無視される名前',
      token: guestJoined.token,
    });

    // Then: 同一参加者として復帰し、切断前の票を引き継ぐ
    const revivedJoined = (await revived.nextMatching(isType('joined'))) as Joined;
    expect(revivedJoined.participantId).toBe(guestJoined.participantId);
    const state = (await revived.nextMatching(isType('room-state'))) as RoomState;
    expect(state.yourVote).toEqual({ kind: 'number', value: 13 });
    expect(state.participants.find((p) => p.id === guestJoined.participantId)?.connected).toBe(true);

    host.close();
    revived.close();
  });
});
