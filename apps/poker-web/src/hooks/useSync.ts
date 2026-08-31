// WS 接続とルーム状態の購読（T012 骨格 → T021 → T045 で拡張）
// 接続はアプリ生存期間で 1 本。切断時は指数バックオフで自動再接続する（US4）
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_ERROR_MESSAGE,
  isKnownErrorCode,
  parseServerMessage,
  type Card,
  type ClientMessage,
  type ErrorCode,
  type RoomStateMessage,
} from '@tasuki/poker-core';
import { saveIdentity } from '../storage';

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
  /**
   * サーバーが増やした未知のコードは `null`（#214・docs/poker/adr/0003 決定 2）。
   *
   * 受信の契約は前方互換のため任意の非空文字列を通すが、**画面が意味を知っているのは
   * `ERROR_CODES` に載っているものだけ**である。`as ErrorCode` で通すと、
   * `ErrorCode` を名乗る嘘の値が画面の分岐へ流れる。
   */
  code: ErrorCode | null;
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
   * 契約に合わないフレームを捨てて以降、契約を満たすフレームを 1 通も受け取っていない（#212）。
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
  // 契約に合わないフレームを捨てて以降、契約を満たすフレームを受け取っていない（#212）。
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
        // 捨てたフレームの告知も前の接続のものなので畳む（#212）。
        // 残すと、**1 通も受け取っていない新しい接続に対して**警告が出続ける。
        setSyncStale(false);
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
          //
          // **捨てたことは必ず利用者へ伝える（#212）。** 黙って捨てると、画面は生きて
          // 見えたまま古い状態で固まり、利用者には原因が分からない。
          //
          // **どのフレームを捨てたかで態度を変えない。** 落ちた項目の経路から
          // 「一過性の棄却」を選り分ける案は採らなかった（`docs/poker/adr/0002` 決定 2 に
          // 実測を記録）。そもそも**捨てて無害なフレームは 1 つも無い** ——
          // `room-state` を捨てれば画面が固まり、`joined` を捨てれば入室が成立せず、
          // `error` を捨てれば消えたルームの案内（#76 J-1）も入室の再試行（#147）も起きない。
          console.warn('契約に合わないサーバーメッセージを捨てました'); // log-hygiene:allow 固定の文言のみ（経路も値も出さない）
          setSyncStale(true);
          return;
        }
        // 契約を満たすフレームが届いた＝サーバーとの間で話が通じている。
        // **poker に定期的なデータフレームは無い**ので、ここで解除しても点滅しない
        // （死活監視は WS の制御フレーム ping で、`onmessage` には来ない）。
        setSyncStale(false);
        const msg = result.value;
        switch (msg.type) {
          case 'joined':
            setSelf({ roomId: msg.roomId, participantId: msg.participantId, token: msg.token });
            setJoinedThisConnection(true);
            saveIdentity(msg.roomId, { token: msg.token, name: pendingNameRef.current });
            break;
          case 'room-state':
            setSnapshot(msg);
            setError(null); // 正常な状態受信で過去のエラーは解消したとみなす
            break;
          case 'error':
            // 未知のコードは畳む。意味を知らないコードから専用画面や再試行を起こすと、
            // 無関係な対処へ利用者を誘導することになる（docs/poker/adr/0003 決定 2）。
            // 文言はサーバーのものを使う —— 未知のコードの意味を知るのは向こうだけである。
            setError({
              code: isKnownErrorCode(msg.code) ? msg.code : null,
              message: msg.message === '' ? DEFAULT_ERROR_MESSAGE : msg.message,
            });
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
