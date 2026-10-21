/**
 * 進行タイマーの同期フック（#429）。
 *
 * **この画面の同期フックはこの 1 本だけである**（`docs/adr/0015` MUST 2）。画面（`.tsx`）は
 * `@tasuki/sync-client` を直接 import せず、ここが返す値と操作だけを使う。
 *
 * ## ルームへの入り方・接続・参加・やり直し
 *
 * 名乗りは玄関に 1 つだけある（`docs/adr/0018`）。ここは端末の復帰の組で `room.join` を送るだけで、
 * 組が無い・合言葉を求められたら玄関へ戻す（`needsHub`）。接続・参加・失敗の扱い・混雑のやり直しは
 * `@tasuki/web-kit/sync` の `useToolRoomSync` が持つ（#369）。ここが持つのは進行タイマーのフレーム
 * （状態・名簿・お題）とコマンドだけである。
 *
 * ## 受け取った時刻の基準（`receivedAt`）
 *
 * ルーレットは回転ごと（`seq` ごと）に基準を決めるが、**進行タイマーは `agenda` フレームを受けるたびに
 * 取り直す。** フレームは送る時点で計った経過（`runElapsedMs` など）を運ぶので、受けた時刻と経過は
 * いつも新しい組で読む（古い基準に新しい経過を足すと二重に数える）。
 *
 * ## 表に戻ったときの取り直し
 *
 * 裏のタブは描画も通信も後回しにされる。`visibilitychange` で表に戻ったら `agenda.sync` を送り、
 * 最新の状態を取り直す（参加済みのときだけ。参加前に送ると `NOT_IN_ROOM` になる）。
 *
 * ## 送信キューとの付き合い方
 *
 * `SyncConnection` は確立前の送信をキューに溜め、再接続時に**`onReconnected` より先に**流す。
 * 切断中に押された操作は入り直しより先に届いて `NOT_IN_ROOM` になるので、画面は押させない。
 *
 * ## 操作の失敗の表示を下ろすとき（最終レビュー M-1）
 *
 * `agenda` フレームは他の人の操作でも届く。届くたびに下ろすと、自分の失敗の文が読む前に消える。
 * 下ろすのは **自分が次の操作を送ったあとの最初の `agenda` フレーム**（その操作が通った）と、
 * **いまのステップが変わったフレーム**（失敗の前提が変わった）だけ。送った操作が失敗で返ったら待ちを解く。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { DepartureReason, RosterRoom } from '@tasuki/room-core';
import { buildSyncUrl, type ConnectionNoticeKind, type ConnectionStatus } from '@tasuki/sync-client';
import { useToolRoomSync } from '@tasuki/web-kit/sync';
import type { AgendaCommand, AgendaView, ExtendMinutes, ScenarioInput } from '@tasuki/agenda-core';
import type { TopicState } from '@tasuki/topic-core';
import { DEFAULT_ERROR_TEXT, RETRY_EXHAUSTED_TEXT, RETRY_WAITING_TEXT } from '../copy';
import { parseAgendaWebMessage } from '../server-message';

/** 同期サーバーへの URL。**入口は玄関と同じ `/ws` で、ツールはクエリが宣言する**。 */
export function agendaSyncUrl(location: { protocol: string; host: string }): string {
  return buildSyncUrl(location, 'agenda');
}

const TEXTS = {
  defaultError: DEFAULT_ERROR_TEXT,
  retryWaiting: RETRY_WAITING_TEXT,
  retryExhausted: RETRY_EXHAUSTED_TEXT,
} as const;

export interface AgendaSync {
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
  /** 進行タイマーの状態（最初の `agenda` フレームまで null） */
  readonly agenda: AgendaView | null;
  /** 受け取った時刻の基準（`performance.now()`）。`agenda` フレームを受けるたびに更新する */
  readonly receivedAt: number;
  /** 名簿（最初の `roster` フレームまで null） */
  readonly roster: RosterRoom | null;
  /** いまのお題（最初の `topic` フレームまで null） */
  readonly topic: TopicState | null;
  readonly error: string | null;
  readonly retryNotice: string | null;
  clearError(): void;
  /** シナリオを置き換える（始まる前だけ） */
  setScenario(input: ScenarioInput): void;
  start(): void;
  next(stepId: string): void;
  pause(): void;
  resume(): void;
  /** いまのステップを延長する（分は 1 / 3 / 5） */
  extend(stepId: string, minutes: ExtendMinutes): void;
  setSkipped(stepId: string, skipped: boolean): void;
  reset(): void;
}

export function useAgendaSync(roomCode: string): AgendaSync {
  // ビューと受け取った時刻は**組で持つ**（別々に更新すると、新しい状態なのに古い時刻を読む窓ができる）。
  const [agendaSlot, setAgendaSlot] = useState<{ view: AgendaView; receivedAt: number } | null>(null);
  const [roster, setRoster] = useState<RosterRoom | null>(null);
  const [topic, setTopic] = useState<TopicState | null>(null);
  /** 自分の操作を送ってから、その返事（フレームか失敗）をまだ受けていない */
  const awaitingReplyRef = useRef(false);
  /** 最後に受けたフレームのいまのステップ（変わったら失敗の表示を下ろす） */
  const lastCurrentIdRef = useRef<string | null | undefined>(undefined);

  const room = useToolRoomSync({
    roomCode,
    syncUrl: agendaSyncUrl,
    parse: parseAgendaWebMessage,
    texts: TEXTS,
    onFrame: (msg, handlers) => {
      switch (msg.type) {
        case 'agenda':
          // 毎フレーム基準を取り直す。失敗の表示は、自分の次の操作が通ったときと、いまのステップが変わったときだけ下ろす
          setAgendaSlot({ view: msg.state, receivedAt: performance.now() });
          if (awaitingReplyRef.current || lastCurrentIdRef.current !== msg.state.currentId) handlers.clearError();
          awaitingReplyRef.current = false;
          lastCurrentIdRef.current = msg.state.currentId;
          return;
        case 'topic':
          setTopic(msg.state);
          return;
        case 'roster':
          setRoster(msg.room);
          return;
        case 'room.joined':
          handlers.joined(msg);
          return;
        case 'error':
          awaitingReplyRef.current = false;
          handlers.failed(msg.code, msg.message);
          return;
        default:
          return;
      }
    },
  });

  const { send, joined } = room;

  // 表に戻ったら状態を取り直す（裏のタブで止まった時計の分を、サーバーの経過で直す）。
  useEffect(() => {
    if (!joined) return;
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') send({ command: 'agenda.sync' } satisfies AgendaCommand);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [joined, send]);

  const actions = useMemo(() => {
    const sendCommand = (cmd: AgendaCommand): void => {
      awaitingReplyRef.current = true;
      send(cmd as unknown as Record<string, unknown>);
    };
    return {
      setScenario: (scenario: ScenarioInput) => sendCommand({ command: 'agenda.scenario.set', scenario: { title: scenario.title, steps: [...scenario.steps], ...(scenario.rounds === undefined ? {} : { rounds: scenario.rounds }) } }),
      start: () => sendCommand({ command: 'agenda.start' }),
      next: (stepId: string) => sendCommand({ command: 'agenda.next', stepId }),
      pause: () => sendCommand({ command: 'agenda.pause' }),
      resume: () => sendCommand({ command: 'agenda.resume' }),
      extend: (stepId: string, minutes: ExtendMinutes) => sendCommand({ command: 'agenda.extend', stepId, minutes }),
      setSkipped: (stepId: string, skipped: boolean) => sendCommand({ command: 'agenda.skip', stepId, skipped }),
      reset: () => sendCommand({ command: 'agenda.reset' }),
    };
  }, [send]);

  return useMemo(
    () => ({
      status: room.status,
      everConnected: room.everConnected,
      failedAttempts: room.failedAttempts,
      syncStale: room.syncStale,
      notice: room.notice,
      joined: room.joined,
      gone: room.gone,
      needsHub: room.needsHub,
      departed: room.departed,
      inviteUrl: room.inviteUrl,
      selfId: room.selfId,
      agenda: agendaSlot?.view ?? null,
      receivedAt: agendaSlot?.receivedAt ?? 0,
      roster,
      topic,
      error: room.error,
      retryNotice: room.retryNotice,
      clearError: room.clearError,
      ...actions,
    }),
    [room, agendaSlot, roster, topic, actions],
  );
}
