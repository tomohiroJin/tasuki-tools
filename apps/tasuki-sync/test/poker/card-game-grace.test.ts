// 隠しモードの切断の猶予（#403 G-8）の配線。in-process で組み立て、壁時計と予約のタイマーを偽物に差し替える。
//
// 実時間で 20 秒待たずに「猶予の内は開かない／猶予の切れる時刻に予約し、発火で開く／戻れば予約を消す」を見る。
// 猶予の長さそのもの（`AWAY_GRACE_MS`）は poker-core の試験が見る。ここは予約された時間だけ時計を進めて発火させる。
import { describe, expect, it } from 'bun:test';
import type { ClientMessage, ServerMessage } from '@tasuki/poker-core';
import type { RateLimiter } from '@tasuki/rate-limit';
import { InMemoryTimerStore } from '../../src/adapters/in-memory-timer-store.js';
import { InMemoryRoomStore } from '../../src/adapters/in-memory-room-store';
import { InMemoryRoundStore } from '../../src/adapters/poker-in-memory-round-store';
import { createWsBroadcaster } from '../../src/adapters/poker-ws-broadcaster';
import { createTokenStore } from '../../src/application/token-store';
import { makePokerHandlers, type HandlerConnection } from '../../src/application/poker-handlers';
import type { RoomSocket } from '../../src/ports/poker-broadcaster';
import { SpyBroadcaster } from '../support/spy-broadcaster.js';
import { spyHub } from '../support/hub.js';

type RoomStateMsg = Extract<ServerMessage, { type: 'room-state' }>;

const allowLimiter: RateLimiter = {
  shouldReject: () => false,
  consume: () => undefined,
  sweep: () => undefined,
  size: () => 0,
  sweepRunCount: () => 0,
};

/** 予約を覚えておき、テストが好きな時に発火させる偽のタイマー（ルームごとに 1 つ・上書き） */
function fakeTimer() {
  const pending = new Map<string, { secondsLeft: number; onFire: (roomCode: string) => void }>();
  return {
    pending,
    schedule(roomCode: string, secondsLeft: number, onFire: (roomCode: string) => void) {
      pending.set(roomCode, { secondsLeft, onFire });
    },
    clear(roomCode: string) {
      pending.delete(roomCode);
    },
    fire(roomCode: string) {
      const entry = pending.get(roomCode);
      pending.delete(roomCode);
      entry?.onFire(roomCode);
    },
  };
}

function setup() {
  let now = 1_000_000;
  let n = 0;
  const timer = fakeTimer();
  const handlers = makePokerHandlers({
    store: new InMemoryRoomStore(),
    rounds: new InMemoryRoundStore(),
    tokens: createTokenStore(),
    broadcaster: createWsBroadcaster(),
    hub: spyHub(),
    timers: new InMemoryTimerStore(),
    timerBroadcaster: new SpyBroadcaster(),
    idGen: { roomIdCandidate: () => 'room0001', participantId: () => `pid-${++n}`, token: () => `tok-${n}` },
    clock: { now: () => 0 },
    wallClock: { now: () => now },
    rateLimiter: allowLimiter,
    random: { randomInt: (k: number) => k - 1 },
    gameTimer: timer,
    maxRooms: 50,
    topicBroadcaster: { sendCurrent: () => {} },
    removeFromRoom: () => {
      throw new Error('removeFromRoom は呼ばれない');
    },
  });
  const clients = ['あ', 'い'].map((name, i) => {
    const sent: ServerMessage[] = [];
    const socket: RoomSocket = { send: (data) => void sent.push(JSON.parse(data) as ServerMessage) };
    const ws: HandlerConnection = { ...socket, data: { connId: `conn-${i}`, participantId: null, roomId: null, rateKey: `k${i}` } };
    return { ws, sent };
  });
  handlers.handleCreateRoom(clients[0]!.ws, { type: 'create-room', name: 'あ' });
  handlers.handleJoinRoom(clients[1]!.ws, { type: 'join-room', roomId: 'room0001', name: 'い' });
  const send = (i: number, msg: ClientMessage) => handlers.dispatch(clients[i]!.ws, msg);
  const table = (i: number) => {
    const states = clients[i]!.sent.filter((m): m is RoomStateMsg => m.type === 'room-state');
    return states[states.length - 1]?.table;
  };
  // 入口: 全員 ☕ → 開く → 再投票 → 全員 ☕ → 開く
  const coffee = () => [0, 1].forEach((i) => send(i, { type: 'vote', card: { kind: 'coffee' } }));
  coffee();
  send(0, { type: 'revote' });
  coffee();
  return {
    handlers,
    clients,
    send,
    table,
    timer,
    advance: (ms: number) => {
      now += ms;
    },
    nowMs: () => now,
  };
}

describe('切断の猶予（#403 G-8）', () => {
  it('Given a は済み、b は未チェンジ / When b が一瞬切れる / Then すぐには開かず、猶予の切れる時刻に判定を予約する', () => {
    const env = setup();
    expect(env.table(0)?.status).toBe('exchanging');
    env.send(0, { type: 'table-exchange', discard: [] });

    env.handlers.detachFromCurrentRoom(env.clients[1]!.ws);

    expect(env.table(0)?.status).toBe('exchanging');
    expect(env.timer.pending.get('room0001')?.secondsLeft).toBeGreaterThan(1);
  });

  it('Given 予約がある / When 猶予が切れて発火する / Then b を待たずに開く', () => {
    const env = setup();
    env.send(0, { type: 'table-exchange', discard: [] });
    env.handlers.detachFromCurrentRoom(env.clients[1]!.ws);

    env.advance((env.timer.pending.get('room0001')?.secondsLeft ?? 0) * 1000);
    env.timer.fire('room0001');

    expect(env.table(0)?.status).toBe('shown');
    expect(env.table(0)?.hands).toHaveLength(2);
    expect(env.timer.pending.has('room0001')).toBe(false);
  });

  it('Given b が切れた / When 猶予の内に戻ってチェンジする / Then 予約は消え、b のチェンジで開く', () => {
    const env = setup();
    env.send(0, { type: 'table-exchange', discard: [] });
    env.handlers.detachFromCurrentRoom(env.clients[1]!.ws);
    env.advance(3000);

    const back = env.clients[1]!;
    env.handlers.handleJoinRoom(back.ws, { type: 'join-room', roomId: 'room0001', name: 'い', token: 'tok-2' });
    expect(env.timer.pending.has('room0001')).toBe(false);
    expect(env.table(1)?.yourHand).toHaveLength(5);

    env.send(1, { type: 'table-exchange', discard: [0] });
    expect(env.table(0)?.status).toBe('shown');
  });
});
