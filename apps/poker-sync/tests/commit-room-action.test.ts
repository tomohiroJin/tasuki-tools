// 破棄済みのルームに紐づいたままの接続からの状態変更（#171 の対症側）。
//
// `commitRoomAction` は `store.get(roomId)` が空振りしたとき **黙って return** していた。
// `sendError` を通らないので、利用者の画面には何も届かない（「押しても反応しない」）。
// 無応答は最悪の症状なので、エラー応答に変える。
//
// **このテストは in-process で組み立てる。** `handleJoinRoom` の冪等化（#171 の根治側）
// を入れたあと、WS 越しにこの状態を作る経路は残っていないため、
// 「roomId は持っているが保管にルームが無い接続」を直接組み立てて確かめるしかない
// （`tests/create-sync-server.substitution.test.ts` の「配線の穴 2」と同じ作り方）。
import { describe, expect, it } from 'bun:test';
import type { ServerMessage } from '@tasuki/poker-core';
import type { RateLimiter } from '@tasuki/rate-limit';
import { createInMemoryRoomStore } from '../src/adapters/in-memory-room-store';
import { makeHandlers, type HandlerConnection } from '../src/application/handlers';
import type { Broadcaster, RoomSocket } from '../src/ports/broadcaster';
import type { IdGen } from '../src/ports/id-gen';

/** 送信された ServerMessage を記録するだけのソケット */
function spySocket(): RoomSocket & { received: ServerMessage[] } {
  const received: ServerMessage[] = [];
  return { received, send: (data) => void received.push(JSON.parse(data) as ServerMessage) };
}

/** 何もしない Broadcaster（sendTo だけはソケットへ素通しする） */
function passthroughBroadcaster(): Broadcaster {
  return {
    attach: () => undefined,
    detach: () => false,
    resetRoom: () => undefined,
    countIn: () => 0,
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

const alwaysAllowLimiter: RateLimiter = {
  shouldReject: () => false,
  consume: () => undefined,
  sweep: () => undefined,
  size: () => 0,
  sweepRunCount: () => 0,
};

/** ルームを 1 つも持たない保管と、ハンドラ一式を組み立てる */
function setup(data: Partial<HandlerConnection['data']> = {}) {
  const socket = spySocket();
  const handlers = makeHandlers({
    store: createInMemoryRoomStore(), // 何も put しない → get は常に undefined
    broadcaster: passthroughBroadcaster(),
    idGen: unusedIdGen,
    clock: { now: () => 0 },
    rateLimiter: alwaysAllowLimiter,
    maxRooms: 50,
  });
  const ws: HandlerConnection = {
    ...socket,
    data: { participantId: null, roomId: null, rateKey: 'k', ...data },
  };
  return { handlers, ws, received: socket.received };
}

describe('ルームが保管から消えている接続の状態変更（#171）', () => {
  const actions = [
    { label: 'vote', msg: { type: 'vote', card: { kind: 'number', value: 5 } } },
    { label: 'reveal', msg: { type: 'reveal' } },
    { label: 'next-round', msg: { type: 'next-round' } },
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
