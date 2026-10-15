/**
 * WS アダプタがログへ出す例外の分類を作る 1 か所（#368 Task 7。`ws-adapter.ts` から分けた）。
 *
 * **ログへ出すのは例外の分類（`name`）だけ**で、例外メッセージは出さない（`docs/adr/0012` D3。
 * `deriveClientKey` の入力は利用者由来の `X-Forwarded-For` で、例外メッセージに載りうる）。
 * `publicText` を呼ぶのは WS アダプタの中でこのファイルだけにしてある
 * （`scripts/audit-log-hygiene.mjs` の `ALLOWED_FILES`）。ロガの event は呼び出し側が文字列リテラルで書く。
 *
 * 分類そのものの実装（`instanceof Error` の実行時判定・`name` ゲッタが throw する場合の入れ子 catch・
 * 長さと文字種の丸め）は `@tasuki/rate-limit` の `classifyErrorKind` が持つ（#103 Task 7 レビュー S-2。
 * 複製すると二重正本の問題が再発する）。
 */
import { classifyErrorKind } from "@tasuki/rate-limit";
import { publicText, type LogSafe } from "../../application/log/log-safe.js";
import { PROTOCOL_LOG_NAMES } from "../../application/log/vocabulary.js";
import type { AcceptedProtocol } from "./connection-gate.js";

/** `classifyErrorKind` が丸めた例外の名前を、ログへ出せる値にする。 */
export function errorName(name: string): LogSafe {
  return publicText(name); // log-hygiene:allow 例外の分類のみ
}

/** `catch (err)` で受けた `err` から、ログへ出してよい「例外の分類」を取り出す（I-1）。 */
export function classifyError(err: unknown): LogSafe {
  return errorName(classifyErrorKind(err));
}

/**
 * `on-message-error` に添える、どの接続の失敗かを示す名前（`protocol` 項目。#381）。
 * 語彙は `PROTOCOL_LOG_NAMES`（`application/log/vocabulary.ts`）。受け口の表の鍵（{@link AcceptedProtocol}）が
 * 語彙に欠けると、型検査が落ちる。
 */
const LOG_NAME_OF = PROTOCOL_LOG_NAMES satisfies Record<AcceptedProtocol, LogSafe>;

export function protocolLogName(protocol: AcceptedProtocol): LogSafe {
  return LOG_NAME_OF[protocol];
}
