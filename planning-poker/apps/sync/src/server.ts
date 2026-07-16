// Bun + WebSocket 同期サーバー
// 境界: 受信テキスト → parseClientMessage（Valibot）→ ディスパッチ（憲法原則 IV）
import { parseClientMessage, type ClientMessage, type ErrorCode } from '@planning-poker/core';

/** 接続ごとの状態。join 後に participantId / roomId が入る */
export interface ConnectionData {
  participantId: string | null;
  roomId: string | null;
}

type Ws = Bun.ServerWebSocket<ConnectionData>;

function sendError(ws: Ws, code: ErrorCode, message: string): void {
  ws.send(JSON.stringify({ type: 'error', code, message }));
}

function dispatch(ws: Ws, msg: ClientMessage): void {
  switch (msg.type) {
    case 'create-room':
    case 'join-room':
      // Phase 3（US1）で実装
      sendError(ws, 'room-not-found', '未実装です');
      return;
    case 'vote':
    case 'reveal':
    case 'next-round':
      if (ws.data.participantId === null) {
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
  },
});

// テストヘルパがこの 1 行 JSON でポートを検出する（research R7）
console.log(JSON.stringify({ event: 'listening', port: server.port }));
