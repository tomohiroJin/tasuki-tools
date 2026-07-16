// WS 接続フック（骨格）。room-state 購読・joined 処理は US1（T021）で拡張する
import { useEffect, useRef, useState } from 'react';
import { parseServerMessage, type ClientMessage, type ServerMessage } from '@planning-poker/core';

export type ConnectionStatus = 'connecting' | 'open' | 'closed';

export function wsUrl(): string {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${location.host}/poker/ws`;
}

export interface SyncConnection {
  status: ConnectionStatus;
  send: (msg: ClientMessage) => void;
}

/** WS を開き、検証済み ServerMessage をコールバックへ流す */
export function useSync(onMessage: (msg: ServerMessage) => void): SyncConnection {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    const ws = new WebSocket(wsUrl());
    wsRef.current = ws;
    ws.addEventListener('open', () => setStatus('open'));
    ws.addEventListener('close', () => setStatus('closed'));
    ws.addEventListener('message', (event) => {
      const result = parseServerMessage(String(event.data));
      if (result.isOk()) onMessageRef.current(result.value);
      // 検証に失敗したフレームは無視（境界検証。憲法原則 IV）
    });
    return () => ws.close();
  }, []);

  return {
    status,
    send: (msg) => wsRef.current?.send(JSON.stringify(msg)),
  };
}
