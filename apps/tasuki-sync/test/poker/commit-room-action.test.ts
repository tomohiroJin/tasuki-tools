// 破棄済みのルームに紐づいたままの接続からの状態変更（#171 の対症側）。
//
// `commitRoomAction` は `store.get(roomId)` が空振りしたとき **黙って return** していた。
// `sendError` を通らないので、利用者の画面には何も届かない（「押しても反応しない」）。
// 無応答は最悪の症状なので、エラー応答に変える。
//
// **このテストは in-process で組み立てる。** `handleJoinRoom` の冪等化（#171 の根治側）
// を入れたあと、WS 越しにこの状態を作る経路は残っていないため、
// 「roomId は持っているが保管にルームが無い接続」を直接組み立てて確かめるしかない
// （`test/poker/create-sync-server.substitution.test.ts` の「配線の穴 2」と同じ作り方）。
import { describe, expect, it } from 'bun:test';
import { SpyBroadcaster } from '../support/spy-broadcaster.js';
import { InMemoryTimerStore } from '../../src/adapters/in-memory-timer-store.js';
import { createRound, type ServerMessage } from '@tasuki/poker-core';
import { ok } from 'neverthrow';
import type { RateLimiter } from '@tasuki/rate-limit';
import { InMemoryRoomStore } from '../../src/adapters/in-memory-room-store';
import { InMemoryRoundStore } from '../../src/adapters/poker-in-memory-round-store';
import { createTokenStore } from '../../src/application/token-store';
import {
  makePokerHandlers,
  type HandlerConnection,
  type PokerRoomState,
} from '../../src/application/poker-handlers';
import { createCommitRoomAction } from '../../src/application/poker-commit-room-action';
import type { PokerBroadcaster, RoomSocket } from '../../src/ports/poker-broadcaster';
import type { IdGen } from '../../src/ports/poker-id-gen';
import { spyHub } from '../support/hub.js';

/** 送信された ServerMessage を記録するだけのソケット */
function spySocket(): RoomSocket & { received: ServerMessage[] } {
  const received: ServerMessage[] = [];
  return { received, send: (data) => void received.push(JSON.parse(data) as ServerMessage) };
}

/** 何もしない PokerBroadcaster（sendTo だけはソケットへ素通しする） */
function passthroughBroadcaster(): PokerBroadcaster {
  return {
    attach: () => undefined,
    detach: () => false,
    resetRoom: () => undefined,
    broadcastSnapshot: () => undefined,
    sendTo: (socket, msg) => socket.send(JSON.stringify(msg)),
  };
}

const unusedIdGen: IdGen = {
  roomIdCandidate: () => {
    throw new Error('roomIdCandidate は呼ばれないはず');
  },
  participantId: () => {
    throw new Error('participantId は呼ばれないはず');
  },
  token: () => {
    throw new Error('token は呼ばれないはず');
  },
};

/** テーブルの山を切る乱数（#403）。このテストでは配らない */
const unusedRandom = {
  randomInt: (): number => {
    throw new Error('randomInt は呼ばれない');
  },
};

const alwaysAllowLimiter: RateLimiter = {
  shouldReject: () => false,
  consume: () => undefined,
  sweep: () => undefined,
  size: () => 0,
  sweepRunCount: () => 0,
};

/** ルームを 1 つも持たない保管と、ハンドラ一式を組み立てる */
function setup(data: Partial<HandlerConnection['data']> = {}, store = new InMemoryRoomStore()) {
  const socket = spySocket();
  const rounds = new InMemoryRoundStore();
  const handlers = makePokerHandlers({
    store, // 既定は何も put しない → get は常に undefined
    rounds,
    tokens: createTokenStore(),
    broadcaster: passthroughBroadcaster(),
    hub: spyHub(),
    timers: new InMemoryTimerStore(),
    timerBroadcaster: new SpyBroadcaster(),
    idGen: unusedIdGen,
    clock: { now: () => 0 },
    wallClock: { now: () => 0 },
    rateLimiter: alwaysAllowLimiter,
    random: unusedRandom,
    maxRooms: 50,
    // お題の配信はこのテストの対象外。
    topicBroadcaster: { sendCurrent: () => {} },
    // このテストでは人を外さない（#419）
    removeFromRoom: () => {
      throw new Error('removeFromRoom は呼ばれない');
    },
  });
  const ws: HandlerConnection = {
    ...socket,
    data: { connId: 'c1', participantId: null, roomId: null, rateKey: 'k', ...data },
  };
  return { handlers, ws, received: socket.received };
}

describe('ルームが保管から消えている接続の状態変更（#171）', () => {
  const actions = [
    { label: 'vote', msg: { type: 'vote', card: { kind: 'number', value: 5 } } },
    { label: 'reveal', msg: { type: 'reveal' } },
    { label: 'next-round', msg: { type: 'next-round' } },
    { label: 'set-item', msg: { type: 'set-item', item: 'A' } },
    { label: 'revote', msg: { type: 'revote' } },
    { label: 'next-item', msg: { type: 'next-item', points: 5 } },
    { label: 'set-points', msg: { type: 'set-points', groupId: 1, points: 5 } },
    { label: 'set-spectator', msg: { type: 'set-spectator', spectator: true } },
    // 人を外す操作も同じ（#419）。参加済みなのにルームが無いのは not-joined ではなく room-not-found
    { label: 'remove-participant', msg: { type: 'remove-participant', participantId: 'p2' } },
  ] as const;

  for (const { label, msg } of actions) {
    it(`${label} は無応答ではなく room-not-found を返す`, () => {
      // Given: 接続は参加中のつもりだが、そのルームは保管に無い
      const { handlers, ws, received } = setup({ participantId: 'p1', roomId: 'gone-room' });

      // When
      handlers.dispatch(ws, msg);

      // Then: 直す前はここが 0 件（黙って落ちる）だった
      expect(received).toEqual([
        { type: 'error', code: 'room-not-found', message: 'ルームが見つかりません' },
      ]);
    });
  }

  it('参加していない接続には従来どおり not-joined を返す（対照）', () => {
    // Given: そもそも join していない接続。上の room-not-found と混ざっていないことを見る
    const { handlers, ws, received } = setup();

    // When
    handlers.dispatch(ws, { type: 'vote', card: { kind: 'number', value: 5 } });

    // Then
    expect(received).toEqual([
      { type: 'error', code: 'not-joined', message: 'ルームに参加していません' },
    ]);
  });
});

// G-9: 名簿に居ない人の操作を拒む（見学の導入で「名簿に居ない＝見学」と誤読されないため）。
// 片付けで外された人の接続が `participantId` を持ち続けても、その操作は何も変えない。
describe('名簿に居ない participantId の操作（G-9）', () => {
  function build(rosterIds: string[]) {
    const committed: unknown[] = [];
    const errors: Array<{ code: string; message: string }> = [];
    const commitRoomAction = createCommitRoomAction({
      loadState: () =>
        ({
          room: { code: 'r1', participants: rosterIds.map((id) => ({ id })) },
          round: createRound(),
        }) as unknown as PokerRoomState,
      commit: (state) => void committed.push(state),
      fragmentsOf: () => [],
      sendError: (_ws, code, message) => void errors.push({ code, message }),
      now: () => 0,
    });
    const ws = { data: { participantId: 'p1', roomId: 'r1' } } as unknown as HandlerConnection;
    return { commitRoomAction, ws, committed, errors };
  }

  it('名簿に居なければ not-joined を返し、commit しない', () => {
    // Given: 名簿に p1 が居ない
    const { commitRoomAction, ws, committed, errors } = build(['p2']);

    // When
    commitRoomAction(ws, (round) => ok(round));

    // Then
    expect(errors).toEqual([{ code: 'not-joined', message: 'ルームに参加していません' }]);
    expect(committed).toEqual([]);
  });

  it('名簿に居れば commit する（対照）', () => {
    // Given
    const { commitRoomAction, ws, committed, errors } = build(['p1']);

    // When
    commitRoomAction(ws, (round) => ok(round));

    // Then
    expect(errors).toEqual([]);
    expect(committed).toHaveLength(1);
  });
});

// 人を外す操作の dispatch 側の門（G-5）。注入した removeFromRoom は呼ばれたら throw するので、
// dispatch が自分で拒んでいること（removeFromRoom の二段目の守りに頼っていないこと）を単独で見る。
describe('remove-participant の dispatch 側の門（G-5）', () => {
  function roomWith(connected: string[]) {
    const store = new InMemoryRoomStore();
    const participants = ['p1', 'p2'].map((id) => ({
      id,
      displayName: id,
      connections: new Map(connected.includes(id) ? [['c-' + id, null]] : []),
    }));
    store.put({ code: 'r1', participants } as never);
    return store;
  }

  it('接続中の対象は not-removable で、removeFromRoom は呼ばれない', () => {
    const { handlers, ws, received } = setup(
      { participantId: 'p1', roomId: 'r1' },
      roomWith(['p2']),
    );

    handlers.dispatch(ws, { type: 'remove-participant', participantId: 'p2' });

    expect(received).toEqual([
      { type: 'error', code: 'not-removable', message: '接続している人は外せません' },
    ]);
  });

  it('自分自身は（接続が無くても）not-removable で、removeFromRoom は呼ばれない', () => {
    const { handlers, ws, received } = setup(
      { participantId: 'p1', roomId: 'r1' },
      roomWith([]),
    );

    handlers.dispatch(ws, { type: 'remove-participant', participantId: 'p1' });

    expect(received).toEqual([
      { type: 'error', code: 'not-removable', message: '接続している人は外せません' },
    ]);
  });
});
