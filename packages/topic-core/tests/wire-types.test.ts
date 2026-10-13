/**
 * 手書きの型（`topic.ts` の `Topic`・`TopicState`）と、境界のスキーマ（`TopicSchema`・
 * `TopicStateSchema`）の出力が等しいことを**型検査で**守るテスト（#363 Task 2）。
 *
 * 型の正本は手書きの型である（項目ごとの説明を持つドメインの語彙）。片側だけを変えると、
 * ここで型検査（`pnpm typecheck`）が落ちる。`GenericSchema<T>` の注釈は一方向しか見ないので、
 * 双方向の等しさで比べる。
 */
import { describe, it } from "vitest";
import type * as v from "valibot";
import type { TopicSchema, TopicStateSchema } from "../src/schemas.js";
import type { Topic, TopicState } from "../src/topic.js";

/** 2 つの型が厳密に等しいときだけ `true`。 */
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/** 形をそのまま写す（interface と型別名の違いを比べないため）。 */
type Normalize<T> = T extends object ? { [K in keyof T]: Normalize<T[K]> } : T;

// 等しくなければ、この行で型検査が落ちる
const topicMatchesSchema: Equals<Normalize<Topic>, Normalize<v.InferOutput<typeof TopicSchema>>> = true;
const topicStateMatchesSchema: Equals<Normalize<TopicState>, Normalize<v.InferOutput<typeof TopicStateSchema>>> =
  true;

describe("wire の型とスキーマの等しさ", () => {
  it("Topic・TopicState とスキーマの出力の等しさは型検査が見る（実行時には何もしない）", () => {
    // Given / When / Then: 上の定数の型注釈が検査の本体
    void topicMatchesSchema;
    void topicStateMatchesSchema;
  });
});
