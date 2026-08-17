/**
 * `deriveClientKey` を安全に呼ぶ（#103 Task 7 レビュー S-2）。
 *
 * 元の `server.ts` は `fetch` の中で `deriveClientKey(...)` を try/catch なしで
 * 呼んでいた。`deriveClientKey` の入力は利用者由来の `X-Forwarded-For` であり、
 * 例外メッセージに載りうる（`docs/adr/0012` D3）。throw しても呼び出し元を
 * 巻き込まず、鍵は「特定できなかった」扱い（null）にしたうえで、ログには
 * 例外の分類（`classifyErrorKind`）だけを渡す。timer-sync の
 * `deriveClientKeySafely`（`ws-adapter.ts`）と同じ設計。
 *
 * 純粋関数として切り出してあるのは、実際の `deriveClientKey` が
 * `createClientKeyDeriver(randomBytes(32))` によってプロセス起動ごとに一度だけ作られ、
 * そのままでは throw させて確かめるテストが書けないため。`deriveClientKey` 自体を
 * 引数で受け取れる形にし、本番は実体を、テストは throw する偽実装を渡す。
 * 実体を作って渡すのは `create-sync-server.ts`（#165 PR-2 で `server.ts` から移った）で、
 * 受け取って呼ぶのは `adapters/ws-adapter.ts` である。
 */
import { classifyErrorKind } from '@tasuki/rate-limit';

export function deriveClientKeySafely(
  deriveClientKey: (forwardedFor: string | undefined) => string | null,
  forwardedFor: string | undefined,
  onError: (name: string) => void,
): string | null {
  try {
    return deriveClientKey(forwardedFor);
  } catch (err) {
    onError(classifyErrorKind(err));
    return null;
  }
}
