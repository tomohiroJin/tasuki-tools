// 契約シナリオ #7 #8 #9 + 切断による自動公開（US4）
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
  participants: Array<{ id: string; connected: boolean; hasVoted: boolean }>;
  round: { status: string };
  yourVote: unknown;
}

async function createHost() {
  const host = await WsClient.connect(server.port);
  host.send({ type: 'create-room', name: 'たろう' });
  const joined = (await host.nextMatching(isType('joined'))) as Joined;
  await host.nextMatching(isType('room-state'));
  return { host, joined };
}

async function join(roomId: string, name: string, token?: string) {
  const client = await WsClient.connect(server.port);
  client.send({ type: 'join-room', roomId, name, ...(token ? { token } : {}) });
  const joined = (await client.nextMatching(isType('joined'))) as Joined;
  const state = (await client.nextMatching(isType('room-state'))) as RoomState;
  return { client, joined, state };
}

describe('参加者切断の通知（契約 #7）', () => {
  // かつては #95 S3 以前、この切断が「ホスト権限の繰上（FR-012 / SC-005）」を
  // 引き起こしていた。#95 S3 でホストと権限繰上を廃止したので、ここで固定するのは
  // 「切断した参加者の connected が room-state で false になって配信される」だけである。
  it('切断した参加者の connected が room-state で false になって他の参加者へ配信される', async () => {
    // Given
    const { host, joined } = await createHost();
    const guest = await join(joined.roomId, 'はなこ');
    await host.nextMatching(isType('room-state'));

    // When
    host.close();

    const state = (await guest.client.nextMatching(
      (msg) =>
        (msg as RoomState).type === 'room-state' &&
        (msg as RoomState).participants.find((p) => p.id === joined.participantId)?.connected ===
          false,
    )) as RoomState;
    // Then
    expect(state.participants.find((p) => p.id === joined.participantId)?.connected).toBe(false);
    guest.client.close();
  });
});

describe('token による復帰（契約 #8 / FR-013）', () => {
  it('切断後に token 付き join-room で票を保持したまま同一参加者に復帰する', async () => {
    // Given
    const { host, joined } = await createHost();
    const guest = await join(joined.roomId, 'はなこ');
    await host.nextMatching(isType('room-state'));

    guest.client.send({ type: 'vote', card: { kind: 'number', value: 13 } });
    await guest.client.nextMatching(isType('room-state'));

    guest.client.close();
    // 切断が room-state に反映されるのを待つ
    await host.nextMatching(
      (msg) =>
        (msg as RoomState).type === 'room-state' &&
        (msg as RoomState).participants.some((p) => !p.connected),
    );

    // When
    const rejoined = await join(joined.roomId, '無視される名前', guest.joined.token);
    // Then
    expect(rejoined.joined.participantId).toBe(guest.joined.participantId);
    expect(rejoined.state.yourVote).toEqual({ kind: 'number', value: 13 });
    const self = rejoined.state.participants.find((p) => p.id === guest.joined.participantId);
    expect(self?.connected).toBe(true);

    host.close();
    rejoined.client.close();
  });
});

describe('全員切断でルーム即時破棄（契約 #9 / FR-014）', () => {
  it('全員切断後の join-room は room-not-found になる', async () => {
    // Given
    const { host, joined } = await createHost();
    host.close();
    // 破棄処理の完了を少し待つ
    await new Promise((r) => setTimeout(r, 200));

    // When
    const client = await WsClient.connect(server.port);
    client.send({ type: 'join-room', roomId: joined.roomId, name: 'はなこ' });
    // Then
    expect(await client.next()).toMatchObject({ type: 'error', code: 'room-not-found' });
    client.close();
  });
});

describe('切断による自動公開の再評価（US4-AS1）', () => {
  it('未投票者の切断で残り全員投票が成立し revealed が配信される', async () => {
    // Given
    const { host, joined } = await createHost();
    const guest1 = await join(joined.roomId, 'はなこ');
    await host.nextMatching(isType('room-state'));
    const guest2 = await join(joined.roomId, 'じろう');
    await host.nextMatching(isType('room-state'));
    await guest1.client.nextMatching(isType('room-state'));

    host.send({ type: 'vote', card: { kind: 'number', value: 5 } });
    guest1.client.send({ type: 'vote', card: { kind: 'number', value: 8 } });
    await guest1.client.nextMatching(
      (msg) =>
        (msg as RoomState).type === 'room-state' &&
        (msg as RoomState).participants.filter((p) => p.hasVoted).length === 2,
    );

    // When
    guest2.client.close(); // 未投票の じろう が切断

    const state = (await guest1.client.nextMatching(
      (msg) => (msg as RoomState).round?.status === 'revealed',
    )) as RoomState;
    // Then
    expect(state.round.status).toBe('revealed');

    host.close();
    guest1.client.close();
  });
});
