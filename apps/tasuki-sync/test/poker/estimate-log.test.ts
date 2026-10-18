// 見積もりの記録（#93）の配線。操作 → 全員の room-state.estimate。
//
// **in-process で組み立てる。** 記録の `at` は壁時計の値を載せるので、時刻を固定値の
// 偽物に差し替えて「渡した値がそのまま載る」ことを見る（サブプロセス起動では差し替えられない）。
import { describe, expect, it } from 'bun:test';
import type { Card, ClientMessage, ServerMessage } from '@tasuki/poker-core';
import type { RateLimiter } from '@tasuki/rate-limit';
import { removeParticipant } from '@tasuki/room-core';
import { InMemoryTimerStore } from '../../src/adapters/in-memory-timer-store.js';
import { InMemoryRoomStore } from '../../src/adapters/in-memory-room-store';
import { InMemoryRoundStore } from '../../src/adapters/poker-in-memory-round-store';
import { createWsBroadcaster } from '../../src/adapters/poker-ws-broadcaster';
import { createTokenStore } from '../../src/application/token-store';
import { makePokerHandlers, type HandlerConnection } from '../../src/application/poker-handlers';
import type { IdGen } from '../../src/ports/poker-id-gen';
import type { RoomSocket } from '../../src/ports/poker-broadcaster';
import { SpyBroadcaster } from '../support/spy-broadcaster.js';
import { spyHub } from '../support/hub.js';

/** 偽の壁時計が返す固定値 */
const FAKE_NOW = 1_700_000_000_000;

type RoomStateMsg = Extract<ServerMessage, { type: 'room-state' }>;

const allowLimiter: RateLimiter = {
  shouldReject: () => false,
  consume: () => undefined,
  sweep: () => undefined,
  size: () => 0,
  sweepRunCount: () => 0,
};

const num = (value: 1 | 2 | 3 | 5 | 8 | 13): Card => ({ kind: 'number', value }) as Card;

interface Client {
  ws: HandlerConnection;
  sent: ServerMessage[];
  id: string;
  name: string;
}

/** 部屋を 1 つ作り、人数ぶんの参加者を入れる */
function setupRoom(names: string[]) {
  let n = 0;
  const idGen: IdGen = {
    roomIdCandidate: () => 'room0001',
    participantId: () => `pid-${++n}`,
    token: () => `tok-${n}`,
  };
  const store = new InMemoryRoomStore();
  const handlers = makePokerHandlers({
    store,
    rounds: new InMemoryRoundStore(),
    tokens: createTokenStore(),
    broadcaster: createWsBroadcaster(),
    hub: spyHub(),
    timers: new InMemoryTimerStore(),
    timerBroadcaster: new SpyBroadcaster(),
    idGen,
    clock: { now: () => 0 },
    wallClock: { now: () => FAKE_NOW },
    rateLimiter: allowLimiter,
    maxRooms: 50,
    topicBroadcaster: { sendCurrent: () => {} },
    // このテストでは人を外さない（#419）
    removeFromRoom: () => {
      throw new Error('removeFromRoom は呼ばれない');
    },
  });
  const clients: Client[] = names.map((name, i) => {
    const sent: ServerMessage[] = [];
    const socket: RoomSocket = { send: (data) => void sent.push(JSON.parse(data) as ServerMessage) };
    const ws: HandlerConnection = {
      ...socket,
      data: { connId: `conn-${i}`, participantId: null, roomId: null, rateKey: `k${i}` },
    };
    return { ws, sent, id: '', name };
  });
  clients.forEach((c, i) => {
    if (i === 0) handlers.handleCreateRoom(c.ws, { type: 'create-room', name: c.name });
    else handlers.handleJoinRoom(c.ws, { type: 'join-room', roomId: 'room0001', name: c.name });
    c.id = c.ws.data.participantId as string;
  });
  const send = (c: Client, msg: ClientMessage) => handlers.dispatch(c.ws, msg);
  const last = (c: Client): RoomStateMsg & { estimate: NonNullable<RoomStateMsg['estimate']> } => {
    const states = c.sent.filter((m): m is RoomStateMsg => m.type === 'room-state');
    const state = states[states.length - 1] as RoomStateMsg;
    // 配信側は常に estimate を載せる。省略可なのは古いサーバーとの互換のため
    if (state.estimate === undefined) throw new Error('estimate が載っていない');
    return state as RoomStateMsg & { estimate: NonNullable<RoomStateMsg['estimate']> };
  };
  const errors = (c: Client) => c.sent.filter((m) => m.type === 'error');
  return { handlers, store, clients, send, last, errors };
}

/** 2 人が投票して自動公開させる */
function voteBoth(env: ReturnType<typeof setupRoom>, a: Card, b: Card) {
  env.send(env.clients[0]!, { type: 'vote', card: a });
  env.send(env.clients[1]!, { type: 'vote', card: b });
}

describe('見積もりの記録の配線（#93）', () => {
  it('Given 2 人 When 投票して自動公開 Then 両方の estimate.log に束 1・行 1（at は壁時計の値）', () => {
    // Given
    const env = setupRoom(['たろう', 'はなこ']);
    // When
    voteBoth(env, num(5), num(8));
    // Then
    for (const c of env.clients) {
      const { log } = env.last(c).estimate;
      expect(log).toHaveLength(1);
      expect(log[0]!.open).toBe(true);
      expect(log[0]!.entries).toHaveLength(1);
      expect(log[0]!.entries[0]!.at).toBe(FAKE_NOW);
      expect(log[0]!.entries[0]!.counts).toEqual([
        { card: num(5), count: 1 },
        { card: num(8), count: 1 },
      ]);
    }
  });

  it('Given 投票中 When set-item Then 全員の estimate.item が変わる', () => {
    const env = setupRoom(['たろう', 'はなこ']);
    env.send(env.clients[0]!, { type: 'set-item', item: 'ログイン画面' });
    for (const c of env.clients) expect(env.last(c).estimate.item).toBe('ログイン画面');
  });

  it('Given 開票後 When set-item Then 受理され全員の estimate.item が変わる', () => {
    const env = setupRoom(['たろう', 'はなこ']);
    voteBoth(env, num(5), num(8));
    env.send(env.clients[1]!, { type: 'set-item', item: '開票後の題' });
    for (const c of env.clients) {
      expect(env.last(c).round.status).toBe('revealed');
      expect(env.last(c).estimate.item).toBe('開票後の題');
    }
  });

  it('Given 開票後 When revote Then 投票中に戻り item は残り、次の開票は同じ束の attempt 2', () => {
    // Given
    const env = setupRoom(['たろう', 'はなこ']);
    env.send(env.clients[0]!, { type: 'set-item', item: 'A' });
    voteBoth(env, num(5), num(8));
    // When
    env.send(env.clients[0]!, { type: 'revote' });
    // Then
    expect(env.last(env.clients[1]!).round.status).toBe('voting');
    expect(env.last(env.clients[1]!).estimate.item).toBe('A');
    voteBoth(env, num(5), num(5));
    const { log } = env.last(env.clients[0]!).estimate;
    expect(log).toHaveLength(1);
    expect(log[0]!.entries.map((e) => e.attempt)).toEqual([1, 2]);
  });

  it('Given 開票後 When next-item（points 5） Then item は空・束は閉じて points 5・次は新しい束', () => {
    // Given
    const env = setupRoom(['たろう', 'はなこ']);
    env.send(env.clients[0]!, { type: 'set-item', item: 'A' });
    voteBoth(env, num(5), num(8));
    // When
    env.send(env.clients[0]!, { type: 'next-item', points: 5 });
    // Then
    const after = env.last(env.clients[1]!);
    expect(after.round.status).toBe('voting');
    expect(after.estimate.item).toBe('');
    expect(after.estimate.log[0]).toMatchObject({ open: false, points: 5 });
    voteBoth(env, num(3), num(3));
    const { log } = env.last(env.clients[0]!).estimate;
    expect(log).toHaveLength(2);
    expect(log[1]).toMatchObject({ open: true, points: null });
  });

  describe('set-points', () => {
    function closedGroupEnv() {
      const env = setupRoom(['たろう', 'はなこ']);
      voteBoth(env, num(5), num(8));
      env.send(env.clients[0]!, { type: 'next-item', points: 5 });
      return env;
    }

    it('Given 閉じた束 When set-points Then 束の points が変わる', () => {
      const env = closedGroupEnv();
      const id = env.last(env.clients[0]!).estimate.log[0]!.id;
      env.send(env.clients[1]!, { type: 'set-points', groupId: id, points: 8 });
      for (const c of env.clients) expect(env.last(c).estimate.log[0]!.points).toBe(8);
    });

    it('Given open の束 When set-points Then error estimate-open で状態は変わらない', () => {
      const env = setupRoom(['たろう', 'はなこ']);
      voteBoth(env, num(5), num(8));
      const before = env.last(env.clients[0]!);
      const id = before.estimate.log[0]!.id;
      const count = env.clients[0]!.sent.length;
      env.send(env.clients[0]!, { type: 'set-points', groupId: id, points: 3 });
      expect(env.errors(env.clients[0]!).map((e) => (e as { code: string }).code)).toEqual([
        'estimate-open',
      ]);
      // エラーのみが増え、配信（room-state）は増えない
      expect(env.clients[0]!.sent.length).toBe(count + 1);
      expect(env.last(env.clients[0]!)).toEqual(before);
    });

    it('Given 無い id When set-points Then error estimate-not-found で状態は変わらない', () => {
      const env = closedGroupEnv();
      const before = env.last(env.clients[0]!);
      env.send(env.clients[0]!, { type: 'set-points', groupId: 999, points: 3 });
      expect(env.errors(env.clients[0]!).map((e) => (e as { code: string }).code)).toEqual([
        'estimate-not-found',
      ]);
      expect(env.last(env.clients[0]!)).toEqual(before);
    });
  });

  it('Given 開票後 When 古いクライアントの next-round Then revote と同じ（item が残り同じ束が続く）', () => {
    // Given
    const env = setupRoom(['たろう', 'はなこ']);
    env.send(env.clients[0]!, { type: 'set-item', item: 'A' });
    voteBoth(env, num(5), num(8));
    // When
    env.send(env.clients[0]!, { type: 'next-round' });
    // Then
    expect(env.last(env.clients[1]!).round.status).toBe('voting');
    expect(env.last(env.clients[1]!).estimate.item).toBe('A');
    voteBoth(env, num(3), num(3));
    const { log } = env.last(env.clients[0]!).estimate;
    expect(log).toHaveLength(1);
    expect(log[0]!.entries.map((e) => e.attempt)).toEqual([1, 2]);
  });

  it('Given 未投票者が居る When その接続が切れて自動公開が立つ Then 1 行が足される（切断の経路）', () => {
    // Given: 1 人目だけが 5 に投票し、2 人目は未投票
    const env = setupRoom(['たろう', 'はなこ']);
    env.send(env.clients[0]!, { type: 'vote', card: num(5) });
    expect(env.last(env.clients[0]!).round.status).toBe('voting');
    // When: 2 人目の接続が切れる（接続中の全員が投票済みになる）
    env.handlers.detachFromCurrentRoom(env.clients[1]!.ws);
    // Then: 壁時計の値で 1 行
    const { log } = env.last(env.clients[0]!).estimate;
    expect(log).toHaveLength(1);
    expect(log[0]!.entries[0]!.at).toBe(FAKE_NOW);
    expect(log[0]!.entries[0]!.counts).toEqual([{ card: num(5), count: 1 }]);
  });

  it('Given 投票した人が退出する When 残りが全員投票済みになり自動公開 Then 1 行・抜けた人の票は数えない', () => {
    // Given: 1 人目が 5、3 人目が 3 に投票し、2 人目は未投票
    const env = setupRoom(['たろう', 'はなこ', 'じろう']);
    const [a, b, c] = env.clients as [Client, Client, Client];
    env.send(a, { type: 'vote', card: num(5) });
    env.send(c, { type: 'vote', card: num(3) });
    expect(env.last(a).round.status).toBe('voting');
    // When: 名簿から 3 人目（投票済み）、続いて 2 人目を外す（退出の経路）
    for (const leaver of [c, b]) {
      const room = env.store.get('room0001')!;
      env.store.put(removeParticipant(room, leaver.id).unwrapOr(room));
      env.handlers.handleParticipantRemoved('room0001', leaver.id);
    }
    // Then: 残った 1 人目の 5 だけが 1 行に載る
    const { log } = env.last(a).estimate;
    expect(log).toHaveLength(1);
    expect(log[0]!.entries).toHaveLength(1);
    expect(log[0]!.entries[0]!.counts).toEqual([{ card: num(5), count: 1 }]);
    expect(log[0]!.entries[0]!.at).toBe(FAKE_NOW);
  });

  it('記録はどの room-state にも参加者 ID・表示名を含まない', () => {
    // Given
    const env = setupRoom(['たろう', 'はなこ']);
    env.send(env.clients[0]!, { type: 'set-item', item: 'A' });
    voteBoth(env, num(5), num(8));
    env.send(env.clients[0]!, { type: 'revote' });
    voteBoth(env, num(5), num(5));
    env.send(env.clients[0]!, { type: 'next-item', points: 5 });
    // When / Then: 送られた全フレームの estimate を文字列化して見る
    for (const c of env.clients) {
      for (const m of c.sent.filter((x): x is RoomStateMsg => x.type === 'room-state')) {
        const json = JSON.stringify(m.estimate);
        for (const p of env.clients) {
          expect(json).not.toContain(p.id);
          expect(json).not.toContain(p.name);
        }
      }
    }
  });
});
