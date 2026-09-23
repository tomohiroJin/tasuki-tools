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
 * 名前を与えているのは、`TopicDraftSchema` を公開契約から落としているためである
 * (#220 と同じ理由。素の `v.ValiError<typeof TopicDraftSchema>` は値が非公開だと
 * 外から注釈を書けない)。
 */
export type TopicDraftError = v.ValiError<typeof TopicDraftSchema>;

export function validateTopicDraft(raw: unknown): Result<TopicDraft, TopicDraftError> {
  const result = v.safeParse(TopicDraftSchema, raw);
  if (result.success) {
    return ok(result.output);
  }
  // `TopicDraftSchema` を公開しないため、`v.ValiError<typeof TopicDraftSchema>` を
  // 型どおりには構築できない(`timer-core` の `validateProblem` と同じ回避)。
  return err(result.issues as never);
}
