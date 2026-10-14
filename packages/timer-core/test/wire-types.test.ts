/**
 * 手書きの wire の型（`wire.ts` の `Room`）と、境界のスキーマ（`RoomSchema`）の出力が等しいことを
 * **型検査で**守るテスト（#363 Task 2）。
 *
 * 型の正本は手書きの型である（項目ごとの説明を持つドメインの語彙）。スキーマは境界の検証で、
 * 手書きの型と同じ形を受け付けなければならない。片側だけを変えると、ここで型検査（`pnpm typecheck`）が
 * 落ちる。`GenericSchema<T>` の注釈は一方向しか見ない（スキーマに余分な項目が増えても通る）ので、
 * 双方向の等しさで比べる。
 *
 * **任意項目の `| undefined` の差だけは除いて比べる。** valibot の `v.optional` は出力の型に
 * `| undefined` を足すが、手書きの型は `exactOptionalPropertyTypes` のもとで `?: boolean` と書く。
 * JSON は `undefined` を運べないので、wire の値としては同じである。そろえるために
 * `v.exactOptional` へ替えると、実行時に受け付ける値が変わる（#363 計画 §1）。
 */
import { describe, it } from "vitest";
import type * as v from "valibot";
import type { RoomSchema } from "../src/schemas.js";
import type { Room } from "../src/wire.js";

/** 2 つの型が厳密に等しいときだけ `true`。 */
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/** 任意項目のキー。 */
type OptionalKeys<T> = { [K in keyof T]-?: object extends Pick<T, K> ? K : never }[keyof T];

/** 形をそのまま写す（interface と型別名の違いを比べないため）。 */
type Normalize<T> = T extends readonly (infer E)[]
  ? Normalize<E>[]
  : T extends object
    ? { [K in keyof T]: Normalize<T[K]> }
    : T;

/** 任意項目の値から `undefined` を除いて写す。必須項目はそのまま。 */
type WithoutOptionalUndefined<T> = T extends readonly (infer E)[]
  ? WithoutOptionalUndefined<E>[]
  : T extends object
    ? { [K in keyof T]: K extends OptionalKeys<T> ? WithoutOptionalUndefined<Exclude<T[K], undefined>> : WithoutOptionalUndefined<T[K]> }
    : T;

// 等しくなければ、この行で型検査が落ちる
const roomMatchesSchema: Equals<Normalize<Room>, WithoutOptionalUndefined<v.InferOutput<typeof RoomSchema>>> = true;

describe("wire の型とスキーマの等しさ", () => {
  it("Room と RoomSchema の出力の等しさは型検査が見る（実行時には何もしない）", () => {
    // Given / When / Then: 上の定数の型注釈が検査の本体
    void roomMatchesSchema;
  });
});
