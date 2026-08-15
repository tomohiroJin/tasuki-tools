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
 * 純粋関数として切り出してあるのは、実際の `deriveClientKey` は
 * `createClientKeyDeriver(randomBytes(32))` で `server.ts` の import 時に
 * 一度だけ作られるモジュールスコープの値であり、そのままでは throw させて
 * 確かめるテストが書けないため。`deriveClientKey` 自体を引数で受け取れる形にし、
 * `server.ts` からは実体を、テストからは throw する偽実装を渡す。
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
