/**
 * 完成記録の生成
 * T021: FR-028
 */

import type { CompletionRecord, ServerClock } from "./aggregate.js";
import { elapsedMs } from "./aggregate.js";

/**
 * 記録の ID を作る関数。`now` を受けて `時刻36進-連番36進5桁` を返す。
 *
 * ランダムではなく単調増加にする（テスト可能性のため now + 連番）。
 */
export type RecordIdGenerator = (now: number) => string;

/**
 * 記録の ID の生成器を作る（#364）。連番は生成器ごとにクロージャへ持つ。
 *
 * かつてはモジュールの状態（`let counter`）だった。ドメインはモジュールの状態を持たない
 * （`scripts/audit-domain-side-effects.mjs`）ので、状態は呼び出し側が持つ —— 同期サーバーは
 * プロセスに 1 つ作る（`apps/tasuki-sync/src/application/handlers.ts`）。
 * **ID の形は変えない。** 利用者の端末が記録を保存するときの ID になる。
 */
export function createRecordIdGenerator(): RecordIdGenerator {
  let counter = 0;
  return (now) => {
    counter = (counter + 1) % 100000;
    return `${now.toString(36)}-${counter.toString(36).padStart(5, "0")}`;
  };
}

/**
 * 完成記録の材料になる集約の断面。
 *
 * `rotation` は**長さしか見ない**ので要素の型を問わない。サーバー側の集約
 * （`RotationEntry[]`）と wire の投影（`string[]`）のどちらでも受けるためである。
 * （#91 PR 3 より前は `apps/timer-web` も wire の投影を渡して端末で記録を組み立てていた。
 * いまは端末はサーバーの記録をそのまま保存し、呼び出し元は同期サーバーだけである。）
 */
interface RecordSource {
  session: {
    rotation: readonly unknown[];
    driverCounts: readonly number[];
    totalSwitches: number;
  };
  clock: ServerClock;
}

/**
 * 完成記録を生成する
 * 所要時間は稼働区間のみ積算（停止中は含まない）SC-004
 */
export function buildCompletionRecord(
  agg: RecordSource,
  /**
   * 完了した時点のお題のタイトル。お題なしなら null（#91・spec T9）。
   * timer-core はお題の文脈を知らないので、呼び出し側（同期サーバーのアプリ層）が値として渡す。
   */
  topicTitle: string | null,
  /** ローテーション順の表示名。名簿は timer-core の外にあるので呼び出し側が解決して渡す（#95 D15） */
  memberNames: readonly string[],
  now: number,
  /** 記録の ID の生成器（{@link createRecordIdGenerator}） */
  nextId: RecordIdGenerator,
  roomId?: string,
): CompletionRecord {
  const totalElapsedMs = elapsedMs(agg.clock, now);
  const rotationLen = agg.session.rotation.length;

  return {
    id: nextId(now),
    ...(roomId !== undefined && { roomId }),
    topicTitle,
    elapsedSeconds: Math.round(totalElapsedMs / 1000),
    members: [...memberNames],
    totalSwitches: agg.session.totalSwitches,
    completedAt: now,
    // 振り返り用: ドライバー別回数（rotation と同順）と周回数。
    driverCounts: [...agg.session.driverCounts],
    rounds: rotationLen > 0 ? Math.floor(agg.session.totalSwitches / rotationLen) : 0,
  };
}
