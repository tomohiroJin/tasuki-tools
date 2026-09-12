/**
 * ハブ（選択画面）の同期フック（#95 S5a）。
 *
 * **LP の同期フックはこの 1 本だけである**（`docs/adr/0015` MUST 2・`docs/adr/0019` が
 * 適用範囲を LP へ広げた）。画面は `SyncConnection` を触らず、ここが返す値と操作だけを使う。
 *
 * ## 何をするか
 *
 * 1. `/ws` へ繋ぐ（ハブの入口。`apps/tasuki-sync/src/adapters/ws-adapter.ts` の `HUB_WS_PATH`）
 * 2. 受信は `HubServerMsgSchema` で検める（**境界の検証**・原則 IV）。合わないフレームは捨てる
 * 3. `room.created` / `room.joined` を受けたら、復帰の組と既定の表示名を端末へ保存する
 * 4. 読み込み時、URL の `?room=` に対応する組があれば**名乗らずに復帰する**（R16）
 * 5. 再接続したら、保存済みの組で入り直す
 * 6. 合言葉を求められたら、画面に入力を促す
 * 7. 入室が混雑で弾かれたら、`joinRetryDelayMs` の間隔で自動的に試み直す
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SyncConnection, joinRetryDelayMs } from '@tasuki/sync-client';
import { parseBoundaryMessage } from '@tasuki/protocol';
import { HubServerMsgSchema, type HubCommand, type RosterRoom } from '@tasuki/room-core';
import { readRoomParam } from './room-param.js';
import {
  clearResumeIdentity,
  loadDefaultDisplayName,
  loadResumeIdentity,
  saveDefaultDisplayName,
  saveResumeIdentity,
} from './storage.js';

/** 同期サーバーへの URL。**ハブの入口は `/ws`** で、LP の base（`/`）直下にある。 */
export function buildHubSyncUrl(location: { protocol: string; host: string }): string {
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${location.host}/ws`;
}

export interface HubSync {
  /** URL の `?room=`（無ければ null）。 */
  readonly code: string | null;
  /** そのルームへ参加済みか。 */
  readonly joined: boolean;
  /** 選択画面に映す名簿（未参加なら null）。 */
  readonly roster: RosterRoom | null;
  /** 名乗るフォームの初期値（前に名乗った名前）。 */
  readonly defaultDisplayName: string;
  /** 直前のエラーの文言（無ければ null）。 */
  readonly error: string | null;
  /** 合言葉の入力を求められているか。 */
  readonly needsPassphrase: boolean;
  /** 接続の状態。 */
  readonly connection: 'online' | 'reconnecting';
  createRoom(roomName: string, displayName: string): void;
  joinRoom(displayName: string, passphrase?: string): void;
}

export function useHubSync(): HubSync {
  const code = useMemo(() => readRoomParam(window.location.href), []);
  const [joined, setJoined] = useState(false);
  const [roster, setRoster] = useState<RosterRoom | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsPassphrase, setNeedsPassphrase] = useState(false);
  const [connection, setConnection] = useState<'online' | 'reconnecting'>('online');
  const defaultDisplayName = useMemo(() => loadDefaultDisplayName(), []);

  const connRef = useRef<SyncConnection | null>(null);
  /** 入室の再試行回数（混雑で弾かれたときだけ増える）。 */
  const retryRef = useRef(0);
  /** 自動で入り直すときに使う、直近の名乗り。 */
  const lastJoinRef = useRef<{ displayName: string; passphrase?: string } | null>(null);

  const send = useCallback((cmd: HubCommand) => {
    connRef.current?.send(cmd as unknown as Record<string, unknown>);
  }, []);

  /** 保存済みの組で入り直す（再接続・読み込み時の復帰）。 */
  const resumeIfPossible = useCallback(() => {
    if (code === null) return false;
    const saved = loadResumeIdentity(code);
    if (saved === null) return false;
    send({
      command: 'room.join',
      code,
      displayName: saved.displayName,
      resumeToken: saved.resumeToken,
    });
    return true;
  }, [code, send]);

  useEffect(() => {
    const conn = new SyncConnection({
      url: buildHubSyncUrl(window.location),
      onMessage: (raw) => {
        // 境界の検証（原則 IV）。契約に合わないフレームは**捨てる** ——
        // 画面の状態を壊すより、更新されないほうが害が小さい。
        const parsed = parseBoundaryMessage(HubServerMsgSchema, raw);
        if (parsed.isErr()) return;
        const msg = parsed.value;

        if (msg.type === 'roster') {
          setRoster(msg.room);
          return;
        }
        if (msg.type === 'room.created' || msg.type === 'room.joined') {
          saveResumeIdentity({
            code: msg.code,
            participantId: msg.participantId,
            resumeToken: msg.resumeToken,
            displayName: lastJoinRef.current?.displayName ?? '',
          });
          saveDefaultDisplayName(lastJoinRef.current?.displayName ?? '');
          setJoined(true);
          setError(null);
          setNeedsPassphrase(false);
          retryRef.current = 0;
          // 作成したときは URL に `?room=` が無いので、履歴を汚さず差し替える。
          if (msg.type === 'room.created') {
            const url = new URL(window.location.href);
            url.searchParams.set('room', msg.code);
            window.history.replaceState(null, '', url.toString());
          }
          return;
        }
        // エラー
        if (msg.code === 'PASSPHRASE_REQUIRED' || msg.code === 'PASSPHRASE_MISMATCH') {
          setNeedsPassphrase(true);
          setError(msg.message);
          return;
        }
        if (msg.code === 'JOIN_RATE_LIMITED') {
          // 混雑で弾かれた人を、操作なしで入室まで運ぶ（#147 と同じ方針）。
          const attempt = (retryRef.current += 1);
          const delay = joinRetryDelayMs(attempt);
          const last = lastJoinRef.current;
          if (delay === null || last === null || code === null) {
            setError(msg.message);
            return;
          }
          setError(msg.message);
          setTimeout(() => {
            send({
              command: 'room.join',
              code,
              displayName: last.displayName,
              ...(last.passphrase !== undefined ? { passphrase: last.passphrase } : {}),
            });
          }, delay);
          return;
        }
        if (msg.code === 'ROOM_NOT_FOUND' && code !== null) {
          // **保存済みの組で入れなかったら捨てる。** 残すと、消えたルームへ
          // 毎回入り直そうとして参加画面に戻れない（poker の clearIdentity と同じ扱い）。
          clearResumeIdentity(code);
        }
        setError(msg.message);
      },
      onOpen: () => {
        setConnection('online');
      },
      onConnectionChange: (state) => setConnection(state),
      onReconnected: () => {
        // 切断中に名簿が変わっているので、入り直して新しい名簿を受け取る。
        resumeIfPossible();
      },
    });
    connRef.current = conn;
    conn.connect();

    // 読み込み時の復帰（R16）。同じ端末・同じルームなら名乗りを求めない。
    const saved = code === null ? null : loadResumeIdentity(code);
    if (saved !== null) {
      lastJoinRef.current = { displayName: saved.displayName };
      resumeIfPossible();
    }

    return () => {
      conn.dispose();
      connRef.current = null;
    };
    // 入口の URL はページ読み込みで決まる（全ページ読み込みで WS が張り直しになる・D14）。
  }, [code, resumeIfPossible, send]);

  const createRoom = useCallback(
    (roomName: string, displayName: string) => {
      lastJoinRef.current = { displayName };
      setError(null);
      send({ command: 'room.create', roomName, displayName });
    },
    [send],
  );

  const joinRoom = useCallback(
    (displayName: string, passphrase?: string) => {
      if (code === null) return;
      lastJoinRef.current = { displayName, ...(passphrase !== undefined ? { passphrase } : {}) };
      setError(null);
      retryRef.current = 0;
      send({
        command: 'room.join',
        code,
        displayName,
        ...(passphrase !== undefined ? { passphrase } : {}),
      });
    },
    [code, send],
  );

  return {
    code,
    joined,
    roster,
    defaultDisplayName,
    error,
    needsPassphrase,
    connection,
    createRoom,
    joinRoom,
  };
}
