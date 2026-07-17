// Bun + WebSocket 同期サーバー
// 境界: 受信テキスト → parseClientMessage（Valibot）→ ディスパッチ（憲法原則 IV）
import {
  applyAutoReveal,
  castVote,
  createRoom,
  findParticipantByToken,
  joinRoom,
  markConnected,
  markDisconnected,
  nextRound,
  parseClientMessage,
  revealBy,
  type Card,
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

/**
 * 接続を現在のルームから切り離す共通処理（close と再 join/再 create で共用）。
 * connected 更新・ホスト繰上（FR-012）・自動公開の再評価（US4-AS1）・
 * 接続数 0 での即時破棄（FR-014）をここで一元的に行う。
 */
function detachFromCurrentRoom(ws: Ws): void {
  const { participantId, roomId } = ws.data;
  ws.data.participantId = null;
  ws.data.roomId = null;
  if (participantId === null || roomId === null) return;
  const entry = getRoom(roomId);
  if (!entry) return;
  // 同一参加者が別ソケットで再接続済みなら（socket が入れ替わっていたら）何もしない
  if (entry.sockets.get(participantId) !== ws) return;
  entry.sockets.delete(participantId);

  if (entry.sockets.size === 0) {
    dropIfEmpty(roomId);
    return;
  }

  entry.room = applyAutoReveal(markDisconnected(entry.room, participantId));
  broadcast(entry);
}

function handleCreateRoom(ws: Ws, msg: Extract<ClientMessage, { type: 'create-room' }>): void {
  // すでに別ルームに参加中のソケット（二重送信・SPA 遷移）は先に切り離す
  detachFromCurrentRoom(ws);
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

  // 参加先の存在を確認してから、参加中の別ルームを切り離す（二重送信・SPA 遷移対策）
  detachFromCurrentRoom(ws);

  // token 照合による同一参加者の復帰（FR-013）。一致すれば name は無視する
  if (msg.token !== undefined) {
    const existing = findParticipantByToken(entry.room, msg.token);
    if (existing) {
      entry.room = markConnected(entry.room, existing.id);
      entry.sockets.set(existing.id, ws);
      ws.data.participantId = existing.id;
      ws.data.roomId = entry.room.id;
      sendJoined(ws, entry.room.id, existing.id, existing.token);
      broadcast(entry);
      return;
    }
  }

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

/** join 済み接続のルーム内操作。ドメイン操作の Result をエラー応答/配信へ写す */
function handleRoomAction(
  ws: Ws,
  action: (roomId: string, participantId: string) => void,
): void {
  const { participantId, roomId } = ws.data;
  if (participantId === null || roomId === null) {
    sendError(ws, 'not-joined', 'ルームに参加していません');
    return;
  }
  action(roomId, participantId);
}

function handleVote(ws: Ws, card: Card): void {
  handleRoomAction(ws, (roomId, participantId) => {
    const entry = getRoom(roomId);
    if (!entry) return;
    const result = castVote(entry.room, participantId, card);
    if (result.isErr()) {
      sendError(ws, result.error.code, result.error.message);
      return;
    }
    entry.room = applyAutoReveal(result.value); // 全員投票なら即 revealed（FR-008）
    broadcast(entry);
  });
}

function handleReveal(ws: Ws): void {
  handleRoomAction(ws, (roomId, participantId) => {
    const entry = getRoom(roomId);
    if (!entry) return;
    const result = revealBy(entry.room, participantId);
    if (result.isErr()) {
      sendError(ws, result.error.code, result.error.message);
      return;
    }
    entry.room = result.value;
    broadcast(entry);
  });
}

function handleNextRound(ws: Ws): void {
  handleRoomAction(ws, (roomId, participantId) => {
    const entry = getRoom(roomId);
    if (!entry) return;
    const result = nextRound(entry.room, participantId);
    if (result.isErr()) {
      sendError(ws, result.error.code, result.error.message);
      return;
    }
    entry.room = result.value;
    broadcast(entry);
  });
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
      handleVote(ws, msg.card);
      return;
    case 'reveal':
      handleReveal(ws);
      return;
    case 'next-round':
      handleNextRound(ws);
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
      detachFromCurrentRoom(ws);
    },
  },
});

// テストヘルパがこの 1 行 JSON でポートを検出する（research R7）
console.log(JSON.stringify({ event: 'listening', port: server.port }));
