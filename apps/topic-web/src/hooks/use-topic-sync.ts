/**
 * お題ツールの同期フック（#91 PR 2・spec §5.4）。
 *
 * **この画面の同期フックはこの 1 本だけである**（`docs/adr/0015` MUST 2）。画面（`.tsx`）は
 * `@tasuki/sync-client` を直接 import せず、ここが返す値と操作だけを使う。
 *
 * ## ルームへの入り方
 *
 * 名乗りは玄関に 1 つだけある（`docs/adr/0018`）。ここは**端末の復帰の組（玄関・timer・poker と
 * 同じ鍵）で `room.join` を送るだけ**で、組が無い・合言葉を求められたら玄関へ戻す（`needsHub`）。
 * 参加の応答と失敗はハブと同じ形で返る（`apps/tasuki-sync/src/application/topic-handlers.ts`）。
 *
 * ## 接続・参加・やり直しは共通の部品が持つ（#369）
 *
 * 接続・参加・失敗の扱い・混雑のやり直しはルーレットと同じなので、`@tasuki/web-kit/sync` の
 * `useToolRoomSync` が持つ。ここが持つのはお題のフレームとコマンドだけである。
 *
 * ## 送信キューとの付き合い方
 *
 * `SyncConnection` は確立前の送信をキューに溜め、再接続時に**`onReconnected` より先に**流す。
 * 切断中に押された操作は入り直しより先に届いて `NOT_IN_ROOM` になるので、画面は
 * `canOperate`（`topic-view.ts`）で押させない。
 */
import { useMemo, useState } from 'react';
import type { DepartureReason } from '@tasuki/room-core';
import { buildSyncUrl, type ConnectionNoticeKind, type ConnectionStatus } from '@tasuki/sync-client';
import { useToolRoomSync } from '@tasuki/web-kit/sync';
import type { Difficulty, Language, TopicCommand, TopicState } from '@tasuki/topic-core';
import { DEFAULT_ERROR_TEXT, RETRY_EXHAUSTED_TEXT, RETRY_WAITING_TEXT } from '../copy';
import { parseTopicWebMessage } from '../server-message';

/** 接続状態（正本は `@tasuki/sync-client`）。画面の判断（`topic-view.ts`）はここから型だけを取る。 */
export type { ConnectionStatus };

/** 同期サーバーへの URL。**入口は玄関と同じ `/ws` で、ツールはクエリが宣言する**。 */
export function topicSyncUrl(location: { protocol: string; host: string }): string {
  return buildSyncUrl(location, 'topic');
}

const TEXTS = {
  defaultError: DEFAULT_ERROR_TEXT,
  retryWaiting: RETRY_WAITING_TEXT,
  retryExhausted: RETRY_EXHAUSTED_TEXT,
} as const;

export interface TopicSync {
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
  /** いまのお題の状態（最初の `topic` フレームまで null） */
  readonly topicState: TopicState | null;
  readonly error: string | null;
  readonly retryNotice: string | null;
  clearError(): void;
  setTopic(title: string, body: string): void;
  clearTopic(): void;
  generate(mode: 'ai' | 'fallback', language: Language, difficulty: Difficulty): void;
  unlock(key: string): void;
}

export function useTopicSync(roomCode: string): TopicSync {
  const [topicState, setTopicState] = useState<TopicState | null>(null);

  const room = useToolRoomSync({
    roomCode,
    syncUrl: topicSyncUrl,
    parse: parseTopicWebMessage,
    texts: TEXTS,
    onFrame: (msg, handlers) => {
      switch (msg.type) {
        case 'topic':
          // 状態が変わったら、前の操作の失敗の表示は下ろす（残すと、別の人の解錠の後にも
          // 「合言葉が正しくありません」が次に押すまで出続ける）。
          setTopicState(msg.state);
          handlers.clearError();
          return;
        case 'room.joined':
          handlers.joined(msg);
          return;
        case 'error':
          handlers.failed(msg.code, msg.message);
          return;
        default:
          return;
      }
    },
  });

  const { send } = room;
  const actions = useMemo(() => {
    const sendCommand = (cmd: TopicCommand): void => send(cmd as unknown as Record<string, unknown>);
    return {
      setTopic: (title: string, body: string) => sendCommand({ command: 'topic.set', title, body }),
      clearTopic: () => sendCommand({ command: 'topic.clear' }),
      generate: (mode: 'ai' | 'fallback', language: Language, difficulty: Difficulty) =>
        sendCommand({ command: 'topic.generate', mode, language, difficulty }),
      unlock: (key: string) => sendCommand({ command: 'ai.unlock', key }),
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
      topicState,
      error: room.error,
      retryNotice: room.retryNotice,
      clearError: room.clearError,
      ...actions,
    }),
    [room, topicState, actions],
  );
}
