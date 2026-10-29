// 隠しモードのゲームの配線（#403 E-1〜E-5・G-1〜G-11）。実プロトコル越しに、入口と手の秘匿を見る。
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

interface Card {
  suit: string;
  rank: number;
}

interface TableView {
  status: 'exchanging' | 'shown';
  players: Array<{ participantId: string; exchanged: boolean }>;
  yourHand: Card[] | null;
  hands: Array<{ participantId: string; cards: Card[]; category: string }>;
}

interface RoomState {
  type: 'room-state';
  round: { status: string };
  yourVote: unknown;
  table?: TableView;
}

interface ErrorFrame {
  type: 'error';
  code: string;
}

type Who = { client: WsClient; joined: Joined };

async function createHost(name = 'あ'): Promise<Who> {
  const client = await WsClient.connect(server.port);
  client.send({ type: 'create-room', name });
  const joined = (await client.nextMatching(isType('joined'))) as Joined;
  await client.nextMatching(isType('room-state'));
  return { client, joined };
}

async function join(roomId: string, name: string): Promise<Who> {
  const client = await WsClient.connect(server.port);
  client.send({ type: 'join-room', roomId, name });
  const joined = (await client.nextMatching(isType('joined'))) as Joined;
  await client.nextMatching(isType('room-state'));
  return { client, joined };
}

const state = (pred: (s: RoomState) => boolean) => (msg: unknown) =>
  (msg as RoomState).type === 'room-state' && pred(msg as RoomState);
const tableIs = (pred: (t: TableView) => boolean) => state((s) => s.table !== undefined && pred(s.table));
const revealed = state((s) => s.round.status === 'revealed');
const voting = state((s) => s.round.status === 'voting');
const key = (c: Card) => `${c.rank}${c.suit}`;

/** 全員が ☕ を出し、開くのを待つ */
async function allCoffee(people: Who[]): Promise<RoomState[]> {
  for (const p of people) p.client.send({ type: 'vote', card: { kind: 'coffee' } });
  return Promise.all(people.map((p) => p.client.nextMatching(revealed) as Promise<RoomState>));
}

/** ☕ → 開く → 再投票 → ☕ → 開く（入口） */
async function enter(people: Who[]): Promise<RoomState[]> {
  await allCoffee(people);
  people[0]!.client.send({ type: 'revote' });
  for (const p of people) await p.client.nextMatching(voting);
  for (const p of people) p.client.send({ type: 'vote', card: { kind: 'coffee' } });
  return Promise.all(people.map((p) => p.client.nextMatching(tableIs((t) => t.status === 'exchanging')) as Promise<RoomState>));
}

describe('隠しモードのゲーム（#403）', () => {
  it('☕ を 1 回出しただけでは始まらない（E-1）', async () => {
    const a = await createHost();
    const b = await join(a.joined.roomId, 'い');
    const states = await allCoffee([a, b]);
    for (const s of states) expect(s.table).toBeUndefined();
    for (const who of [a, b]) who.client.close();
  });

  it('入口で始まり、各自に自分の 5 枚だけが届く。見ている人には誰の手も届かない（E-2・G-1・G-3・G-12）', async () => {
    const a = await createHost('あ');
    const b = await join(a.joined.roomId, 'い');
    const c = await join(a.joined.roomId, 'う');
    c.client.send({ type: 'set-spectator', spectator: true });
    await a.client.nextMatching(state(() => true));

    const [sa, sb] = await enter([a, b]);
    const sc = (await c.client.nextMatching(tableIs((t) => t.status === 'exchanging'))) as RoomState;
    const handA = sa!.table!.yourHand!;
    const handB = sb!.table!.yourHand!;
    expect(handA).toHaveLength(5);
    expect(new Set([...handA, ...handB].map(key)).size).toBe(10);
    expect(sa!.table!.players.map((p) => p.participantId)).toEqual([a.joined.participantId, b.joined.participantId]);
    expect(sc.table!.yourHand).toBeNull();
    for (const card of handB) expect(JSON.stringify(sa)).not.toContain(JSON.stringify(card));
    for (const card of [...handA, ...handB]) expect(JSON.stringify(sc)).not.toContain(JSON.stringify(card));

    for (const who of [a, b, c]) who.client.close();
  });

  it('1 人のルームでも同じ手順で始まる（E-4）', async () => {
    const a = await createHost();
    const [s] = await enter([a]);
    expect(s!.table!.yourHand).toHaveLength(5);
    a.client.close();
  });

  it('全員がチェンジすると全員の手と役が開く。2 回目のチェンジと最中の投票は拒む（G-4・G-6・G-7・G-11）', async () => {
    const a = await createHost();
    const b = await join(a.joined.roomId, 'い');
    const [sa] = await enter([a, b]);

    a.client.send({ type: 'table-exchange', discard: [0, 1] });
    const afterA = (await a.client.nextMatching(tableIs((t) => t.players.some((p) => p.exchanged)))) as RoomState;
    expect(afterA.table!.yourHand!.slice(2)).toEqual(sa!.table!.yourHand!.slice(2));
    expect(afterA.table!.yourHand!.slice(0, 2)).not.toEqual(sa!.table!.yourHand!.slice(0, 2));

    a.client.send({ type: 'table-exchange', discard: [] });
    expect(((await a.client.nextMatching(isType('error'))) as ErrorFrame).code).toBe('table-exchanged');
    b.client.send({ type: 'vote', card: { kind: 'number', value: 5 } });
    expect(((await b.client.nextMatching(isType('error'))) as ErrorFrame).code).toBe('table-in-play');

    b.client.send({ type: 'table-exchange', discard: [] });
    const shown = (await a.client.nextMatching(tableIs((t) => t.status === 'shown'))) as RoomState;
    expect(shown.table!.hands.map((h) => h.participantId)).toEqual([a.joined.participantId, b.joined.participantId]);
    expect(shown.table!.hands[0]!.cards).toEqual(afterA.table!.yourHand!);
    expect(typeof shown.table!.hands[1]!.category).toBe('string');

    for (const who of [a, b]) who.client.close();
  });

  it('もう一度で配り直し、見積もりに戻ると table が消えて投票中になる（G-9・G-10）', async () => {
    const a = await createHost();
    await enter([a]);
    a.client.send({ type: 'table-exchange', discard: [] });
    await a.client.nextMatching(tableIs((t) => t.status === 'shown'));

    a.client.send({ type: 'table-deal' });
    await a.client.nextMatching(tableIs((t) => t.status === 'exchanging'));

    a.client.send({ type: 'table-close' });
    const back = (await a.client.nextMatching(state((s) => s.table === undefined))) as RoomState;
    expect(back.round.status).toBe('voting');
    expect(back.yourVote).toBeNull();
    a.client.close();
  });

  it('ゲームが無いのにチェンジ・見積もりに戻る は table-no-game', async () => {
    const a = await createHost();
    a.client.send({ type: 'table-exchange', discard: [] });
    expect(((await a.client.nextMatching(isType('error'))) as ErrorFrame).code).toBe('table-no-game');
    a.client.send({ type: 'table-close' });
    expect(((await a.client.nextMatching(isType('error'))) as ErrorFrame).code).toBe('table-no-game');
    a.client.close();
  });

  it('未チェンジの人が切れても、すぐには開かない（G-8・猶予の配線は card-game-grace.test.ts）', async () => {
    const a = await createHost();
    const b = await join(a.joined.roomId, 'い');
    await enter([a, b]);
    a.client.send({ type: 'table-exchange', discard: [] });
    await a.client.nextMatching(tableIs((t) => t.players.some((p) => p.exchanged)));

    b.client.close();
    const after = (await a.client.nextMatching(state(() => true))) as RoomState;
    expect(after.table?.status).toBe('exchanging');
    a.client.close();
  });
});

describe('ゲームの最中の見積もりの操作（#403 G-11）', () => {
  it('投票・公開・再投票・次のアイテムへ・古い next-round は table-in-play、アイテム名と記録と見学は受ける', async () => {
    const a = await createHost();
    await enter([a]);
    for (const msg of [
      { type: 'vote', card: { kind: 'number', value: 5 } },
      { type: 'reveal' },
      { type: 'revote' },
      { type: 'next-item', points: null },
      { type: 'next-round' },
    ]) {
      a.client.send(msg);
      expect(((await a.client.nextMatching(isType('error'))) as ErrorFrame).code).toBe('table-in-play');
    }
    a.client.send({ type: 'set-item', item: 'ログイン' });
    const s = (await a.client.nextMatching(state((x) => (x as unknown as { estimate?: { item: string } }).estimate?.item === 'ログイン'))) as RoomState;
    expect(s.table?.status).toBe('exchanging');
    a.client.close();
  });
});
