/**
 * `server.ts` の起動ログ（"listening" イベント）に出すフィールドを組み立てる
 * （#103 Task 7 レビュー S-3）。
 *
 * **純粋関数として切り出してある。** `server.ts` はエントリポイントであり、
 * import した時点で env 読み込み・実サーバーの起動という副作用が走るため、
 * そのままではテストプロセスを巻き込んでしまう（timer-sync の
 * `listening-log.ts` と同じ理由）。
 *
 * `requireClientAddress` / `loopbackOnly` を含めるのは、#66 で poker を
 * 初公開したとき、本番の fail-closed が実際に有効かを journal から確認する
 * 手段が無かったため。どちらも真偽値なのでログ衛生（ADR 0012 D3）には触れない。
 */
import { isLoopbackHost } from '@tasuki/rate-limit';
import type { PokerSyncConfig } from './config';

/**
 * @param port 実際に bind したポート。`config.port`（PORT=0 なら 0 のまま）ではなく
 *   `Bun.serve` が返す実ポートを渡すこと（テストハーネス helpers.ts の契約）。
 */
export function buildListeningLogFields(
  config: PokerSyncConfig,
  port: number,
): Record<string, number | boolean> {
  return {
    port,
    loopbackOnly: isLoopbackHost(config.host),
    requireClientAddress: config.requireClientAddress,
  };
}
