/**
 * ルーレットの同期フック（#94 PR 2・spec §5.6）。
 *
 * **この画面の同期フックはこの 1 本だけである**（`docs/adr/0015` MUST 2）。画面（`.tsx`）は
 * `@tasuki/sync-client` を直接 import せず、ここが返す値と操作だけを使う。
 *
 * ## ルームへの入り方
 *
 * 名乗りは玄関に 1 つだけある（`docs/adr/0018`）。ここは**端末の復帰の組（玄関・timer・poker・お題と
 * 同じ鍵）で `room.join` を送るだけ**で、組が無い・合言葉を求められたら玄関へ戻す（`needsHub`）。
 *
 * ## 回転の時刻の基準（`receivedAt`）
 *
 * 回転は `seq` ごとに 1 回である。**状態を受けるたびに基準を取り直すと、同じ回転が回し直しになる**
 * （円盤が途中でやり直す）ので、`seq` が変わったときだけ `performance.now()` を取る。
 * 経過は `elapsedMs`（サーバーが送る時点で計った値）に、受け取ってからの時間を足して知る。
 *
 * ## 送信キューとの付き合い方
 *
 * `SyncConnection` は確立前の送信をキューに溜め、再接続時に**`onReconnected` より先に**流す。
 * 切断中に押された操作は入り直しより先に届いて `NOT_IN_ROOM` になるので、画面は
 * `canOperate`（`roulette-view.ts`）で押させない。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DepartureReason, RosterRoom } from '@tasuki/room-core';
import {
  SyncConnection,
  buildInviteUrl,
  clearResumeIdentity,
  connectionNoticeKind,
  joinRetryDelayMs,
  loadResumeIdentity,
  planForJoinError,
  saveResumeIdentity,
  type ConnectionNoticeKind,
} from '@tasuki/sync-client';
import type { RouletteCommand, RouletteView } from '@tasuki/roulette-core';
import type { TopicState } from '@tasuki/topic-core';
import { DEFAULT_ERROR_TEXT, RETRY_EXHAUSTED_TEXT, RETRY_WAITING_TEXT } from '../copy';
import { parseRouletteWebMessage } from '../server-message';
import type { ConnectionStatus } from '../roulette-view';

/** 同期サーバーへの URL。**入口は玄関と同じ `/ws` で、ツールはクエリが宣言する**。 */
export function rouletteSyncUrl(location: { protocol: string; host: string }): string {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${location.host}/ws?tool=roulette`;
}

export interface RouletteSync {
  readonly status: ConnectionStatus;
  readonly everConnected: boolean;
  readonly failedAttempts: number;
  readonly syncStale: boolean;
  /** 接続の告知の種類（規則は `@tasuki/sync-client` が持つ。文言は画面が `connectionNotice` で引く） */
  readonly notice: ConnectionNoticeKind;
  /** この接続で `room.joined` を受け取ったか（再接続で下りる） */
  readonly joined: boolean;
  /** ルームが見つからないと分かった */
  readonly gone: boolean;
  /** 玄関へ戻す必要がある（端末に復帰の組が無い・合言葉を求められた） */
  readonly needsHub: boolean;
  /** 抜けた・外された（玄関へ理由を運んで戻す。#290） */
  readonly departed: DepartureReason | null;
  /** このルームの参加用 URL（配るもの。組み立ては `@tasuki/sync-client` が持つ） */
  readonly inviteUrl: string;
  /** 自分の参加者 ID（`room.joined` で知る。一覧の「あなた」の印に使う） */
  readonly selfId: string | null;
  /** ルーレットの状態（最初の `roulette` フレームまで null） */
  readonly roulette: RouletteView | null;
  /** 回転の時刻の基準（`performance.now()`）。`seq` が変わったときだけ更新する */
  readonly receivedAt: number;
  /** 名簿（在室の判定に使う。最初の `roster` フレームまで null） */
  readonly roster: RosterRoom | null;
  /** いまのお題（お題の添え書きに使う。最初の `topic` フレームまで null） */
  readonly topic: TopicState | null;
  readonly error: string | null;
  readonly retryNotice: string | null;
  clearError(): void;
  spin(): void;
  setIncluded(id: string, included: boolean): void;
  addGuest(name: string): void;
  removeGuest(id: string): void;
  resetCycle(): void;
}

export function useRouletteSync(roomCode: string): RouletteSync {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [everConnected, setEverConnected] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [syncStale, setSyncStale] = useState(false);
  const [joined, setJoined] = useState(false);
  const [gone, setGone] = useState(false);
  // **初期値を端末の組で決める。** 組の無い人は繋がずに玄関へ戻す（下の効果も同じ判定で抜ける）。
  const [needsHub, setNeedsHub] = useState(() => loadResumeIdentity(roomCode) === null);
  const [departed, setDeparted] = useState<DepartureReason | null>(null);
  const [selfId, setSelfId] = useState<string | null>(null);
  // ビューと受け取った時刻は**組で持つ**（別々に更新すると、新しい回転なのに古い時刻を読む窓ができる）。
  const [rouletteSlot, setRouletteSlot] = useState<{ view: RouletteView; receivedAt: number } | null>(null);
  const [roster, setRoster] = useState<RosterRoom | null>(null);
  const [topic, setTopic] = useState<TopicState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryNotice, setRetryNotice] = useState<string | null>(null);
  const connRef = useRef<SyncConnection | null>(null);
  /** 混雑で拒まれた回数（入れたら・繋ぎ直したら数え直す）。 */
  const retryRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * `sendJoin` で送った直近の名前（玄関の `use-hub-sync.ts` の `lastJoinRef` と同じ考え方）。
   *
   * `room.joined` の到着時に `localStorage` を読み直すと、応答を待つ間に別のタブが組を
   * 捨てていた場合に空の名前を拾ってしまう。**送った時点の名前をここに残し、それで保存する。**
   */
  const lastJoinRef = useRef<string | null>(null);

  const cancelRetry = useCallback(() => {
    if (retryTimerRef.current === null) return;
    clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
  }, []);

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

    const applyError = (code: string, message: string): void => {
      // 規則は玄関以外のツールの画面で共通（`@tasuki/sync-client`。写しを持たない）。
      const plan = planForJoinError(code, message, DEFAULT_ERROR_TEXT);
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
        case 'retry': {
          // **即時に送り直さない。** 待ち時間とばらつきは `joinRetryDelayMs` が決める（#147）。
          const delay = joinRetryDelayMs((retryRef.current += 1));
          if (delay === null) {
            setRetryNotice(RETRY_EXHAUSTED_TEXT);
            return;
          }
          setRetryNotice(RETRY_WAITING_TEXT);
          cancelRetry();
          retryTimerRef.current = setTimeout(() => {
            retryTimerRef.current = null;
            sendJoin();
          }, delay);
          return;
        }
        case 'show':
          setError(plan.message);
          return;
      }
    };

    const handleMessage = (raw: string): void => {
      const msg = parseRouletteWebMessage(raw);
      if (msg === null) {
        // 境界検証に落ちたフレームは画面へ渡さない（原則 IV）。**捨てたことは必ず伝える**（#212）。
        console.warn('契約に合わないサーバーメッセージを捨てました'); // log-hygiene:allow 固定の文言のみ（経路も値も出さない）
        setSyncStale(true);
        return;
      }
      setSyncStale(false);
      switch (msg.type) {
        case 'roulette': {
          // 状態が変わったら、前の操作の失敗の表示は下ろす（残すと、別の人が直した後にも
          // 「2 人から回せます」が次に押すまで出続ける）。
          const view = msg.state;
          const now = performance.now();
          setRouletteSlot((prev) =>
            // **同じ回転（`seq` が同じ）なら基準を取り直さない。** 取り直すと円盤が回し直しになる。
            // 基準は `receivedAt` と `elapsedMs` の**組**で、片方だけ新しくすると経過を二重に数える
            // （回転中の外す・戻すや再接続で同じ seq が届くたびに、止まる時刻が前へずれる）。
            // 回転以外（外した人・ゲスト・一周の記録）は新しいフレームのものを採る。
            prev !== null && prev.view.spin !== null && prev.view.spin.seq === view.spin?.seq
              ? { view: { ...view, spin: prev.view.spin }, receivedAt: prev.receivedAt }
              : { view, receivedAt: now },
          );
          setError(null);
          return;
        }
        case 'topic':
          setTopic(msg.state);
          return;
        case 'roster':
          setRoster(msg.room);
          return;
        case 'room.joined': {
          // 端末の同一性は 4 つの画面で 1 つ（#95 S5b・D12）。名前は**送ったときのもの**を残す
          // （ここで `localStorage` を読み直すと、応答を待つ間に別のタブが組を捨てていた場合に
          // 空の名前を拾い、次の再接続で空の `displayName` を送ってサーバーに拒まれる）。
          saveResumeIdentity({
            code: msg.code,
            participantId: msg.participantId,
            resumeToken: msg.resumeToken,
            displayName: lastJoinRef.current ?? '',
          });
          retryRef.current = 0;
          setRetryNotice(null);
          // 入れたら、入る前の失敗の表示は下ろす。
          setError(null);
          setSelfId(msg.participantId);
          setJoined(true);
          return;
        }
        case 'error':
          applyError(msg.code, msg.message);
          return;
        default:
          // `room.created` はこの接続へは届かない（届いても読まない）。
          return;
      }
    };

    const conn = new SyncConnection({
      url: rouletteSyncUrl(window.location),
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
        // 繋ぎ直したら数え直して入り直す（前の接続で諦めていても、新しい接続では試してよい）。
        cancelRetry();
        retryRef.current = 0;
        setRetryNotice(null);
        sendJoin();
      },
    });
    connRef.current = conn;
    conn.connect();
    // 確立前の送信はキューに溜まり、開いたときに流れる。
    sendJoin();

    return () => {
      cancelRetry();
      conn.dispose();
      connRef.current = null;
    };
    // 接続はこの画面の生存期間で 1 本（ルームコードはページ読み込みで決まる）。
  }, [roomCode, cancelRetry]);

  const actions = useMemo(() => {
    const send = (cmd: RouletteCommand): void => {
      setError(null);
      connRef.current?.send(cmd as unknown as Record<string, unknown>);
    };
    return {
      clearError: () => setError(null),
      spin: () => send({ command: 'roulette.spin' }),
      setIncluded: (id: string, included: boolean) => send({ command: 'roulette.include', id, included }),
      addGuest: (name: string) => send({ command: 'roulette.guest.add', name }),
      removeGuest: (id: string) => send({ command: 'roulette.guest.remove', id }),
      resetCycle: () => send({ command: 'roulette.cycle.reset' }),
    };
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
      roulette: rouletteSlot?.view ?? null,
      receivedAt: rouletteSlot?.receivedAt ?? 0,
      roster,
      topic,
      error,
      retryNotice,
      ...actions,
    }),
    [status, everConnected, failedAttempts, syncStale, joined, gone, needsHub, departed, roomCode, selfId, rouletteSlot, roster, topic, error, retryNotice, actions],
  );
}
