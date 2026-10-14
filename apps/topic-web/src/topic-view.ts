/**
 * お題ツールの画面の判断（`docs/adr/0015` MUST 1）。React にも I/O にも依存しない。
 */
import type { TopicState } from '@tasuki/topic-core';
import { DEGRADED_TEXT, GENERATING_TEXT, RECONNECTING_TEXT, STALE_TEXT, UNREACHABLE_TEXT } from './copy';

// 接続状態の型の正本は `@tasuki/sync-client`（#369）。画面の判断は同期クライアントを読まないので、同期フックが渡す型を使う（型だけの取り込み）。
import type { ConnectionStatus } from './hooks/use-topic-sync';

/**
 * 操作できるか。**切断中と参加前は押させない。**
 *
 * `SyncConnection` は確立前の送信をキューに溜め、再接続時に**入り直しの `room.join` より先に**
 * 流す。押せたままにすると、切断中に押した操作はサーバーで `NOT_IN_ROOM` になる。
 */
export function canOperate(status: ConnectionStatus, joined: boolean): boolean {
  return status === 'open' && joined;
}

/** タイトルを書いてあれば「場に出す」を押せる（空白だけはサーバーも拒む・topic-core の `titleStr`）。 */
export function canSubmitTopic(title: string, enabled: boolean): boolean {
  return enabled && title.trim() !== '';
}

/**
 * タイトルを 1 行にする（#313 正本 D3）。タイトルは各画面で見出しの素の文字として出るので、改行を持たせない。
 * `\r\n` は 1 つの改行として扱う（Windows から貼った文だけ空白が増えないように）。連続する空白は畳まない。
 */
export function toSingleLine(text: string): string {
  return text.replace(/\r\n|\r|\n/g, ' ');
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

/**
 * 告知の種類を利用者向けの文にする。**種類を決める規則（諦めるまでの回数を含む）は
 * `@tasuki/sync-client` の `connectionNoticeKind` にあり、同期フックが引く**（poker・ルーレットと同じ規則。
 * 写しを持たない）。ここは文言を当てるだけである。
 */
export function connectionNotice(kind: ConnectionNotice['kind']): ConnectionNotice {
  switch (kind) {
    case 'none':
      return { kind };
    case 'stale':
      return { kind, text: STALE_TEXT };
    case 'unreachable':
      return { kind, text: UNREACHABLE_TEXT };
    case 'reconnecting':
      return { kind, text: RECONNECTING_TEXT };
  }
}
