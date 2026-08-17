/**
 * Broadcaster アダプタ（接続レジストリ）の単体テスト（#165 T4 レビュー C-2）。
 *
 * `createWsBroadcaster()` は in-process で動くので WS サーバーは立てない。
 * `RoomSocket` は `send(data: string): void` だけのインタフェースなので、
 * 受け取りを記録するだけのオブジェクトで足りる。
 *
 * ここで守るのは **「新規ルームの接続レジストリを作り直す」** 操作である。
 * ポート化のとき旧 `handleCreateRoom` の `socketsByRoom.set(room.id, new Map())` が
 * 落ちており、`attach` は `byRoom.get(roomId) ?? new Map()` で既存を再利用するため、
 * 到達不能なルームに残った接続が同一 ID の再採番で別ルームの配信を受けてしまった。
 */
import { describe, expect, it } from 'bun:test';
import { createRoom, type Room } from '@tasuki/poker-core';
import { createWsBroadcaster } from '../src/adapters/ws-broadcaster';
import type { RoomSocket } from '../src/ports/broadcaster';

/** 受け取った本文を記録するだけのソケット */
function recordingSocket(): RoomSocket & { readonly received: string[] } {
  const received: string[] = [];
  return {
    received,
    send: (data) => {
      received.push(data);
    },
  };
}

function roomOf(roomId: string, hostId: string): Room {
  return createRoom(roomId, 'たろう', { participantId: hostId, token: 'tok' })._unsafeUnwrap()
    .room;
}

describe('createWsBroadcaster', () => {
  it('resetRoom はそのルーム ID の接続を作り直し、古い接続には配信しない', () => {
    const broadcaster = createWsBroadcaster();
    const oldSocket = recordingSocket();
    const newSocket = recordingSocket();

    // Given: 到達不能になったルーム 'x' に、古い接続が残ったままである
    broadcaster.attach('x', 'A', oldSocket);

    // When: 同じ ID 'x' が再採番され、新しいルームが作られる
    broadcaster.resetRoom('x');
    broadcaster.attach('x', 'B', newSocket);
    broadcaster.broadcastSnapshot('x', roomOf('x', 'B'));

    // Then: 新しいルームの接続だけが受け取る
    expect(newSocket.received).toHaveLength(1);
    expect(oldSocket.received).toHaveLength(0);
  });
});
