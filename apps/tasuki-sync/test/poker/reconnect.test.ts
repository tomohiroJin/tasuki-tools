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

/**
 * 全員が閉じてもルームは残る（#95 S4a・R10・D8）。
 *
 * **旧・契約 #9（FR-014）「最後の接続が切れた瞬間にルームを破棄する」を置き換えたもの。**
 * ここで固定していた「全員切断後の join-room は room-not-found」は、規則そのものが
 * 変わったので**逆の主張へ書き換えた**（消していない）。ルームが消える契機は
 * アイドル回収（TTL）と在室者 0 人の退出の 2 つだけで、規則そのものは
 * `test/room-lifecycle.test.ts` が保管の側から固定する。
 *
 * **利用者から見える変更である。** 全員がタブを閉じても TTL の間はルームが残り、
 * 戻れば票も残っている。TTL は既定 30 分なので、ここでは待たずに
 * 「残っていること」だけを見る（TTL の経過は `room-lifecycle.test.ts` が
 * `RoomReclaimer.sweep(now)` を直に呼んで観測する）。
 */
describe('全員が閉じてもルームは残る（#95 S4a・D8）', () => {
  it('poker で全員が閉じてもルームは残り、戻ると票が残っている（D8）', async () => {
    // Given: ひとりだけのルームで投票済み
    const { host, joined } = await createHost();
    host.send({ type: 'vote', card: { kind: 'number', value: 8 } });
    const voted = (await host.nextMatching(isType('room-state'))) as RoomState;
    expect(voted.yourVote).toEqual({ kind: 'number', value: 8 });

    // When: 唯一の接続を閉じる（旧 FR-014 はこの瞬間にルームを捨てていた）
    host.close();
    // 切断の後始末が走り切るのを待つ。即時破棄が残っていれば、この間に消える
    await new Promise((r) => setTimeout(r, 200));

    // Then: 同じ token で戻れて、切断前の票がそのまま残っている。
    // **判定は yourVote の値そのもので行う** ——「room-state が来た」だけなら、
    // 新しいルームを作り直す実装でも通ってしまう
    const revived = await WsClient.connect(server.port);
    revived.send({
      type: 'join-room',
      roomId: joined.roomId,
      name: '無視される名前',
      token: joined.token,
    });
    const revivedJoined = (await revived.nextMatching(isType('joined'))) as Joined;
    expect(revivedJoined.participantId).toBe(joined.participantId);
    const state = (await revived.nextMatching(isType('room-state'))) as RoomState;
    expect(state.yourVote).toEqual({ kind: 'number', value: 8 });
    expect(state.participants).toHaveLength(1);

    revived.close();
  });

  it('全員切断後でも、まったく新しい接続がそのルームへ参加できる', async () => {
    // 上の 1 本は token 復帰の経路しか通らない。ルームが「誰にでも見えている」ことは
    // 別に見る（旧 FR-014 では、ここが room-not-found だった）
    // Given
    const { host, joined } = await createHost();
    host.close();
    await new Promise((r) => setTimeout(r, 200));

    // When
    const client = await WsClient.connect(server.port);
    client.send({ type: 'join-room', roomId: joined.roomId, name: 'はなこ' });

    // Then
    const guestJoined = (await client.nextMatching(isType('joined'))) as Joined;
    expect(guestJoined.roomId).toBe(joined.roomId);
    const state = (await client.nextMatching(isType('room-state'))) as RoomState;
    // 切断した「たろう」は offline のまま名簿に残る（消えたのは接続だけ）
    expect(state.participants).toHaveLength(2);
    expect(state.participants.filter((p) => p.connected)).toHaveLength(1);
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
