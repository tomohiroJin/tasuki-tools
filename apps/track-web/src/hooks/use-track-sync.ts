/**
 * うちわけの同期フック（#476）。
 *
 * **この画面の同期フックはこの 1 本だけである**（`docs/adr/0015` MUST 2）。画面（`.tsx`）は
 * `@tasuki/sync-client` を直接 import せず、ここが返す値と操作だけを使う。
 *
 * - 接続・参加・失敗の扱い・混雑のやり直しは `@tasuki/web-kit/sync` の `useToolRoomSync` が持つ。
 *   ここが持つのは、うちわけのフレーム（写し・名簿・お題）とコマンドだけ
 * - **写しと受け取った時刻は組で持ち、`track` フレームを受けるたびに取り直す。** フレームは送る時点の
 *   時刻軸の位置（`nowMs`）と取り消しの残り（`remainingMs`）を運ぶので、古い基準に新しい値を足さない
 * - 裏のタブは描画も通信も後回しにされる。`visibilitychange` で表に戻ったら `track.sync` を送って取り直す
 *   （参加済みのときだけ。参加前に送ると `NOT_IN_ROOM` になる）
 * - 切断中に押された操作は入り直しより先に届いて `NOT_IN_ROOM` になるので、画面は押させない（`joined` を見る）
 * - 操作の失敗の文は、**自分が次の操作を送ったあとの最初の `track` フレーム**で下ろす
 *   （他の人の操作のフレームで、読む前に消さない。agenda-web と同じ考え方）
 * - **コマンドに、誰が操作したかを表す項目は無い**（設計 §6）
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { DepartureReason, RosterRoom } from '@tasuki/room-core';
import { buildSyncUrl, type ConnectionNoticeKind, type ConnectionStatus } from '@tasuki/sync-client';
import type { TopicState } from '@tasuki/topic-core';
import type { BackMinutes, SegmentEdge, SegmentKind, TrackCommand, TrackView } from '@tasuki/track-core';
import { useToolRoomSync } from '@tasuki/web-kit/sync';
import { DEFAULT_ERROR_TEXT, RETRY_EXHAUSTED_TEXT, RETRY_WAITING_TEXT } from '../copy';
import { parseTrackWebMessage } from '../server-message';

/** 同期サーバーへの URL。**入口は玄関と同じ `/ws` で、ツールはクエリが宣言する**。 */
export function trackSyncUrl(location: { protocol: string; host: string }): string {
  return buildSyncUrl(location, 'track');
}

const TEXTS = {
  defaultError: DEFAULT_ERROR_TEXT,
  retryWaiting: RETRY_WAITING_TEXT,
  retryExhausted: RETRY_EXHAUSTED_TEXT,
} as const;

/** うちわけの操作（画面の部品へ渡す形） */
export interface TrackActions {
  /** 開始と切り替え。`backMin` は「◯ 分前から」 */
  start(label: string, kind: SegmentKind, backMin?: BackMinutes): void;
  stop(backMin?: BackMinutes): void;
  /** 直前の 1 操作を取り消す（`rev` は写しの `undo.rev`） */
  undo(rev: number): void;
  setSegment(id: string, label: string, kind: SegmentKind): void;
  adjustSegment(id: string, edge: SegmentEdge, atMs: number): void;
  splitSegment(id: string, atMs: number, label: string, kind: SegmentKind): void;
  insertSegment(startMs: number, endMs: number, label: string, kind: SegmentKind): void;
  removeSegment(id: string): void;
  pin(label: string, pinned: boolean): void;
  dismissOffer(): void;
  clear(): void;
}

export interface TrackSync extends TrackActions {
  readonly status: ConnectionStatus;
  readonly everConnected: boolean;
  readonly failedAttempts: number;
  readonly syncStale: boolean;
  /** 接続の告知の種類（文と帯は画面が `ConnectionBanner` で描く） */
  readonly notice: ConnectionNoticeKind;
  /** この接続で `room.joined` を受け取ったか（再接続で下りる） */
  readonly joined: boolean;
  /** ルームが見つからないと分かった */
  readonly gone: boolean;
  /** 玄関へ戻す必要がある（端末に復帰の組が無い・合言葉を求められた） */
  readonly needsHub: boolean;
  /** 抜けた・外された（玄関へ理由を運んで戻す） */
  readonly departed: DepartureReason | null;
  /** このルームの参加用 URL */
  readonly inviteUrl: string;
  /** うちわけの写し（最初の `track` フレームまで null） */
  readonly track: TrackView | null;
  /** 写しを受け取った時刻（`performance.now()`）。`track` フレームを受けるたびに更新する */
  readonly receivedAt: number;
  /** 名簿（最初の `roster` フレームまで null） */
  readonly roster: RosterRoom | null;
  /** いまのお題（最初の `topic` フレームまで null） */
  readonly topic: TopicState | null;
  readonly error: string | null;
  readonly retryNotice: string | null;
  clearError(): void;
}

export function useTrackSync(roomCode: string): TrackSync {
  // 写しと受け取った時刻は**組で持つ**（別々に更新すると、新しい写しなのに古い時刻を読む窓ができる）。
  const [slot, setSlot] = useState<{ view: TrackView; receivedAt: number } | null>(null);
  const [roster, setRoster] = useState<RosterRoom | null>(null);
  const [topic, setTopic] = useState<TopicState | null>(null);
  /** 自分の操作を送ってから、その返事（フレームか失敗）をまだ受けていない */
  const awaitingReplyRef = useRef(false);

  const room = useToolRoomSync({
    roomCode,
    syncUrl: trackSyncUrl,
    parse: parseTrackWebMessage,
    texts: TEXTS,
    onFrame: (msg, handlers) => {
      switch (msg.type) {
        case 'track':
          setSlot({ view: msg.state, receivedAt: performance.now() });
          if (awaitingReplyRef.current) handlers.clearError();
          awaitingReplyRef.current = false;
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

  // 表に戻ったら写しを取り直す（裏のタブで止まった時計の分を、サーバーの位置で直す）。
  useEffect(() => {
    if (!joined) return;
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') send({ command: 'track.sync' } satisfies TrackCommand);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [joined, send]);

  const actions = useMemo((): TrackActions => {
    const sendCommand = (cmd: TrackCommand): void => {
      awaitingReplyRef.current = true;
      send(cmd as unknown as Record<string, unknown>);
    };
    // 「いまから」は `backMin` の項目ごと載せない
    const back = (backMin: BackMinutes | undefined): { backMin?: BackMinutes } => (backMin === undefined ? {} : { backMin });
    return {
      start: (label, kind, backMin) => sendCommand({ command: 'track.start', label, kind, ...back(backMin) }),
      stop: (backMin) => sendCommand({ command: 'track.stop', ...back(backMin) }),
      undo: (rev) => sendCommand({ command: 'track.undo', rev }),
      setSegment: (id, label, kind) => sendCommand({ command: 'track.segment.set', id, label, kind }),
      adjustSegment: (id, edge, atMs) => sendCommand({ command: 'track.segment.adjust', id, edge, atMs }),
      splitSegment: (id, atMs, label, kind) => sendCommand({ command: 'track.segment.split', id, atMs, label, kind }),
      insertSegment: (startMs, endMs, label, kind) => sendCommand({ command: 'track.segment.insert', startMs, endMs, label, kind }),
      removeSegment: (id) => sendCommand({ command: 'track.segment.remove', id }),
      pin: (label, pinned) => sendCommand({ command: 'track.pin', label, pinned }),
      dismissOffer: () => sendCommand({ command: 'track.offer.dismiss' }),
      clear: () => sendCommand({ command: 'track.clear' }),
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
      track: slot?.view ?? null,
      receivedAt: slot?.receivedAt ?? 0,
      roster,
      topic,
      error: room.error,
      retryNotice: room.retryNotice,
      clearError: room.clearError,
      ...actions,
    }),
    [room, slot, roster, topic, actions],
  );
}
