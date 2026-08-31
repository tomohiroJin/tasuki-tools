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
 *
 * **落ちた項目の経路も返す（`paths`・#212）。** `stage` だけでは、捨てたのが
 * 「画面の状態そのもの」なのか「一過性の通知」なのかを利用側が区別できない。
 * 渡すのは経路だけで、**落ちた値は渡さない**（ADR 0012 のログ衛生）。
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
  /**
   * 落ちた項目の経路（例: `room.config.members.0`）。**値は含まない。**
   *
   * 根で落ちた場合と JSON として読めなかった場合は `["<root>"]` を返す
   * （下の {@link invalidPaths} を参照）。
   *
   * **経路には未検証のキー名が載りうる。** スキーマが `v.strictObject` の場合、
   * 送り手が付けた未知のキーの名前がそのまま経路になる（実測: poker の
   * `ServerMessageSchema` に余剰キー `evilKey` を足すと経路に現れる）。
   * **この値をそのままログや画面へ出さないこと。** 判定に使うだけにする。
   */
  readonly paths: readonly string[];
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
    // 挙げようがないので、根で落ちたときと同じ扱いにする。
    return err({ stage: "json", paths: ROOT_PATHS });
  }

  const parsed = v.safeParse(schema, json);
  if (!parsed.success) {
    return err({ stage: "schema", paths: invalidPaths(parsed.issues) });
  }

  return ok(parsed.output);
}

/** 落ちた項目を挙げられないときの経路。 */
const ROOT_PATHS = ["<root>"] as const;

/**
 * 検証に落ちた項目の経路だけを取り出す。
 *
 * **根（root）で落ちると valibot の `flatten` は `nested` を持たない。**
 * 素の数値・`null`・文字列など「そもそもオブジェクトですらない」入力がこれで、
 * 何もしないと空配列を返す。**最も形が壊れている場面で経路が無言になる**ので、
 * その場合は `<root>` を返して「形そのものが違う」と伝える。
 */
function invalidPaths(issues: [v.BaseIssue<unknown>, ...v.BaseIssue<unknown>[]]): string[] {
  const nested = Object.keys(v.flatten(issues).nested ?? {});
  return nested.length > 0 ? nested : [...ROOT_PATHS];
}
