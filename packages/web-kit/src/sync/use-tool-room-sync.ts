/**
 * ツールの部屋の同期（#369 Task 5。お題・ルーレットの同期フックの共通部分を 1 つにした）。
 *
 * 1 つのルームへ入っているツールの画面（お題・ルーレット）が共通に持つものを持つ。
 *
 * - 接続（`SyncConnection`）と接続の状態（開いた・閉じた・一度でも繋がったか・連続の失敗の数・同期の古さ）
 * - 参加（保存してある復帰の組で `room.join` を送る。組が無ければ玄関へ戻す印を立てる）
 * - 参加の応答（`room.joined`）で、名乗った名前のまま新しい組を保存する
 * - 参加の失敗の扱い（判断は `@tasuki/sync-client` の `planForJoinError`）と、混雑のやり直し（`useJoinRetry`）
 * - 繋ぎ直したら入り直す・切れたらやり直しの予約を捨てる
 *
 * **ツール固有のフレームとコマンドは持たない。** 受け取ったフレームはツールのフック（`onFrame`）へ渡す。
 * ツールのフックは、`room.joined` と `error` を {@link ToolRoomFrameHandlers} で戻す
 * （フレームの型はツールごとに違うので、型の絞り込みはツールの側の `switch` で行う）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  SyncConnection,
  buildInviteUrl,
  clearResumeIdentity,
  connectionNoticeKind,
  loadResumeIdentity,
  planForJoinError,
  saveResumeIdentity,
  type ConnectionNoticeKind,
  type ConnectionStatus,
  type JoinErrorPlan,
  type SyncUrlLocation,
} from '@tasuki/sync-client';
import { useJoinRetry } from './use-join-retry.js';

/** 抜けた理由（`planForJoinError` の `left`）。 */
export type ToolRoomDeparture = Extract<JoinErrorPlan, { kind: 'left' }>['reason'];

/** 参加の応答（`room.joined`）のうち、ここが使う項目。 */
export interface ToolRoomJoined {
  readonly code: string;
  readonly participantId: string;
  readonly resumeToken: string;
}

/** ツールのフックが、共通のフレームを戻す口。 */
export interface ToolRoomFrameHandlers {
  /** `room.joined` を受けた。 */
  joined(frame: ToolRoomJoined): void;
  /** `error` を受けた。 */
  failed(code: string, message: string): void;
  /** 操作の失敗の知らせを下ろす（状態が届いたときなど）。 */
  clearError(): void;
}

export interface ToolRoomSyncOptions<Frame> {
  readonly roomCode: string;
  /** 同期サーバーへの URL（ツールの宣言つき。組み立ては `@tasuki/sync-client` の `buildSyncUrl`）。 */
  readonly syncUrl: (location: SyncUrlLocation) => string;
  /** 受けた文字列をフレームにする。契約に合わなければ null（同期が古い印を立てる）。 */
  readonly parse: (raw: string) => Frame | null;
  /** 契約に合ったフレーム。`room.joined` と `error` は `handlers` へ戻す。 */
  readonly onFrame: (frame: Frame, handlers: ToolRoomFrameHandlers) => void;
  readonly texts: {
    /** サーバーの文が空のときに見せる文。 */
    readonly defaultError: string;
    /** 混雑で待って入り直しているとき。 */
    readonly retryWaiting: string;
    /** 混雑の試行を使い切ったとき。 */
    readonly retryExhausted: string;
  };
}

export interface ToolRoomSync {
  readonly status: ConnectionStatus;
  readonly everConnected: boolean;
  readonly failedAttempts: number;
  readonly syncStale: boolean;
  /** 接続の告知の種類（規則は `@tasuki/sync-client`。文言は画面が引く）。 */
  readonly notice: ConnectionNoticeKind;
  readonly joined: boolean;
  /** ルームが消えていた。 */
  readonly gone: boolean;
  /** 玄関で名乗り直す必要がある（組が無い・合言葉を求められた）。 */
  readonly needsHub: boolean;
  /** 抜けた・外された（玄関へ理由を持って戻る）。 */
  readonly departed: ToolRoomDeparture | null;
  /** このルームの参加用 URL（配るもの）。 */
  readonly inviteUrl: string;
  /** 自分の参加者 ID（参加の応答で分かる）。 */
  readonly selfId: string | null;
  /** 操作の失敗（サーバーの文）。 */
  readonly error: string | null;
  /** 混雑のやり直しの知らせ。 */
  readonly retryNotice: string | null;
  clearError(): void;
  /** コマンドを送る（送る前に操作の失敗の知らせを下ろす）。 */
  send(command: Record<string, unknown>): void;
}

export function useToolRoomSync<Frame>(options: ToolRoomSyncOptions<Frame>): ToolRoomSync {
  const { roomCode } = options;
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [everConnected, setEverConnected] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [syncStale, setSyncStale] = useState(false);
  const [joined, setJoined] = useState(false);
  const [gone, setGone] = useState(false);
  // **初期値を端末の組で決める。** 組の無い人は繋がずに玄関へ戻す（下の効果も同じ判定で抜ける）。
  const [needsHub, setNeedsHub] = useState(() => loadResumeIdentity(roomCode) === null);
  const [departed, setDeparted] = useState<ToolRoomDeparture | null>(null);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const retry = useJoinRetry({ waiting: options.texts.retryWaiting, exhausted: options.texts.retryExhausted });
  const { rateLimited, cancel: cancelRetry, reset: resetRetry } = retry;
  const connRef = useRef<SyncConnection | null>(null);
  /**
   * `sendJoin` で送った直近の名前（玄関の `use-hub-sync.ts` の `lastJoinRef` と同じ考え方）。
   *
   * `room.joined` の到着時に `localStorage` を読み直すと、応答を待つ間に別のタブが組を
   * 捨てていた場合に空の名前を拾ってしまう。**送った時点の名前をここに残し、それで保存する。**
   */
  const lastJoinRef = useRef<string | null>(null);
  // 解析とフレームの扱いは毎回の描画で新しい関数になりうる。接続を張り直さないよう、最新を ref で読む。
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    // 初期化子と効果の間に、別のタブが組を捨てていることがある。**ここでも玄関へ戻す印を立てる**
    // （立てずに return すると、接続も送り返しもしないまま「参加しています」で止まる）。
    // ⚠ この窓はテストで作れない（初期化子と効果の間に `localStorage` を変える手立てが無い）。
    // テストの無い防御なので、消すときはこの注釈ごと判断すること。
    if (loadResumeIdentity(roomCode) === null) {
      setNeedsHub(true);
      return;
    }

    /**
     * 保存済みの組で入る。**毎回読み直す** —— 同じ端末の別のタブが、消えたルームの組を
     * 捨てていることがある（`localStorage` は同じオリジンで共有される）。
     */
    const sendJoin = (): void => {
      const saved = loadResumeIdentity(roomCode);
      if (saved === null) {
        setNeedsHub(true);
        return;
      }
      lastJoinRef.current = saved.displayName;
      conn.send({ command: 'room.join', code: roomCode, displayName: saved.displayName, resumeToken: saved.resumeToken });
    };

    const handlers: ToolRoomFrameHandlers = {
      joined: (frame) => {
        // 端末の同一性は 4 つの画面で 1 つ（#95 S5b・D12）。名前は**送ったときのもの**を残す
        // （ここで `localStorage` を読み直すと、応答を待つ間に別のタブが組を捨てていた場合に
        // 空の名前を拾い、次の再接続で空の `displayName` を送ってサーバーに拒まれる）。
        saveResumeIdentity({
          code: frame.code,
          participantId: frame.participantId,
          resumeToken: frame.resumeToken,
          displayName: lastJoinRef.current ?? '',
        });
        resetRetry();
        // 入れたら、入る前の失敗の表示は下ろす。
        setError(null);
        setSelfId(frame.participantId);
        setJoined(true);
      },
      failed: (code, message) => {
        // 規則は玄関以外のツールの画面で共通（`@tasuki/sync-client`。写しを持たない）。
        const plan = planForJoinError(code, message, optionsRef.current.texts.defaultError);
        switch (plan.kind) {
          case 'gone':
            // 残すと、消えたルームへ毎回入り直そうとする（poker・玄関と同じ扱い）。
            // `left` と同じく接続を畳む —— 畳まないと、後の切断で再接続してしまい、
            // 「見つからない」画面が玄関への送り返しに置き換わる。
            cancelRetry();
            clearResumeIdentity(roomCode);
            conn.dispose();
            setGone(true);
            return;
          case 'left':
            // 抜けた・外された（別のタブの操作でも届く）。timer と同じく、組を捨てて接続を畳み、
            // 理由を持って玄関へ戻る（#290）。**畳まないと「押せるのに効かない」画面が残る。**
            cancelRetry();
            clearResumeIdentity(roomCode);
            conn.dispose();
            setJoined(false);
            setDeparted(plan.reason);
            return;
          case 'to-hub':
            setNeedsHub(true);
            return;
          case 'retry':
            // **即時に送り直さない。** 待ち時間とばらつきは `joinRetryDelayMs` が決める（#147）。
            rateLimited(sendJoin);
            return;
          case 'show':
            setError(plan.message);
            return;
        }
      },
      clearError: () => setError(null),
    };

    const handleMessage = (raw: string): void => {
      const frame = optionsRef.current.parse(raw);
      if (frame === null) {
        // 境界検証に落ちたフレームは画面へ渡さない（原則 IV）。**捨てたことは必ず伝える**（#212）。
        console.warn('契約に合わないサーバーメッセージを捨てました'); // log-hygiene:allow 固定の文言のみ（経路も値も出さない）
        setSyncStale(true);
        return;
      }
      setSyncStale(false);
      optionsRef.current.onFrame(frame, handlers);
    };

    const conn = new SyncConnection({
      url: optionsRef.current.syncUrl(window.location),
      onMessage: handleMessage,
      onOpen: () => {
        setStatus('open');
        setEverConnected(true);
        setFailedAttempts(0);
      },
      onClose: () => {
        // **待っている入り直しを畳む。** 切断中に発火すると `room.join` が送信キューに溜まり、
        // 再接続で `onReconnected` の分と合わせて 2 通流れる（2 通目はサーバーが拒み、
        // 「コマンドの形式が不正です」が出る）。入り直しは `onReconnected` が 1 回だけ行う。
        cancelRetry();
        setStatus('closed');
        setFailedAttempts((n) => n + 1);
        // 新しい接続はサーバー側で未参加から始まる。捨てたフレームの告知も前の接続のもの。
        setJoined(false);
        setSyncStale(false);
      },
      onReconnected: () => {
        cancelRetry();
        resetRetry();
        sendJoin();
      },
    });
    connRef.current = conn;
    conn.connect();
    sendJoin();
    return () => {
      cancelRetry();
      conn.dispose();
      connRef.current = null;
    };
  }, [roomCode, rateLimited, cancelRetry, resetRetry]);

  const clearError = useCallback(() => setError(null), []);
  const send = useCallback((command: Record<string, unknown>) => {
    setError(null);
    connRef.current?.send(command);
  }, []);

  return useMemo(
    () => ({
      status,
      everConnected,
      failedAttempts,
      syncStale,
      notice: connectionNoticeKind({ status, everConnected, failedAttempts, syncStale }),
      joined,
      gone,
      needsHub,
      departed,
      inviteUrl: buildInviteUrl(window.location.origin, roomCode),
      selfId,
      error,
      retryNotice: retry.notice,
      clearError,
      send,
    }),
    [status, everConnected, failedAttempts, syncStale, joined, gone, needsHub, departed, roomCode, selfId, error, retry.notice, clearError, send],
  );
}
