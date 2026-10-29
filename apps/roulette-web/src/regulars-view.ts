/**
 * いつものメンツを入れるときの画面の判断（#458 設計 §6）。React にも I/O にも依存しない。
 *
 * ルーレットの通信には返事が無いので、知らせは押した時点の状態から、サーバーと**同じ関数**
 * （`addGuests`・`poolOf`）で数えて組む。間に誰かが名前を足していなければサーバーと一致する
 * （ずれるのは知らせの数だけで、状態はサーバーが正）。
 */
import { conflictsWithExisting } from '@tasuki/room-core';
import { MAX_WHEEL, addGuests, poolOf, type Member, type RouletteView } from '@tasuki/roulette-core';
import {
  ALL_PRESENT_TEXT,
  NONE_ADDED_OVERFLOW_TEXT,
  addedText,
  overflowText,
  skippedText,
  tooManyInPoolText,
} from './copy';
import { stateOf } from './roulette-view';

export interface BatchPlan {
  /** 足した人数 */
  added: number;
  /** 名簿・ゲストと同じ名前でとばした人数 */
  skipped: number;
  /** ゲストの上限で入らなかった人数 */
  overflow: number;
  /** 入れた後の「入る人」の数 */
  poolAfter: number;
}

/** 組の名前を入れたら何人入るか。受け取った状態と名簿で、サーバーと同じ `addGuests` を呼ぶ。 */
export function planBatch(input: { view: RouletteView; members: readonly Member[]; names: readonly string[] }): BatchPlan {
  const { view, members, names } = input;
  const batch = addGuests(stateOf(view), names, members, conflictsWithExisting);
  return {
    added: batch.added.length,
    skipped: batch.skipped.length,
    overflow: batch.overflow.length,
    // 足した人は誰とも同名でないので、いまの入る人に足すだけでよい。
    // （`stateOf` は `nextGuestSeq` を持たないので、足した後の状態から数えると新しい ID が既存の `g-1`… とぶつかる）
    poolAfter: poolOf(members, stateOf(view), conflictsWithExisting).length + batch.added.length,
  };
}

/** 入れた後の知らせ（`role="status"` の 1 文）。区切りは句点。 */
export function batchNoticeText(plan: BatchPlan): string {
  const { added, skipped, overflow, poolAfter } = plan;
  const parts: string[] = [];
  if (added > 0) {
    parts.push(addedText(added));
    if (skipped > 0) parts.push(skippedText(skipped));
    if (overflow > 0) parts.push(overflowText(overflow));
  } else if (overflow > 0) {
    parts.push(NONE_ADDED_OVERFLOW_TEXT);
  } else if (skipped > 0) {
    parts.push(ALL_PRESENT_TEXT);
  }
  if (poolAfter > MAX_WHEEL) parts.push(tooManyInPoolText(poolAfter));
  return parts.join('。');
}
