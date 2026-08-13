/**
 * ログへ出してよい値だけを型で表す（ADR 0012 D1）。
 *
 * 生の `string` をロガのフィールドへ渡せないようにするのが目的である。
 * 資格情報・個人に紐づく情報は変数名を見ても判別できないため、
 * 「名前で弾く」検査は変数のリネームで黙って空振りする。型で塞げば抜けられない。
 */

declare const logSafeBrand: unique symbol;

/** ロガのフィールドとして渡せる文字列。生成経路は本ファイルの関数のみ。 */
export type LogSafe = string & { readonly [logSafeBrand]: true };

/** ロガのフィールドに置ける値。**生の `string` は含めない。** */
export type LogField = number | boolean | LogSafe;

/**
 * 分類「公開可」の文字列であることを宣言してログへ出す（ADR 0011 のデータ分類）。
 *
 * **これは型の壁を越える唯一の抜け道である。** そのため
 * `apps/timer-sync/src/application/log/vocabulary.ts` の外で呼んではならない。
 * `scripts/audit-log-hygiene.mjs` が呼び出し行に許可マーカーを要求する。
 */
export function publicText(value: string): LogSafe {
  return value as LogSafe;
}
