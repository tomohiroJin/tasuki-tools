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
import {
  SyncConnection,
  clearResumeIdentity,
  joinRetryDelayMs,
  loadDefaultDisplayName,
  loadResumeIdentity,
  saveDefaultDisplayName,
  saveResumeIdentity,
} from '@tasuki/sync-client';
import { parseBoundaryMessage } from '@tasuki/protocol';
import { HubServerMsgSchema, type HubCommand, type RosterRoom } from '@tasuki/room-core';
import { readRoomParam } from './room-param.js';


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
  /**
   * **ページ読み込みの時点で URL にあったルームコード。以後変わらない。**
   *
   * 接続はこれだけに依存させる（下の `useEffect`）。**いま映しているルーム
   * （{@link code}）に依存させてはいけない** —— ルームを作ると `room.created` で
   * そちらが変わり、**いま使ったばかりの WS を捨てて張り直したうえ、保存したての
   * 復帰の組で `room.join` を送り直す**（無駄な再接続に加えて、切断と再参加が
   * サーバー側で競合し、選択画面の名簿がちらつく）。
   */
  const initialCode = useMemo(() => readRoomParam(window.location.href), []);

  /**
   * いま映しているルーム。
   *
   * **URL の `?room=` だけで決めてはいけない。** ルームを**作った**ときは、その時点まで
   * URL に `room` が無い（サーバーがコードを決めるまで存在しない）。初期値を URL から
   * 取り、`room.created` を受けたらここを進める —— 進めないと、作成が成功しても
   * 「ルームを作る画面」のままになる（E2E が実際にこの形で落ちた）。
   */
  const [code, setCode] = useState<string | null>(initialCode);
  /**
   * {@link code} の現在値を、接続の `useEffect` の中から読むための控え。
   *
   * `onMessage` は張った時点のクロージャを持ち続けるので、素の `code` を読むと
   * **作成前の値（`null`）を見続ける**。接続を張り直さずに現在値を知るために置く。
   */
  const codeRef = useRef<string | null>(initialCode);
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

  /**
   * 保存済みの組で入り直す（再接続・読み込み時の復帰）。
   *
   * **見るのは URL 由来の {@link initialCode} である。** 作成で得たコードを見ると、
   * 作った直後に「復帰」が走って `room.join` を送ってしまう（作成の応答で既に入っている）。
   */
  const resumeIfPossible = useCallback(() => {
    if (initialCode === null) return false;
    const saved = loadResumeIdentity(initialCode);
    if (saved === null) return false;
    send({
      command: 'room.join',
      code: initialCode,
      displayName: saved.displayName,
      resumeToken: saved.resumeToken,
    });
    return true;
  }, [initialCode, send]);

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
          // **画面の側も同時に進める**（URL を書き換えても状態は追随しない）。
          if (msg.type === 'room.created') {
            codeRef.current = msg.code;
            setCode(msg.code);
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
          const target = codeRef.current;
          if (delay === null || last === null || target === null) {
            setError(msg.message);
            return;
          }
          setError(msg.message);
          setTimeout(() => {
            send({
              command: 'room.join',
              code: target,
              displayName: last.displayName,
              ...(last.passphrase !== undefined ? { passphrase: last.passphrase } : {}),
            });
          }, delay);
          return;
        }
        if (msg.code === 'ROOM_NOT_FOUND' && codeRef.current !== null) {
          // **保存済みの組で入れなかったら捨てる。** 残すと、消えたルームへ
          // 毎回入り直そうとして参加画面に戻れない（poker の clearIdentity と同じ扱い）。
          clearResumeIdentity(codeRef.current);
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
    const saved = initialCode === null ? null : loadResumeIdentity(initialCode);
    if (saved !== null) {
      lastJoinRef.current = { displayName: saved.displayName };
      resumeIfPossible();
    }

    return () => {
      conn.dispose();
      connRef.current = null;
    };
    // **依存は URL 由来の値だけにする。** 入口の URL はページ読み込みで決まり
    // （全ページ読み込みで WS が張り直しになる・D14）、作成で得たコードをここへ混ぜると
    // 作成のたびに接続が張り直る（`tests/hub/use-hub-sync.test.tsx` が固定している）。
  }, [initialCode, resumeIfPossible, send]);

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
