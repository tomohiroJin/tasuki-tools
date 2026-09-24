/**
 * お題の検証(#91)。
 *
 * AI が返す JSON はプロンプトの指示に従うとは限らない出力として扱う(信頼しない入力)。
 * `title` / `body` だけを取り出し、`schemas.ts` の境界と同じ上限・空白タイトルの
 * 拒否を通す(spec §5.1 の `validateTopic`)。
 */
import { err, ok, type Result } from "neverthrow";
import * as v from "valibot";
import { bodyStr, titleStr } from "./schemas.js";

/** 利用者または AI が出した、出所の付く前のお題 */
export interface TopicDraft {
  title: string;
  body: string;
}

const TopicDraftSchema = v.object({ title: titleStr, body: bodyStr });

/**
 * {@link validateTopicDraft} が返す失敗の型。
 *
 * `v.safeParse` が失敗したとき返すのは `ValiError` のインスタンスではなく、
 * `issues`(検証に失敗した理由の配列。1 件以上)そのものである。ここではその
 * 実際の値の形に名前を与えている。`TopicDraftSchema` を公開契約から落としているため、
 * `v.InferIssue<typeof TopicDraftSchema>` は外から書けず、`v.BaseIssue<unknown>` で表す
 * (#220 と同じ「非公開の値に依存しない名前を与える」理由)。
 */
export type TopicDraftError = [v.BaseIssue<unknown>, ...v.BaseIssue<unknown>[]];

export function validateTopicDraft(raw: unknown): Result<TopicDraft, TopicDraftError> {
  const result = v.safeParse(TopicDraftSchema, raw);
  return result.success ? ok(result.output) : err(result.issues);
}
