/**
 * 同期クライアントの接続部分（#95 D18）。
 *
 * **ツール固有のコマンドと画面状態は持たない。** 持つのは WS の保持・再接続・
 * 指数バックオフ・送信キュー・入室の再試行方針だけである。利用者は `apps/landing`（ハブ）と
 * `apps/timer-web` の 2 つで、S5b（#248）で `apps/poker-web` が加わる。
 *
 * **`export *` を書かない**（`scripts/audit-public-surface.mjs`）。公開する記号はここに列挙する。
 */

// ./connection
export { SyncConnection, type SyncConnectionOptions } from "./connection.js";

// ./backoff
export { ExponentialBackoff, type BackoffOptions } from "./backoff.js";

// ./join-retry
export { JOIN_RETRY_MAX_ATTEMPTS, joinRetryDelayMs } from "./join-retry.js";
