/**
 * 接続層のエラーの文言と、境界の解析で落ちた段からエラーコードへの対応（#362）。
 *
 * **同期サーバーの中では、接続層のエラーの文言の正本はここ 1 つである。** 文言は wire に載る契約で
 * （憲法 原則 VIII「契約には単一の情報源を宣言する」）、接続層（`adapters/ws-adapter.ts`）と
 * ハブのメッセージ層（`hub-handlers.ts`）がここから取る。
 *
 * ## core の写しについて
 *
 * topic-core・roulette-core の文言の表（`topicErrorMessageFor` / `rouletteErrorMessageFor`）も
 * 同じ 4 つの文を持つ。表が `Record<コード, 文>` で全域なので、接続層のコードの文も持たざるをえない。
 * core は `@tasuki/*` に依存しない（`scripts/audit-dependency-direction.mjs` の `ALLOWED`・
 * `docs/adr/0017` 決定 1・2）ので、ここを取り込めない。**写しが正本と一致することは
 * `test/connection-error-text-sources.test.ts` が守る。**
 *
 * ## poker は別の契約
 *
 * poker のエラーコードはケバブ記法で、境界の解析の失敗は段を問わず 1 つのコードに畳む
 * （`@tasuki/poker-core` の `parseClientMessage`）。ここの対応（{@link boundaryErrorCode}）は
 * timer の系統（timer・ハブ・お題・ルーレット）の決めごとである。`@tasuki/protocol` の
 * `parseBoundaryMessage` がコードを決め打ちしないのはこのためで、対応を protocol へ移してはならない。
 */
import type { BoundaryStage } from "@tasuki/protocol";

/**
 * 接続層のエラーの文言（timer の系統で共通のもの）。
 *
 * `INTERNAL_ERROR` を含め、timer・ハブ・お題・ルーレットの 4 つの接続で同じ文を返す（#381）。
 * かつて timer だけ「内部エラーが発生しました」だったが、この文にそろえた。
 */
export const CONNECTION_ERROR_TEXT = {
  INVALID_JSON: "JSON の形式が不正です",
  INVALID_COMMAND: "コマンドの形式が不正です",
  MESSAGE_TOO_LARGE: "メッセージが大きすぎます",
  INTERNAL_ERROR: "サーバー内部でエラーが発生しました",
} as const;

/** 接続層が文言を持つエラーコード。 */
export type ConnectionErrorCode = keyof typeof CONNECTION_ERROR_TEXT;

/**
 * 接続層のエラーのフレーム。文は {@link CONNECTION_ERROR_TEXT} から引く（コードごとに 1 つ。#362）。
 * timer・ハブ・お題・ルーレットのエラーフレームは、どれもこの形に収まる。
 */
export function connectionErrorFrame<C extends ConnectionErrorCode>(code: C): { type: "error"; code: C; message: string } {
  return { type: "error", code, message: CONNECTION_ERROR_TEXT[code] };
}

/**
 * 境界の解析で落ちた段から、返すエラーコードを決める（timer の系統の決めごと）。
 *
 * JSON として読めなければ `INVALID_JSON`、JSON だが形が違えば `INVALID_COMMAND`。
 */
export function boundaryErrorCode(stage: BoundaryStage): "INVALID_JSON" | "INVALID_COMMAND" {
  return stage === "json" ? "INVALID_JSON" : "INVALID_COMMAND";
}
