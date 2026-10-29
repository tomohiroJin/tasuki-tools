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
import { Scheduler } from '../../src/application/schedule';
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

function setup({ names = ['あ', 'い'], realScheduler = false }: { names?: string[]; realScheduler?: boolean } = {}) {
  let now = 1_000_000;
  let n = 0;
  const fake = fakeTimer();
  // 本物の Scheduler は、締切を過ぎた予約（残り 0 以下）をその場で同期に呼ぶ。偽物はそれをしないので、
  // 「猶予が切れても開けない」ときの再予約の連鎖（コードレビュー 2026-10-29 の Critical）は本物でしか再現しない
  const real = new Scheduler({ now: () => now });
  const timer = realScheduler ? real : fake;
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
  const clients = names.map((name, i) => {
    const sent: ServerMessage[] = [];
    const socket: RoomSocket = { send: (data) => void sent.push(JSON.parse(data) as ServerMessage) };
    const ws: HandlerConnection = { ...socket, data: { connId: `conn-${i}`, participantId: null, roomId: null, rateKey: `k${i}` } };
    return { ws, sent };
  });
  clients.forEach((c, i) => {
    if (i === 0) handlers.handleCreateRoom(c.ws, { type: 'create-room', name: names[0]! });
    else handlers.handleJoinRoom(c.ws, { type: 'join-room', roomId: 'room0001', name: names[i]! });
  });
  const send = (i: number, msg: ClientMessage) => handlers.dispatch(clients[i]!.ws, msg);
  const table = (i: number) => {
    const states = clients[i]!.sent.filter((m): m is RoomStateMsg => m.type === 'room-state');
    return states[states.length - 1]?.table;
  };
  // 入口: 全員 ☕ → 開く → 再投票 → 全員 ☕ → 開く
  const coffee = () => clients.forEach((_, i) => send(i, { type: 'vote', card: { kind: 'coffee' } }));
  coffee();
  send(0, { type: 'revote' });
  coffee();
  return {
    handlers,
    clients,
    send,
    table,
    timer: fake,
    real,
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

describe('猶予が切れても開けないとき（#403 G-8a・コードレビュー 2026-10-29 の Critical）', () => {
  it('Given b は未チェンジで接続中・c は未チェンジのまま切れた / When 猶予が過ぎてから a が操作する / Then 落ちず、待ち続け、予約も残らない', () => {
    const env = setup({ names: ['あ', 'い', 'う'], realScheduler: true });
    env.send(0, { type: 'table-exchange', discard: [] });
    env.handlers.detachFromCurrentRoom(env.clients[2]!.ws);
    env.advance(60_000);

    const before = env.clients[1]!.sent.length;
    expect(() => env.send(0, { type: 'set-item', item: 'ログイン' })).not.toThrow();

    // b がまだチェンジしていないので開かない。配信は操作の 1 通だけ（予約の連鎖で配り続けない）
    expect(env.table(1)?.status).toBe('exchanging');
    expect(env.clients[1]!.sent.length - before).toBe(1);
    env.real.clearAll();
  });

  it('Given a は未チェンジで接続中・c は未チェンジのまま切れた / When 誰も操作せずに猶予が切れる / Then 予約の発火で落ちない', async () => {
    const env = setup({ names: ['あ', 'い', 'う'], realScheduler: true });
    env.send(1, { type: 'table-exchange', discard: [] });
    env.handlers.detachFromCurrentRoom(env.clients[2]!.ws);
    // 本物の Scheduler は最大 1 秒刻みで待ち直すので、壁時計を先へ進めてから 1 刻みぶん待つ
    env.advance(60_000);
    await new Promise((r) => setTimeout(r, 1100));
    expect(env.table(0)?.status).toBe('exchanging');
    env.real.clearAll();
  });
});

