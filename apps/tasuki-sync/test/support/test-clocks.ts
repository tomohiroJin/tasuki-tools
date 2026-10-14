/**
 * テストで依存に渡す単調時計と乱数（#367）。
 *
 * アプリケーション層は大域の時計・乱数を直接呼ばなくなった（`test/application-globals.test.ts`）。
 * 時刻や乱数に頼らないテストは、ここの既定を渡せば以前と同じ値を受け取る。
 * - `testMonotonicClock`: 本番と同じ `performance.now()` の実装（レート制限の補充の計算が以前と同じになる）
 * - `testRandom`: 一様な整数を返す乱数（並び替えの性質だけを見るテスト向け）
 */
import { createPerformanceClock } from "../../src/adapters/performance-clock.js";
import type { MonotonicClock } from "../../src/ports/monotonic-clock.js";
import type { RandomSource } from "../../src/ports/random-source.js";

export const testMonotonicClock: MonotonicClock = createPerformanceClock();

export const testRandom: Pick<RandomSource, "randomInt"> = {
  randomInt: (n) => Math.floor(Math.random() * n),
};
