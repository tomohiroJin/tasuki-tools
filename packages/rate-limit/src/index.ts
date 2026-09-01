// normalizeClientAddress はここから公開しない（生の IP アドレスはこのモジュールの
// 外へ出さない。`docs/adr/0012` D3・`client-key.ts` の docstring を参照）。
// テストは ../src/client-key.js から直接 import する。
export { createClientKeyDeriver } from "./client-key.js";
// sync サーバー（timer-sync・poker-sync）の env 解釈の共通化（#103 Task 7 レビュー S-1）。
export { isLoopbackHost, isProductionEnv } from "./server-env.js";
// 例外をログへ出す前の分類の共通化（#103 Task 7 レビュー S-2）。
export { classifyErrorKind } from "./error-kind.js";
// DEFAULT_SWEEP_THRESHOLD / MAX_SWEEP_THRESHOLD はここから公開しない
// （外の製品コードが 1 つも取り込まないため。ADR-0016 追記・#221）。どちらも
// token-bucket.js の中で使う —— 既定値の代入と、上限の検証および例外文言である。
// テストは ../src/token-bucket.js から直接 import する。
//
// ⚠ **非公開にする理由は「利用者がいない」ことだけで、隠す理由があるわけではない**
// （すぐ上の normalizeClientAddress は ADR-0012 D3 の安全上の理由で非公開であり、
// 事情が違う）。**このパッケージには代わりのサブパス入口が無い**
// （package.json の exports は "." だけ）。呼び出し側が sweepThreshold を設定から
// 受け取るようになり、上限を事前に検証したくなったら、ここへ戻すこと。
//
// **宣言側の `export` は残す。** 落とすと 1_000 / 1_000_000 がテストへ複製され、
// 値の変更を検知する検査が値の写しを検査するだけになる（#103 設計正本 D4・
// `SC039C_EXCEPTIONS` が守っているのはこちらであって、列挙の要否とは独立している）。
export {
  createTokenBucketLimiter,
  DEFAULT_CAPACITY,
  DEFAULT_REFILL_PER_SEC,
  type RateLimiter,
  type TokenBucketOptions,
} from "./token-bucket.js";
