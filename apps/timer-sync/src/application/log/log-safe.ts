/**
 * ログへ出してよい値だけを型で表す（ADR 0012 D1）。
 *
 * 生の `string` をロガのフィールドへ渡せないようにするのが目的である。
 * 資格情報・個人に紐づく情報は変数名を見ても判別できないため、
 * 「名前で弾く」検査は変数のリネームで黙って空振りする。型で塞げば抜けられない。
 */

declare const logSafeBrand: unique symbol;

/**
 * ロガのフィールドとして渡せる文字列。
 *
 * 生成経路は 2 つ: 本ファイルの `publicText`（分類「公開可」の宣言）と、
 * `ref-encoder.ts` の相関 ID 生成（`as LogSafe` の直接キャスト）。
 * どちらも型の壁を越える抜け道であり、`scripts/audit-log-hygiene.mjs` が
 * 許可ファイル（ALLOWED_FILES）＋許可マーカーの組でしか使えないよう縛る。
 */
export type LogSafe = string & { readonly [logSafeBrand]: true };

/** ロガのフィールドに置ける値。**生の `string` は含めない。** */
export type LogField = number | boolean | LogSafe;

/**
 * 分類「公開可」の文字列であることを宣言してログへ出す（ADR 0011 のデータ分類）。
 *
 * **これは型の壁を越える抜け道の 1 つである**（もう 1 つは `ref-encoder.ts` の
 * `as LogSafe`）。呼び出せるのは `scripts/audit-log-hygiene.mjs` の
 * ALLOWED_FILES に載ったファイルの、許可マーカー付きの行だけ。
 * `vocabulary.ts` の語彙定義に加え、例外の `name` を分類するだけの呼び出し
 * （マーカー付き）を Task 4 の裁定で許可している。
 */
export function publicText(value: string): LogSafe {
  return value as LogSafe; // log-hygiene:allow publicText の本体
}
