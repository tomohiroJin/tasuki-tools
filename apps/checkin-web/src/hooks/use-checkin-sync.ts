/**
 * Check-in Cards の同期フック（#406）。
 *
 * **この画面の同期フックはこの 1 本だけである**（`docs/adr/0015` MUST 2）。画面（`.tsx`）は
 * `@tasuki/sync-client` を直接 import せず、ここが返す値と操作だけを使う。
 *
 * ## ルームへの入り方・接続・参加・やり直し
 *
 * 名乗りは玄関に 1 つだけある（`docs/adr/0018`）。ここは端末の復帰の組で `room.join` を送るだけで、
 * 組が無い・合言葉を求められたら玄関へ戻す（`needsHub`）。接続・参加・失敗の扱い・混雑のやり直しは
 * `@tasuki/web-kit/sync` の `useToolRoomSync` が持つ。ここが持つのは `checkin` フレーム（受け手ごとの
 * 見え方）・名簿・お題とコマンドだけである。
 *
 * ## 状態は受けた形のまま持つ
 *
 * `checkin` フレームは受け手ごとに中身が違う（匿名はサーバーが送らない）。ここで加工・補完はしない。
 * 見せ方の判断は画面と `reveal-view` が持つ。
 *
 * ## 見学
 *
 * 見学は**ルームの中の切り替えだけ**（`setSpectator`）。入るときの指定は持たない
 * （poker の「見学する」と同じ・利用者 2026-10-28）。
 *
 * ## 操作の失敗の表示を下ろすとき
 *
 * `checkin` フレームは他の人の操作でも届く。届くたびに下ろすと、自分の失敗の文が読む前に消える。
 * 下ろすのは **自分が次の操作を送ったあとの最初の `checkin` フレーム**（その操作が通った）だけ。
 * 送った操作が失敗で返ったら待ちを解く。
 *
 * ## 送信キューとの付き合い方
 *
 * `SyncConnection` は確立前の送信をキューに溜め、再接続時に**`onReconnected` より先に**流す。
 * 切断中に押された操作は入り直しより先に届いて `NOT_IN_ROOM` になるので、画面は押させない。
 */
import { useMemo, useRef, useState } from 'react';
import type { DepartureReason, RosterRoom } from '@tasuki/room-core';
import { buildSyncUrl, type ConnectionNoticeKind, type ConnectionStatus } from '@tasuki/sync-client';
import { useToolRoomSync } from '@tasuki/web-kit/sync';
import type { CardId, CheckinCommand, CheckinView, MethodId, Side, Visibility } from '@tasuki/checkin-core';
import type { TopicState } from '@tasuki/topic-core';
import { DEFAULT_ERROR_TEXT, RETRY_EXHAUSTED_TEXT, RETRY_WAITING_TEXT } from '../copy';
import { parseCheckinWebMessage } from '../server-message';

/** 同期サーバーへの URL。**入口は玄関と同じ `/ws` で、ツールはクエリが宣言する**。 */
export function checkinSyncUrl(location: { protocol: string; host: string }): string {
  return buildSyncUrl(location, 'checkin');
}

const TEXTS = {
  defaultError: DEFAULT_ERROR_TEXT,
  retryWaiting: RETRY_WAITING_TEXT,
  retryExhausted: RETRY_EXHAUSTED_TEXT,
} as const;

export interface CheckinSync {
  readonly status: ConnectionStatus;
  readonly everConnected: boolean;
  readonly failedAttempts: number;
  readonly syncStale: boolean;
  /** 接続の告知の種類（規則は `@tasuki/sync-client` が持つ。文言は画面が引く） */
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
  /** 自分の参加者 ID（`room.joined` で知る） */
  readonly selfId: string | null;
  /** 自分に見える札の状態（最初の `checkin` フレームまで null） */
  readonly checkin: CheckinView | null;
  /** 名簿（最初の `roster` フレームまで null） */
  readonly roster: RosterRoom | null;
  /** いまのお題（最初の `topic` フレームまで null） */
  readonly topic: TopicState | null;
  readonly error: string | null;
  readonly retryNotice: string | null;
  clearError(): void;
  /** やり方を選ぶ（新しい回が始まる） */
  chooseMethod(method: MethodId): void;
  /** 始まり／終わりの側から 1 つ引く（いまのやり方は除かれる） */
  drawMethod(side: Side): void;
  /** 札を出す（出し直すと上書き）。`seq` はいまの回の番号 */
  playCard(seq: number, card: CardId): void;
  setVisibility(seq: number, visibility: Visibility): void;
  reveal(seq: number): void;
  /** 同じやり方でもう一回 */
  playAgain(seq: number): void;
  /** 見学の切り替え（ルームの中だけ） */
  setSpectator(spectator: boolean): void;
}

export function useCheckinSync(roomCode: string): CheckinSync {
  const [checkin, setCheckin] = useState<CheckinView | null>(null);
  const [roster, setRoster] = useState<RosterRoom | null>(null);
  const [topic, setTopic] = useState<TopicState | null>(null);
  /** 自分の操作を送ってから、その返事（フレームか失敗）をまだ受けていない */
  const awaitingReplyRef = useRef(false);

  const room = useToolRoomSync({
    roomCode,
    syncUrl: checkinSyncUrl,
    parse: parseCheckinWebMessage,
    texts: TEXTS,
    onFrame: (msg, handlers) => {
      switch (msg.type) {
        case 'checkin':
          setCheckin(msg.state);
          // 失敗の表示は、自分の次の操作が通ったときだけ下ろす（他の人の操作で届いた分では下ろさない）
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

  const { send } = room;

  const actions = useMemo(() => {
    const sendCommand = (cmd: CheckinCommand): void => {
      awaitingReplyRef.current = true;
      send(cmd as unknown as Record<string, unknown>);
    };
    return {
      chooseMethod: (method: MethodId) => sendCommand({ command: 'checkin.method.choose', method }),
      drawMethod: (side: Side) => sendCommand({ command: 'checkin.method.draw', side }),
      playCard: (seq: number, card: CardId) => sendCommand({ command: 'checkin.card.play', seq, card }),
      setVisibility: (seq: number, visibility: Visibility) =>
        sendCommand({ command: 'checkin.visibility.set', seq, visibility }),
      reveal: (seq: number) => sendCommand({ command: 'checkin.reveal', seq }),
      playAgain: (seq: number) => sendCommand({ command: 'checkin.again', seq }),
      setSpectator: (spectator: boolean) => sendCommand({ command: 'checkin.spectator.set', spectator }),
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
      checkin,
      roster,
      topic,
      error: room.error,
      retryNotice: room.retryNotice,
      clearError: room.clearError,
      ...actions,
    }),
    [room, checkin, roster, topic, actions],
  );
}
