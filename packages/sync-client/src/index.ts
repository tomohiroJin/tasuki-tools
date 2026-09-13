/**
 * 同期クライアントの接続部分（#95 D18）。
 *
 * **ツール固有のコマンドと画面状態は持たない。** 持つのは WS の保持・再接続・
 * 指数バックオフ・送信キュー・入室の再試行方針と、**端末に置く同一性の読み書き**
 * （#95 S5b）である。利用者は `apps/landing`（ハブ）・`apps/timer-web`・`apps/poker-web` の 3 つ。
 *
 * 同一性の保存をここへ置いたのは、**同じ鍵（`tasuki:resume:<コード>`）を 3 つの画面が
 * 読み書きするから**である。ずれると「選択画面で名乗った人が、ツールでは別人になる」。
 *
 * **公開するのは、パッケージの外の製品コードが実際に使うものだけである**（#182 の決定）。
 * `ExponentialBackoff` は {@link SyncConnection} の内部実装なので載せない —— 載せると
 * 「公開契約にあるが誰も使わない値」（SC-039④）が増え、外から差し替えられる前提も生まれる。
 *
 * **`export *` を書かない**（`scripts/audit-public-surface.mjs`）。公開する記号はここに列挙する。
 */

// ./connection
export { SyncConnection, type SyncConnectionOptions } from "./connection.js";

// ./join-retry
export { joinRetryDelayMs } from "./join-retry.js";

// ./invite-url
export { buildInviteUrl } from "./invite-url.js";

// ./resume-identity
export {
  saveResumeIdentity,
  loadResumeIdentity,
  clearResumeIdentity,
  saveDefaultDisplayName,
  loadDefaultDisplayName,
  type ResumeIdentity,
} from "./resume-identity.js";
