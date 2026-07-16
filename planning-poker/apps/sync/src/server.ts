// Bun + WebSocket 同期サーバー
// 境界: 受信テキスト → parseClientMessage（Valibot）→ ディスパッチ（憲法原則 IV）
import {
  createRoom,
  joinRoom,
  parseClientMessage,
  type ClientMessage,
  type ErrorCode,
} from '@planning-poker/core';
import { broadcast, dropIfEmpty, generateRoomId, getRoom, putRoom } from './rooms';

/** 接続ごとの状態。join 後に participantId / roomId が入る */
export interface ConnectionData {
  participantId: string | null;
  roomId: string | null;
}

type Ws = Bun.ServerWebSocket<ConnectionData>;

function sendError(ws: Ws, code: ErrorCode, message: string): void {
  ws.send(JSON.stringify({ type: 'error', code, message }));
}

function sendJoined(ws: Ws, roomId: string, participantId: string, token: string): void {
  // token は本人宛の joined でのみ配信する（契約）
  ws.send(JSON.stringify({ type: 'joined', roomId, participantId, token }));
}

function newIds(): { participantId: string; token: string } {
  return { participantId: crypto.randomUUID(), token: crypto.randomUUID() };
}

function handleCreateRoom(ws: Ws, msg: Extract<ClientMessage, { type: 'create-room' }>): void {
  const ids = newIds();
  const result = createRoom(generateRoomId(), msg.name, ids);
  if (result.isErr()) {
    sendError(ws, 'invalid-message', result.error.message);
    return;
  }
  const { room, participant } = result.value;
  const entry = { room, sockets: new Map([[participant.id, ws]]) };
  putRoom(entry);
  ws.data.participantId = participant.id;
  ws.data.roomId = room.id;
  sendJoined(ws, room.id, participant.id, ids.token);
  broadcast(entry);
}

function handleJoinRoom(ws: Ws, msg: Extract<ClientMessage, { type: 'join-room' }>): void {
  const entry = getRoom(msg.roomId);
  if (!entry) {
    sendError(ws, 'room-not-found', 'ルームが見つかりません');
    return;
  }
  // TODO(US4/T044): token 照合による同一参加者の復帰
  const ids = newIds();
  const result = joinRoom(entry.room, msg.name, ids);
  if (result.isErr()) {
    sendError(ws, 'invalid-message', result.error.message);
    return;
  }
  entry.room = result.value.room;
  entry.sockets.set(result.value.participant.id, ws);
  ws.data.participantId = result.value.participant.id;
  ws.data.roomId = entry.room.id;
  sendJoined(ws, entry.room.id, result.value.participant.id, ids.token);
  broadcast(entry);
}

function dispatch(ws: Ws, msg: ClientMessage): void {
  switch (msg.type) {
    case 'create-room':
      handleCreateRoom(ws, msg);
      return;
    case 'join-room':
      handleJoinRoom(ws, msg);
      return;
    case 'vote':
    case 'reveal':
    case 'next-round':
      if (ws.data.participantId === null || ws.data.roomId === null) {
        sendError(ws, 'not-joined', 'ルームに参加していません');
        return;
      }
      // Phase 4 以降（US2/US3）で実装
      return;
  }
}

const server = Bun.serve<ConnectionData, never>({
  port: Number(process.env['PORT'] ?? 3311),
  fetch(req, srv) {
    const url = new URL(req.url);
    if (url.pathname === '/ws') {
      const upgraded = srv.upgrade(req, {
        data: { participantId: null, roomId: null } satisfies ConnectionData,
      });
      if (upgraded) return undefined;
      return new Response('WebSocket upgrade failed', { status: 400 });
    }
    return new Response('Not Found', { status: 404 });
  },
  websocket: {
    message(ws, raw) {
      const result = parseClientMessage(String(raw));
      if (result.isErr()) {
        sendError(ws, result.error.code, result.error.message);
        return;
      }
      dispatch(ws, result.value);
    },
    close(ws) {
      const { participantId, roomId } = ws.data;
      if (participantId === null || roomId === null) return;
      const entry = getRoom(roomId);
      if (!entry) return;
      entry.sockets.delete(participantId);
      // TODO(US4/T044): connected 更新・ホスト繰上・自動公開再評価・配信
      dropIfEmpty(roomId);
    },
  },
});

// テストヘルパがこの 1 行 JSON でポートを検出する（research R7）
console.log(JSON.stringify({ event: 'listening', port: server.port }));
