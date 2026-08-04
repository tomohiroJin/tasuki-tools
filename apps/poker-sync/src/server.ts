// Bun + WebSocket 同期サーバー
// 境界: 受信テキスト → parseClientMessage（Valibot）→ ディスパッチ（憲法原則 IV）
import type { Result } from 'neverthrow';
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
  type ClientMessage,
  type ErrorCode,
  type Room,
  type RoundError,
} from '@tasuki/poker-core';
import { broadcast, dropIfEmpty, generateRoomId, getRoom, putRoom, type RoomEntry } from './rooms';

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

/**
 * join 成功の完了処理（create / token 復帰 / 新規 join の3経路で共用）。
 * 順序に不変条件がある: socket 登録 → 接続状態の更新 → joined 送信 → 全員へ配信
 */
function completeJoin(ws: Ws, entry: RoomEntry, participantId: string, token: string): void {
  entry.sockets.set(participantId, ws);
  ws.data.participantId = participantId;
  ws.data.roomId = entry.room.id;
  sendJoined(ws, entry.room.id, participantId, token);
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
  const entry: RoomEntry = { room, sockets: new Map() };
  putRoom(entry);
  completeJoin(ws, entry, participant.id, ids.token);
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
  const existing = msg.token !== undefined ? findParticipantByToken(entry.room, msg.token) : undefined;
  if (existing) {
    entry.room = markConnected(entry.room, existing.id);
    completeJoin(ws, entry, existing.id, existing.token);
    return;
  }

  const ids = newIds();
  const result = joinRoom(entry.room, msg.name, ids);
  if (result.isErr()) {
    sendError(ws, 'invalid-message', result.error.message);
    return;
  }
  entry.room = result.value.room;
  completeJoin(ws, entry, result.value.participant.id, ids.token);
}

/**
 * join 済み接続によるルーム状態変更の単一コミットポイント。
 * not-joined 検査 → ドメイン操作 → エラー応答/状態反映 → 自動公開の再評価（FR-008）→ 配信
 * をここで一元的に行う。新しい操作の追加はドメイン関数を渡すだけでよい
 */
function commitRoomAction(
  ws: Ws,
  action: (room: Room, participantId: string) => Result<Room, RoundError>,
): void {
  const { participantId, roomId } = ws.data;
  if (participantId === null || roomId === null) {
    sendError(ws, 'not-joined', 'ルームに参加していません');
    return;
  }
  const entry = getRoom(roomId);
  if (!entry) return;
  const result = action(entry.room, participantId);
  if (result.isErr()) {
    sendError(ws, result.error.code, result.error.message);
    return;
  }
  entry.room = applyAutoReveal(result.value);
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
      commitRoomAction(ws, (room, participantId) => castVote(room, participantId, msg.card));
      return;
    case 'reveal':
      commitRoomAction(ws, revealBy);
      return;
    case 'next-round':
      commitRoomAction(ws, nextRound);
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
