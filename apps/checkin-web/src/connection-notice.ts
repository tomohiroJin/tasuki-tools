/**
 * 接続の告知の種類を文にする（#406）。**種類を決める規則（諦めるまでの回数を含む）は
 * `@tasuki/sync-client` の `connectionNoticeKind` にあり、同期フックが引く**（poker・お題・ルーレットと同じ規則。
 * 写しを持たない）。ここは文言を当てるだけである。
 */
import type { ConnectionNoticeKind } from '@tasuki/sync-client';
import { RECONNECTING_TEXT, STALE_TEXT, UNREACHABLE_TEXT } from './copy';

export type ConnectionNotice = { kind: 'none' } | { kind: Exclude<ConnectionNoticeKind, 'none'>; text: string };

export function connectionNotice(kind: ConnectionNoticeKind): ConnectionNotice {
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
