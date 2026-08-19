// 契約シナリオ #6（US3: 集計と次ラウンド）
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { startServer, WsClient, isType, type TestServer } from './helpers';

let server: TestServer;

beforeAll(async () => {
  server = await startServer();
});

afterAll(async () => {
  await server.stop();
});

interface RoomState {
  type: 'room-state';
  participants: Array<{ id: string; hasVoted: boolean }>;
  round:
    | { status: 'voting' }
    | { status: 'revealed'; votes: unknown[]; stats: { average: number | null; modes: unknown[] } };
}

async function setupRevealedRoom() {
  const host = await WsClient.connect(server.port);
  host.send({ type: 'create-room', name: 'たろう' });
  const hostJoined = (await host.nextMatching(isType('joined'))) as { roomId: string };
  await host.nextMatching(isType('room-state'));

  const guest = await WsClient.connect(server.port);
  guest.send({ type: 'join-room', roomId: hostJoined.roomId, name: 'はなこ' });
  await guest.nextMatching(isType('joined'));
  await guest.nextMatching(isType('room-state'));
  await host.nextMatching(isType('room-state'));

  guest.send({ type: 'vote', card: { kind: 'number', value: 5 } });
  await guest.nextMatching(isType('room-state'));
  await host.nextMatching(isType('room-state'));
  host.send({ type: 'vote', card: { kind: 'number', value: 8 } });

  const revealed = async (client: WsClient) =>
    (await client.nextMatching(
      (msg) => (msg as RoomState).round?.status === 'revealed',
    )) as RoomState;
  return { host, guest, hostRevealed: await revealed(host), guestRevealed: await revealed(guest) };
}

describe('revealed の stats（FR-010）', () => {
  it('average と modes が配信される（5 と 8 → 平均 6.5・最頻値は両方）', async () => {
    // Given: setupRevealedRoom がルーム作成から公開までの操作を行うため、この呼び出し自体が前提の指定を兼ねる
    // When
    const { host, guest, hostRevealed } = await setupRevealedRoom();
    // Then
    if (hostRevealed.round.status !== 'revealed') throw new Error('unreachable');
    expect(hostRevealed.round.stats.average).toBe(6.5);
    expect(hostRevealed.round.stats.modes).toEqual(
      expect.arrayContaining([
        { kind: 'number', value: 5 },
        { kind: 'number', value: 8 },
      ]),
    );
    host.close();
    guest.close();
  });
});

describe('next-round（契約 #6 / FR-011）', () => {
  it('ホストの next-round で全員が票リセット済みの voting 状態を受信する', async () => {
    // Given
    const { host, guest } = await setupRevealedRoom();
    // When
    host.send({ type: 'next-round' });

    // Then
    for (const client of [host, guest]) {
      const state = (await client.nextMatching(
        (msg) => (msg as RoomState).round?.status === 'voting',
      )) as RoomState;
      expect(state.participants.every((p) => !p.hasVoted)).toBe(true);
    }
    host.close();
    guest.close();
  });

  it('非ホストの next-round は not-host エラー', async () => {
    // Given
    const { host, guest } = await setupRevealedRoom();
    // When
    guest.send({ type: 'next-round' });
    // Then
    expect(await guest.nextMatching(isType('error'))).toMatchObject({
      type: 'error',
      code: 'not-host',
    });
    host.close();
    guest.close();
  });
});
