// normalizeClientAddress はここから公開しない（生の IP アドレスはこのモジュールの
// 外へ出さない。`docs/adr/0012` D3・`client-key.ts` の docstring を参照）。
// テストは ../src/client-key.js から直接 import する。
export { createClientKeyDeriver } from "./client-key.js";
// sync サーバー（timer-sync・poker-sync）の env 解釈の共通化（#103 Task 7 レビュー S-1）。
export { isLoopbackHost, isProductionEnv } from "./server-env.js";
// 例外をログへ出す前の分類の共通化（#103 Task 7 レビュー S-2）。
export { classifyErrorKind } from "./error-kind.js";
export {
  createTokenBucketLimiter,
  DEFAULT_CAPACITY,
  DEFAULT_REFILL_PER_SEC,
  DEFAULT_SWEEP_THRESHOLD,
  MAX_SWEEP_THRESHOLD,
  type RateLimiter,
  type TokenBucketOptions,
} from "./token-bucket.js";
