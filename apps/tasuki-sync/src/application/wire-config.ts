/**
 * wire の設定（`CommandSchema` の出力）を、ドメインの設定（`TimerConfig`）の型へ写す（#363）。
 *
 * **型の差は、任意項目に `undefined` が入るかどうかの 1 点だけである。** valibot の `v.optional` は
 * 出力の型に `| undefined` を足すが、ドメインの型は `exactOptionalPropertyTypes` のもとで
 * `?: boolean` と書く。値は JSON から来るので、`undefined` を持つことは無い（JSON は `undefined` を
 * 運べない）。したがって実行時には何もせず、型だけを写す。
 *
 * 型の差がこの 1 点だけであることは、`packages/timer-core/test/wire-types.test.ts` が同じ考え方で
 * 守っている（wire の型とスキーマの等しさ）。この関数は、その差を同期サーバーで扱う**唯一の場所**である。
 * 以前は呼び出し側の `as` が、この差を各所で黙って埋めていた。
 */
import type { Command, TimerConfig } from "@tasuki/timer-core";

/** `room.create` の wire の設定。 */
type WireSessionConfig = NonNullable<Extract<Command, { command: "room.create" }>["config"]>;

/** wire の設定をドメインの設定の型にする（実行時には何もしない）。 */
export function toTimerConfig(config: WireSessionConfig): TimerConfig {
  return config as TimerConfig;
}
