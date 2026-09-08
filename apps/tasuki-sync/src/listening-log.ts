/**
 * `server.ts` の起動ログ（"listening" イベント）に出すフィールドを組み立てる。
 *
 * **純粋関数として切り出してある。** `server.ts` はエントリポイントであり、
 * import した時点で env 読み込み・実サーバーの起動・SIGTERM ハンドラ登録という
 * 副作用が走るため、そのままではテストプロセスを巻き込んでしまう。
 * フィールドの組み立てだけをここへ出すことで、副作用なしに検証できる。
 */
import type { LogField } from "./application/log/log-safe.js";
import { isLoopbackHost, type SyncConfig } from "./config.js";

/**
 * host / aiProblemModel は運用者が env で設定する自由文字列（利用者由来ではない）。
 * とはいえ `LogField` は string を受け付けないため（ADR 0012 D1）、値そのものではなく
 * 「既定値どおりか」を真偽値で出す。既定から外れていれば運用者は自分で設定した env を
 * 見に行けば実値が分かるので、journal だけでの気づき（deploy/README.md ⑤の確認）は保てる。
 *
 * `requireClientAddress` を含めるのは P-1（敵対的レビュー）対応。真偽値なので
 * ログ衛生（ADR 0012 D3）には触れないが、`journalctl` から本番の接続時
 * fail-closed が有効かどうかを運用者が確認できるようにする。
 *
 * `loopbackOnly` は `config.host === "127.0.0.1"` の直書きをやめ、`isLoopbackHost`
 * （`config.ts` の許可リスト）に揃えてある（P-3）。旧実装は `localhost` / `::1` /
 * `127.1.2.3` などループバックである HOST を loopbackOnly=false と誤って出していた。
 *
 * @param port **実際に bind したポート**。`config.port` を渡してはならない ——
 *   `PORT=0`（OS に空きポートを選ばせる）で起動したとき 0 のままになり、
 *   このログから接続先を知る経路が死ぬ。統合前の poker 側は実ポートを渡す形に
 *   なっており（旧 `apps/poker-sync/src/listening-log.ts`）、テストハーネスが
 *   この行から実ポートを読む契約に依存している。#95 S2 で timer 側をそちらへ揃えた。
 */
export function buildListeningLogFields(
  config: SyncConfig,
  port: number,
): Record<string, LogField> {
  return {
    port,
    loopbackOnly: isLoopbackHost(config.host),
    maxConn: config.maxConnections,
    maxRooms: config.maxRooms,
    heartbeatMs: config.heartbeatIntervalMs,
    heartbeatMaxMisses: config.heartbeatMaxMisses,
    requireClientAddress: config.requireClientAddress,
  };
}
