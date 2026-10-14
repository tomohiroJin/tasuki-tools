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
 * ## 接続・参加・やり直しは共通の部品が持つ（#369）
 *
 * 接続・参加・失敗の扱い・混雑のやり直しはお題ツールと同じなので、`@tasuki/web-kit/sync` の
 * `useToolRoomSync` が持つ。ここが持つのはルーレットのフレーム（状態・名簿・お題）とコマンドだけである。
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
import { useMemo, useState } from 'react';
import type { DepartureReason, RosterRoom } from '@tasuki/room-core';
import { buildSyncUrl, type ConnectionNoticeKind, type ConnectionStatus } from '@tasuki/sync-client';
import { useToolRoomSync } from '@tasuki/web-kit/sync';
import type { RouletteCommand, RouletteView } from '@tasuki/roulette-core';
import type { TopicState } from '@tasuki/topic-core';
import { DEFAULT_ERROR_TEXT, RETRY_EXHAUSTED_TEXT, RETRY_WAITING_TEXT } from '../copy';
import { parseRouletteWebMessage } from '../server-message';

/** 接続状態（正本は `@tasuki/sync-client`）。画面の判断（`roulette-view.ts`）はここから型だけを取る。 */
export type { ConnectionStatus };

/** 同期サーバーへの URL。**入口は玄関と同じ `/ws` で、ツールはクエリが宣言する**。 */
export function rouletteSyncUrl(location: { protocol: string; host: string }): string {
  return buildSyncUrl(location, 'roulette');
}

const TEXTS = {
  defaultError: DEFAULT_ERROR_TEXT,
  retryWaiting: RETRY_WAITING_TEXT,
  retryExhausted: RETRY_EXHAUSTED_TEXT,
} as const;

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
  // ビューと受け取った時刻は**組で持つ**（別々に更新すると、新しい回転なのに古い時刻を読む窓ができる）。
  const [rouletteSlot, setRouletteSlot] = useState<{ view: RouletteView; receivedAt: number } | null>(null);
  const [roster, setRoster] = useState<RosterRoom | null>(null);
  const [topic, setTopic] = useState<TopicState | null>(null);

  const room = useToolRoomSync({
    roomCode,
    syncUrl: rouletteSyncUrl,
    parse: parseRouletteWebMessage,
    texts: TEXTS,
    onFrame: (msg, handlers) => {
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
          handlers.clearError();
          return;
        }
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
          handlers.failed(msg.code, msg.message);
          return;
        default:
          return;
      }
    },
  });

  const { send } = room;
  const actions = useMemo(() => {
    const sendCommand = (cmd: RouletteCommand): void => send(cmd as unknown as Record<string, unknown>);
    return {
      spin: () => sendCommand({ command: 'roulette.spin' }),
      setIncluded: (id: string, included: boolean) => sendCommand({ command: 'roulette.include', id, included }),
      addGuest: (name: string) => sendCommand({ command: 'roulette.guest.add', name }),
      removeGuest: (id: string) => sendCommand({ command: 'roulette.guest.remove', id }),
      resetCycle: () => sendCommand({ command: 'roulette.cycle.reset' }),
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
      roulette: rouletteSlot?.view ?? null,
      receivedAt: rouletteSlot?.receivedAt ?? 0,
      roster,
      topic,
      error: room.error,
      retryNotice: room.retryNotice,
      clearError: room.clearError,
      ...actions,
    }),
    [room, rouletteSlot, roster, topic, actions],
  );
}
