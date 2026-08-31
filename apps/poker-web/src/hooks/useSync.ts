// WS 接続とルーム状態の購読（T012 骨格 → T021 → T045 で拡張）
// 接続はアプリ生存期間で 1 本。切断時は指数バックオフで自動再接続する（US4）
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  parseServerMessage,
  type Card,
  type ClientMessage,
  type ErrorCode,
  type RoomStateMessage,
} from '@tasuki/poker-core';
import { saveIdentity } from '../storage';
import { indicatesStaleState } from '../sync-staleness';

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
  /** この画面で一度でも接続が確立したか（繋がらない/切れたの区別に使う。#76 F-2） */
  everConnected: boolean;
  /** 直近の接続確立以降、連続して接続に失敗した回数 */
  failedAttempts: number;
  /** joined 受信後の自分の識別情報 */
  self: SelfIdentity | null;
  /** 最新の受信者別ルーム状態（受信スナップショットで丸ごと置換。research R1） */
  snapshot: RoomStateMessage | null;
  /**
   * 現在の WS 接続で joined を受信済みか。再接続するとサーバー側は未 join に戻るため、
   * 自動再入室の判定はこのフラグで行う（古い snapshot では判定しない）
   */
  joinedThisConnection: boolean;
  /** 直近のエラー（room-not-found はページ側で専用表示にする。FR-015） */
  error: SyncError | null;
  /**
   * 契約に合わないフレームを捨てて以降、新しい状態を受け取れていない（#212）。
   * 接続は生きているので `status` では表せない。告知の `stale` に使う。
   */
  syncStale: boolean;
  clearError: () => void;
  createRoom: (name: string) => void;
  joinRoom: (roomId: string, name: string, token?: string) => void;
  /** 参加する前にルームの生死だけを尋ねる（#76 J-1）。無ければ room-not-found が返る */
  checkRoom: (roomId: string) => void;
  vote: (card: Card) => void;
  reveal: () => void;
  nextRound: () => void;
}

const MAX_RECONNECT_DELAY_MS = 5_000;

export function usePokerSync(): PokerSync {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [self, setSelf] = useState<SelfIdentity | null>(null);
  const [snapshot, setSnapshot] = useState<RoomStateMessage | null>(null);
  const [joinedThisConnection, setJoinedThisConnection] = useState(false);
  const [error, setError] = useState<SyncError | null>(null);
  // 契約に合わないフレームを捨てて以降、新しい状態を受け取れていない（#212）。
  // 立てるのは「画面を古くする棄却」だけ、下ろすのは有効な joined / room-state のときだけ。
  const [syncStale, setSyncStale] = useState(false);
  // 「一度も繋がっていない」と「使えていたのに切れた」は利用者への伝え方が違う（#76 F-2）
  const [everConnected, setEverConnected] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  /** joined 時に識別情報を保存するため、直近の join/create の名前を控える */
  const pendingNameRef = useRef<string>('');

  useEffect(() => {
    let disposed = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (disposed) return;
      setStatus('connecting');
      const ws = new WebSocket(wsUrl());
      wsRef.current = ws;
      const isCurrent = () => wsRef.current === ws && !disposed;

      ws.addEventListener('open', () => {
        if (!isCurrent()) return;
        attempt = 0;
        setStatus('open');
        setEverConnected(true);
        setFailedAttempts(0);
      });
      ws.addEventListener('close', () => {
        if (!isCurrent()) return;
        setStatus('closed');
        setFailedAttempts((n) => n + 1);
        // 新しい接続はサーバー側で未 join 状態から始まる（再入室は RoomPage が行う）
        setJoinedThisConnection(false);
        // 指数バックオフで再接続（US4。再入室は RoomPage が保存済みトークンで行う）
        const delay = Math.min(500 * 2 ** attempt, MAX_RECONNECT_DELAY_MS);
        attempt += 1;
        timer = setTimeout(connect, delay);
      });
      ws.addEventListener('message', (event) => {
        if (!isCurrent()) return;
        const result = parseServerMessage(String(event.data));
        if (result.isErr()) {
          // 境界検証に失敗したフレームは画面へ渡さない（憲法原則 IV）。
          // **捨てたことは利用者へ伝える（#212）。** 黙って捨てると、画面は生きて
          // 見えたまま古い状態で固まり、利用者には原因が分からない。
          //
          // 立てるのは「画面を古くする棄却」だけ。poker-sync に定期的な room-state
          // 配信は無いので、一度立てると次に誰かが操作するまで下りない。
          //
          // **落ちた項目の経路は出さない。** 本プロトコルのスキーマは v.strictObject で、
          // 送り手が付けた未知のキー名がそのまま経路に載る（実測）。出すのは分類だけ。
          if (indicatesStaleState(result.error.paths)) {
            console.warn('契約に合わないサーバーメッセージを捨てました（表示が古くなります）'); // log-hygiene:allow 分類のみ（経路も値も出さない）
            setSyncStale(true);
          } else {
            console.warn('契約に合わないサーバーメッセージを捨てました（一過性）'); // log-hygiene:allow 同上
          }
          return;
        }
        const msg = result.value;
        switch (msg.type) {
          case 'joined':
            setSelf({ roomId: msg.roomId, participantId: msg.participantId, token: msg.token });
            setJoinedThisConnection(true);
            saveIdentity(msg.roomId, { token: msg.token, name: pendingNameRef.current });
            // 画面が実際に新しい状態を得た。ここと room-state だけが解除点（#212）。
            setSyncStale(false);
            break;
          case 'room-state':
            setSnapshot(msg);
            setError(null); // 正常な状態受信で過去のエラーは解消したとみなす
            setSyncStale(false);
            break;
          case 'error':
            setError({ code: msg.code, message: msg.message });
            break;
        }
      });
    };

    connect();
    return () => {
      disposed = true;
      if (timer !== undefined) clearTimeout(timer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  // アクションは ref と安定な setter しか参照しないため一度だけ生成する
  // （メッセージ受信のたびにコールバック群が新品になり、子のメモ化や effect を無駄に動かすのを防ぐ）
  const actions = useMemo(() => {
    const send = (msg: ClientMessage) => {
      // CONNECTING 中の send は例外になるため、開いている時だけ送る
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(msg));
      }
    };
    return {
      clearError: () => setError(null),
      createRoom: (name: string) => {
        pendingNameRef.current = name;
        setError(null); // 新しい試行で過去のエラーをリセット
        send({ type: 'create-room', name });
      },
      joinRoom: (roomId: string, name: string, token?: string) => {
        pendingNameRef.current = name;
        setError(null);
        send({ type: 'join-room', roomId, name, ...(token !== undefined ? { token } : {}) });
      },
      // 照会は状態を変えないので、過去のエラーもリセットしない
      checkRoom: (roomId: string) => send({ type: 'check-room', roomId }),
      vote: (card: Card) => send({ type: 'vote', card }),
      reveal: () => send({ type: 'reveal' }),
      nextRound: () => send({ type: 'next-round' }),
    };
  }, []);

  return useMemo(
    () => ({
      status,
      everConnected,
      failedAttempts,
      self,
      snapshot,
      joinedThisConnection,
      error,
      syncStale,
      ...actions,
    }),
    [
      status,
      everConnected,
      failedAttempts,
      self,
      snapshot,
      joinedThisConnection,
      error,
      syncStale,
      actions,
    ],
  );
}
