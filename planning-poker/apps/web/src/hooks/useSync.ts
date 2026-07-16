// WS 接続とルーム状態の購読（T012 骨格 → T021 で拡張）
// 接続はアプリ生存期間で 1 本。ルート遷移（トップ→ルーム）をまたいで維持する
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  parseServerMessage,
  type Card,
  type ClientMessage,
  type ErrorCode,
  type RoomStateMessage,
} from '@planning-poker/core';

export type ConnectionStatus = 'connecting' | 'open' | 'closed';

export function wsUrl(): string {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${location.host}/poker/ws`;
}

export interface SelfIdentity {
  roomId: string;
  participantId: string;
  token: string;
}

export interface SyncError {
  code: ErrorCode;
  message: string;
}

export interface PokerSync {
  status: ConnectionStatus;
  /** joined 受信後の自分の識別情報 */
  self: SelfIdentity | null;
  /** 最新の受信者別ルーム状態（受信スナップショットで丸ごと置換。research R1） */
  snapshot: RoomStateMessage | null;
  /** 直近のエラー（room-not-found はページ側で専用表示にする。FR-015） */
  error: SyncError | null;
  clearError: () => void;
  createRoom: (name: string) => void;
  joinRoom: (roomId: string, name: string) => void;
  vote: (card: Card) => void;
  reveal: () => void;
  nextRound: () => void;
}

export function usePokerSync(): PokerSync {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [self, setSelf] = useState<SelfIdentity | null>(null);
  const [snapshot, setSnapshot] = useState<RoomStateMessage | null>(null);
  const [error, setError] = useState<SyncError | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(wsUrl());
    wsRef.current = ws;
    // StrictMode の二重マウントで破棄済み接続のイベントが状態を汚染しないよう、
    // 現役の接続（wsRef.current）のイベントだけを反映する
    const isCurrent = () => wsRef.current === ws;
    ws.addEventListener('open', () => isCurrent() && setStatus('open'));
    ws.addEventListener('close', () => isCurrent() && setStatus('closed'));
    ws.addEventListener('message', (event) => {
      if (!isCurrent()) return;
      const result = parseServerMessage(String(event.data));
      if (result.isErr()) return; // 境界検証に失敗したフレームは無視（憲法原則 IV)
      const msg = result.value;
      switch (msg.type) {
        case 'joined':
          setSelf({ roomId: msg.roomId, participantId: msg.participantId, token: msg.token });
          break;
        case 'room-state':
          setSnapshot(msg);
          break;
        case 'error':
          setError({ code: msg.code, message: msg.message });
          break;
      }
    });
    return () => ws.close();
  }, []);

  return useMemo(() => {
    const send = (msg: ClientMessage) => wsRef.current?.send(JSON.stringify(msg));
    return {
      status,
      self,
      snapshot,
      error,
      clearError: () => setError(null),
      createRoom: (name) => send({ type: 'create-room', name }),
      joinRoom: (roomId, name) => send({ type: 'join-room', roomId, name }),
      vote: (card) => send({ type: 'vote', card }),
      reveal: () => send({ type: 'reveal' }),
      nextRound: () => send({ type: 'next-round' }),
    };
  }, [status, self, snapshot, error]);
}
