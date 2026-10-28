// 隠しモードのテーブルの配線（#403 T-1〜T-12）。実プロトコル越しに、手が本人にしか届かないことを見る。
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

interface Card {
  suit: string;
  rank: number;
}

interface TableView {
  status: 'idle' | 'dealt' | 'shown';
  seats: string[];
  yourHand: Card[] | null;
  hands: Array<{ participantId: string; cards: Card[]; category: string }>;
  winners: string[];
}

interface RoomState {
  type: 'room-state';
  you: string;
  round: { status: string };
  yourVote: unknown;
  table?: TableView;
}

interface ErrorFrame {
  type: 'error';
  code: string;
}

async function createHost(name = 'あ') {
  const client = await WsClient.connect(server.port);
  client.send({ type: 'create-room', name });
  const joined = (await client.nextMatching(isType('joined'))) as Joined;
  await client.nextMatching(isType('room-state'));
  return { client, joined };
}

async function join(roomId: string, name: string) {
  const client = await WsClient.connect(server.port);
  client.send({ type: 'join-room', roomId, name });
  const joined = (await client.nextMatching(isType('joined'))) as Joined;
  await client.nextMatching(isType('room-state'));
  return { client, joined };
}

const tableIs = (pred: (t: TableView) => boolean) => (msg: unknown) =>
  (msg as RoomState).type === 'room-state' && (msg as RoomState).table !== undefined && pred((msg as RoomState).table!);

const key = (c: Card) => `${c.rank}${c.suit}`;

/** A・B が席に着き、C は着いていない部屋 */
async function twoSeatedOneWatching() {
  const a = await createHost('あ');
  const b = await join(a.joined.roomId, 'い');
  const c = await join(a.joined.roomId, 'う');
  a.client.send({ type: 'table-seat', seated: true });
  await c.client.nextMatching(tableIs((t) => t.seats.length === 1));
  b.client.send({ type: 'table-seat', seated: true });
  await c.client.nextMatching(tableIs((t) => t.seats.length === 2));
  return { a, b, c };
}

describe('隠しモードのテーブル（#403）', () => {
  it('配ると、各自に自分の 5 枚だけが届き、他の人の手はどこにも無い（T-3・T-4）', async () => {
    const { a, b, c } = await twoSeatedOneWatching();

    // When
    a.client.send({ type: 'table-deal' });

    // Then
    const dealt = (who: typeof a) => who.client.nextMatching(tableIs((t) => t.status === 'dealt')) as Promise<RoomState>;
    const [sa, sb, sc] = await Promise.all([dealt(a), dealt(b), dealt(c)]);
    const handA = sa.table!.yourHand!;
    const handB = sb.table!.yourHand!;
    expect(handA).toHaveLength(5);
    expect(handB).toHaveLength(5);
    expect(new Set([...handA, ...handB].map(key)).size).toBe(10);
    expect(sc.table!.yourHand).toBeNull();
    // 他の人の札がフィールド名を問わず wire に無い
    for (const card of handB) expect(JSON.stringify(sa)).not.toContain(JSON.stringify(card));
    for (const card of [...handA, ...handB]) expect(JSON.stringify(sc)).not.toContain(JSON.stringify(card));

    for (const who of [a, b, c]) who.client.close();
  });

  it('見せると、全員に手・役・勝者が届く。見積もりの状態は動かない（T-5・T-12）', async () => {
    const { a, b, c } = await twoSeatedOneWatching();
    a.client.send({ type: 'vote', card: { kind: 'number', value: 5 } });
    a.client.send({ type: 'table-deal' });
    const dealtA = (await a.client.nextMatching(tableIs((t) => t.status === 'dealt'))) as RoomState;

    // When
    b.client.send({ type: 'table-show' });

    // Then
    const shown = (await c.client.nextMatching(tableIs((t) => t.status === 'shown'))) as RoomState;
    expect(shown.table!.hands.map((h) => h.participantId)).toEqual([a.joined.participantId, b.joined.participantId]);
    expect(shown.table!.hands[0]?.cards).toEqual(dealtA.table!.yourHand!);
    expect(shown.table!.winners.length).toBeGreaterThanOrEqual(1);
    expect(shown.round.status).toBe('voting');
    const shownA = (await a.client.nextMatching(tableIs((t) => t.status === 'shown'))) as RoomState;
    expect(shownA.yourVote).toEqual({ kind: 'number', value: 5 });

    for (const who of [a, b, c]) who.client.close();
  });

  it('配っている間に配り直す・配る前に見せる・席の外から配る は拒まれる（T-6〜T-8）', async () => {
    const { a, b, c } = await twoSeatedOneWatching();

    a.client.send({ type: 'table-show' });
    expect(((await a.client.nextMatching(isType('error'))) as ErrorFrame).code).toBe('table-no-hand');

    c.client.send({ type: 'table-deal' });
    expect(((await c.client.nextMatching(isType('error'))) as ErrorFrame).code).toBe('table-not-seated');

    a.client.send({ type: 'table-deal' });
    await a.client.nextMatching(tableIs((t) => t.status === 'dealt'));
    b.client.send({ type: 'table-deal' });
    expect(((await b.client.nextMatching(isType('error'))) as ErrorFrame).code).toBe('table-in-play');

    for (const who of [a, b, c]) who.client.close();
  });

  it('全員が席を離れると、table は room-state から消える（T-10・設計 D6）', async () => {
    const { a, b, c } = await twoSeatedOneWatching();

    a.client.send({ type: 'table-seat', seated: false });
    b.client.send({ type: 'table-seat', seated: false });

    await c.client.nextMatching(
      (msg) => (msg as RoomState).type === 'room-state' && (msg as RoomState).table === undefined,
    );
    for (const who of [a, b, c]) who.client.close();
  });
});
