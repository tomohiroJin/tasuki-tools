/**
 * 参加・操作の失敗から、次の一手を決める（`docs/adr/0015` MUST 1：副作用の無い判断は `.ts` に置く）。
 *
 * 名乗りと合言葉は玄関に 1 つだけある（`docs/adr/0018`）。合言葉を求められたら、ここで聞かずに
 * 玄関へ戻す —— 玄関が名乗りと合言葉を聞き直し、新しい復帰の組を端末に置く。
 */
import type { DepartureReason } from '@tasuki/room-core';
import { DEFAULT_ERROR_TEXT } from './copy';

export type ErrorPlan =
  | { kind: 'gone' }
  | { kind: 'left'; reason: DepartureReason }
  | { kind: 'to-hub' }
  | { kind: 'retry' }
  | { kind: 'show'; message: string };

export function planForError(code: string, message: string): ErrorPlan {
  if (code === 'ROOM_NOT_FOUND') return { kind: 'gone' };
  // 抜けた・外された（timer の `error-action.ts` と同じ対応。`REMOVED_BY_HOST` は旧名で、同じ扱いにする）。
  if (code === 'LEFT_ROOM') return { kind: 'left', reason: 'self' };
  if (code === 'REMOVED_FROM_ROOM' || code === 'REMOVED_BY_HOST') return { kind: 'left', reason: 'removed' };
  if (code === 'PASSPHRASE_REQUIRED' || code === 'PASSPHRASE_MISMATCH') return { kind: 'to-hub' };
  if (code === 'JOIN_RATE_LIMITED') return { kind: 'retry' };
  // 未知のコードも含め、文はサーバーのものを使う（意味を知るのは向こうだけ）。
  // 空白だけの文は見た目で空の箱になるので既定の文に替える（poker-web の useSync と同じ扱い）。
  return { kind: 'show', message: message.trim() === '' ? DEFAULT_ERROR_TEXT : message };
}
