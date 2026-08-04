/**
 * 受信テキストを検証済みの値にする、信頼境界のパース。
 *
 * timer / poker の両 sync サーバーと poker の web が、外から来たテキストを
 * 受け取る場所で使う。**外部入力を型の付いた値に変える唯一の入口**にすることで、
 * 「どこかで検証を忘れる」経路を作らない。
 *
 * 失敗の理由は `stage` で返す。JSON として壊れているのか、JSON ではあるが
 * 形が違うのかで、利用側が返したいエラーコードが変わるため
 * （timer は INVALID_JSON / INVALID_COMMAND を区別し、poker は
 * どちらも invalid-message に畳む）。ここで文言やコードを決め打ちしない。
 */

import * as v from "valibot";
import { ok, err, type Result } from "neverthrow";

/** どの段で落ちたか。 */
export type BoundaryStage =
  /** JSON として解釈できなかった */
  | "json"
  /** JSON ではあったが、スキーマに合わなかった */
  | "schema";

export interface BoundaryError {
  readonly stage: BoundaryStage;
}

/**
 * 生テキストを JSON として読み、スキーマで検証する。
 *
 * @param schema 期待する形（Valibot スキーマ）
 * @param raw 受信した生テキスト
 */
export function parseBoundaryMessage<TSchema extends v.GenericSchema>(
  schema: TSchema,
  raw: string,
): Result<v.InferOutput<TSchema>, BoundaryError> {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return err({ stage: "json" });
  }

  const parsed = v.safeParse(schema, json);
  if (!parsed.success) {
    return err({ stage: "schema" });
  }

  return ok(parsed.output);
}
