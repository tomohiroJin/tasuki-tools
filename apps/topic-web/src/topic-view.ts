/**
 * お題ツールの画面の判断（`docs/adr/0015` MUST 1）。React にも I/O にも依存しない。
 */
import type { TopicState } from '@tasuki/topic-core';
import { DEGRADED_TEXT, GENERATING_TEXT, RECONNECTING_TEXT, STALE_TEXT, UNREACHABLE_TEXT } from './copy';

export type ConnectionStatus = 'connecting' | 'open' | 'closed';

/**
 * 操作できるか。**切断中と参加前は押させない。**
 *
 * `SyncConnection` は確立前の送信をキューに溜め、再接続時に**入り直しの `room.join` より先に**
 * 流す。押せたままにすると、切断中に押した操作はサーバーで `NOT_IN_ROOM` になる。
 */
export function canOperate(status: ConnectionStatus, joined: boolean): boolean {
  return status === 'open' && joined;
}

/** タイトルを書いてあれば「このお題にする」を押せる（空白だけはサーバーも拒む・topic-core の `titleStr`）。 */
export function canSubmitTopic(title: string, enabled: boolean): boolean {
  return enabled && title.trim() !== '';
}

/** 合言葉を書いてあれば「解錠する」を押せる。 */
export function canUnlock(key: string, enabled: boolean): boolean {
  return enabled && key.trim() !== '';
}

/** 生成の知らせ。生成中が優先する（生成を始めると `degraded` は下りる・spec §5.1）。 */
export function generationNotice(state: TopicState | null): string | null {
  if (state === null) return null;
  if (state.generating) return GENERATING_TEXT;
  if (state.degraded) return DEGRADED_TEXT;
  return null;
}

export type ConnectionNotice =
  | { kind: 'none' }
  | { kind: 'reconnecting' | 'unreachable' | 'stale'; text: string };

/** 一度繋がった後、ここまで連続で失敗したら「戻る見込み」を諦めて伝え方を変える（poker-web と同じ値）。 */
const GIVE_UP_AFTER_ATTEMPTS = 3;

/** 接続状態を利用者向けの告知に翻訳する（poker-web の `connection-notice.ts` と同じ規則）。 */
export function connectionNotice(input: {
  readonly status: ConnectionStatus;
  readonly everConnected: boolean;
  readonly failedAttempts: number;
  readonly syncStale: boolean;
}): ConnectionNotice {
  if (input.status === 'open') {
    return input.syncStale ? { kind: 'stale', text: STALE_TEXT } : { kind: 'none' };
  }
  if (input.failedAttempts === 0) return { kind: 'none' };
  if (!input.everConnected || input.failedAttempts >= GIVE_UP_AFTER_ATTEMPTS) {
    return { kind: 'unreachable', text: UNREACHABLE_TEXT };
  }
  return { kind: 'reconnecting', text: RECONNECTING_TEXT };
}
